"""Chat API router with thin handlers delegating to ChatService and ChatRepository."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..repositories.chat_repository import ChatRepository
from ..repositories.preference_repository import PreferenceRepository
from ..schemas.chat import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ChatSessionDetail,
    ChatSessionSummary,
)
from ..services.chat_service import (
    TOOL_DECLARATIONS,
    ChatService,
    _build_conversation_context,
    _format_relative_date,
)
from ..services.gemini_service import generate_gemini_content_with_tools
from ..services.qdrant_service import search_articles
from .deps import get_chat_repository, get_chat_service, get_preference_repository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


# Re-exports and helper tool executor for backward compatibility with existing tests
async def execute_tool(name: str, args: dict[str, Any]) -> str:
    from ..core.container import container

    return await container.chat_service.execute_tool(name, args)


@router.get("/sessions", response_model=list[ChatSessionSummary])
async def list_sessions(
    chat_repo: ChatRepository = Depends(get_chat_repository),
) -> list[ChatSessionSummary]:
    """Lấy danh sách tất cả các phiên chat."""
    sessions = await chat_repo.list_sessions()
    return [
        ChatSessionSummary(
            id=s.id,
            title=s.title,
            created_at=s.created_at.isoformat() if s.created_at else None,
            updated_at=s.updated_at.isoformat() if s.updated_at else None,
        )
        for s in sessions
    ]


@router.post("/sessions", response_model=ChatSessionSummary)
async def create_session(
    chat_repo: ChatRepository = Depends(get_chat_repository),
) -> ChatSessionSummary:
    """Tạo một phiên chat mới."""
    session_obj = await chat_repo.create_session()
    return ChatSessionSummary(
        id=session_obj.id,
        title=session_obj.title,
        created_at=session_obj.created_at.isoformat() if session_obj.created_at else None,
        updated_at=session_obj.updated_at.isoformat() if session_obj.updated_at else None,
    )


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_session_detail(
    session_id: str,
    chat_repo: ChatRepository = Depends(get_chat_repository),
) -> ChatSessionDetail:
    """Lấy thông tin chi tiết và danh sách tin nhắn của 1 phiên chat."""
    session_obj = await chat_repo.get_session(session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Phiên chat không tồn tại")

    messages = await chat_repo.get_messages(session_id)
    return ChatSessionDetail(
        id=session_obj.id,
        title=session_obj.title,
        created_at=session_obj.created_at.isoformat() if session_obj.created_at else None,
        updated_at=session_obj.updated_at.isoformat() if session_obj.updated_at else None,
        messages=[ChatMessage(role=m.role, content=m.content) for m in messages],
    )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    chat_repo: ChatRepository = Depends(get_chat_repository),
) -> dict[str, str]:
    """Xóa một phiên chat và các tin nhắn liên quan."""
    await chat_repo.delete_session(session_id)
    return {"status": "ok", "message": "Đã xóa phiên chat"}


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    chat_service: ChatService = Depends(get_chat_service),
    chat_repo: ChatRepository = Depends(get_chat_repository),
    pref_repo: PreferenceRepository = Depends(get_preference_repository),
) -> ChatResponse:
    """
    Chat endpoint with Gemini Function Calling (Tool Use).
    AI tự quyết định khi nào cần gọi tools để tra cứu dữ liệu.
    Tự động lưu lịch sử vào SQLite DB và áp dụng Context Preference của người dùng.
    """
    try:
        return await chat_service.process_chat(
            request=request,
            chat_repo=chat_repo,
            pref_repo=pref_repo,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error in chat endpoint: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


__all__ = [
    "router",
    "_build_conversation_context",
    "_format_relative_date",
    "TOOL_DECLARATIONS",
    "execute_tool",
    "search_articles",
    "generate_gemini_content_with_tools",
]
