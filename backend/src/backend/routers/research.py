"""Research Agent API: research sessions + source profile management + SSE streaming."""
import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import AsyncIterator

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from ..agents.research.graph import research_graph
from ..agents.research.state import ResearchState
from ..db.database import AsyncSessionLocal
from ..db.models import SourceProfile, ResearchSession
from ..db.cache import (
    create_research_session,
    get_research_session,
    update_research_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["research"])

# In-memory progress store: session_id → list of progress messages
_progress_store: dict[str, list[str]] = {}
_progress_events: dict[str, asyncio.Event] = {}


# ── Pydantic Schemas ───────────────────────────────────────────────────────────

class ResearchRequest(BaseModel):
    query: str


class FollowUpRequest(BaseModel):
    query: str


class SourceCreate(BaseModel):
    id: str
    name: str
    base_url: str
    category: str = "economics"
    language: str = "vi"
    priority: int = 5
    is_active: bool = True


class SourceUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    category: str | None = None
    language: str | None = None
    priority: int | None = None
    is_active: bool | None = None


# ── Research Endpoints ─────────────────────────────────────────────────────────

async def _run_research(session_id: str, query: str) -> None:
    """Background task: run the LangGraph research flow."""
    _progress_store[session_id] = []

    def emit(msg: str) -> None:
        _progress_store[session_id].append(msg)
        if session_id in _progress_events:
            _progress_events[session_id].set()

    try:
        emit("🚀 Bắt đầu nghiên cứu...")
        initial_state = ResearchState(
            query=query,
            session_id=session_id,
            intent={},
            selected_sources=[],
            cached_articles=[],
            sources_to_fetch=[],
            found_urls=[],
            raw_articles=[],
            relevant_articles=[],
            context_path="",
            report="",
            retry_count=0,
            error=None,
            progress_step="",
        )

        # Stream node outputs
        async for chunk in research_graph.astream(initial_state):
            for node_name, node_state in chunk.items():
                step = node_state.get("progress_step", "")
                if step:
                    emit(step)

        emit("✅ Hoàn thành!")

    except Exception as e:
        logger.error(f"[Research] Error in session {session_id}: {e}", exc_info=True)
        async with AsyncSessionLocal() as db_session:
            await update_research_session(
                db_session,
                session_id=session_id,
                status="error",
                error_message=str(e),
            )
        emit(f"❌ Lỗi: {str(e)}")


@router.post("/research")
async def start_research(
    request: ResearchRequest,
    background_tasks: BackgroundTasks,
):
    """Start an async research session. Returns session_id immediately."""
    session_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as db_session:
        await create_research_session(db_session, session_id, request.query)

    _progress_events[session_id] = asyncio.Event()
    background_tasks.add_task(_run_research, session_id, request.query)

    return {"session_id": session_id, "status": "running", "query": request.query}


@router.post("/research/{session_id}/followup/stream")
async def followup_research_stream(session_id: str, request: FollowUpRequest):
    """Stream a follow-up answer via SSE, synchronized with LangGraph.
    
    This runs a background LangGraph (followup_graph) which manages loading the context
    and generating the answer (with Gemini or Ollama). Tokens are sent to a queue
    and yielded via SSE.
    """
    import asyncio
    import json
    from ..agents.research.followup.followup_graph import followup_graph

    queue = asyncio.Queue()

    async def run_graph():
        try:
            initial_state = {
                "session_id": session_id,
                "query": request.query,
                "report_content": "",
                "context_content": "",
                "answer": "",
                "error": None,
                "stream_queue": queue
            }
            # Execute the LangGraph workflow
            async for _ in followup_graph.astream(initial_state):
                pass
        except Exception as e:
            await queue.put({"error": str(e)})

    # Start graph execution in the background
    asyncio.create_task(run_graph())

    async def event_generator():
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                # Keep-alive ping to prevent 503/504 proxy timeouts
                yield ": ping\n\n"
                continue

            if "error" in msg:
                yield f"data: {json.dumps({'error': msg['error']})}\n\n"
                break
            if msg.get("done"):
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            if "token" in msg:
                yield f"data: {json.dumps({'token': msg['token']})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )



@router.get("/research/{session_id}")
async def get_research_result(session_id: str):
    """Get the current status and result of a research session."""
    async with AsyncSessionLocal() as db_session:
        rs = await get_research_session(db_session, session_id)

    if not rs:
        raise HTTPException(status_code=404, detail="Session not found")

    return rs.to_dict()


@router.get("/research/{session_id}/stream")
async def stream_research_progress(session_id: str):
    """SSE endpoint: stream progress events for a research session."""

    async def event_generator() -> AsyncIterator[str]:
        sent_index = 0
        timeout_count = 0

        while True:
            messages = _progress_store.get(session_id, [])

            # Send any new messages
            while sent_index < len(messages):
                msg = messages[sent_index]
                yield f"data: {json.dumps({'step': msg, 'index': sent_index})}\n\n"
                sent_index += 1
                timeout_count = 0

                # Check if done
                if msg.startswith("✅") or msg.startswith("❌"):
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return

            # Wait for new progress or timeout
            event = _progress_events.get(session_id)
            if event:
                try:
                    await asyncio.wait_for(asyncio.shield(event.wait()), timeout=2.0)
                    event.clear()
                except asyncio.TimeoutError:
                    timeout_count += 1
                    # Keep-alive ping
                    yield ": ping\n\n"
                    if timeout_count > 60:  # 2min timeout
                        yield f"data: {json.dumps({'done': True, 'timeout': True})}\n\n"
                        return
            else:
                await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Source Profile Endpoints ───────────────────────────────────────────────────

@router.get("/sources")
async def list_sources():
    """List all source profiles ordered by priority."""
    async with AsyncSessionLocal() as db_session:
        result = await db_session.execute(
            select(SourceProfile).order_by(SourceProfile.priority.asc())
        )
        sources = result.scalars().all()
    return [s.to_dict() for s in sources]


@router.post("/sources", status_code=201)
async def create_source(body: SourceCreate):
    """Add a new source profile."""
    async with AsyncSessionLocal() as db_session:
        # Check duplicate
        existing = await db_session.get(SourceProfile, body.id)
        if existing:
            raise HTTPException(status_code=409, detail=f"Source '{body.id}' already exists")

        source = SourceProfile(
            id=body.id,
            name=body.name,
            base_url=body.base_url,
            category=body.category,
            language=body.language,
            is_active=body.is_active,
            priority=body.priority,
            created_at=datetime.utcnow(),
        )
        db_session.add(source)
        await db_session.commit()
        await db_session.refresh(source)
    return source.to_dict()


@router.put("/sources/{source_id}")
async def update_source(source_id: str, body: SourceUpdate):
    """Update an existing source profile."""
    async with AsyncSessionLocal() as db_session:
        source = await db_session.get(SourceProfile, source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        for field, value in body.model_dump(exclude_none=True).items():
            setattr(source, field, value)

        await db_session.commit()
        await db_session.refresh(source)
    return source.to_dict()


@router.patch("/sources/{source_id}/toggle")
async def toggle_source(source_id: str):
    """Toggle a source active/inactive."""
    async with AsyncSessionLocal() as db_session:
        source = await db_session.get(SourceProfile, source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        source.is_active = not source.is_active
        await db_session.commit()
        await db_session.refresh(source)
    return {"id": source.id, "is_active": source.is_active}


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(source_id: str):
    """Delete a source profile."""
    async with AsyncSessionLocal() as db_session:
        source = await db_session.get(SourceProfile, source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        await db_session.delete(source)
        await db_session.commit()
