import json
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    force=True,
)

from .routers.chat import router as chat_router
from .routers.research import router as research_router
from .db.database import init_db
from .db.models import SourceProfile
from .db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Agent Company API",
    description="Multi-agent backend powered by Google Gemini & LangGraph",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(research_router)


async def _seed_default_sources() -> None:
    """Synchronize source profiles in DB with default_sources.json."""
    profiles_path = os.path.join(
        os.path.dirname(__file__), "profiles", "default_sources.json"
    )
    if not os.path.exists(profiles_path):
        logger.warning("default_sources.json not found, skipping seed")
        return

    with open(profiles_path, "r", encoding="utf-8") as f:
        sources = json.load(f)

    json_source_ids = {s["id"] for s in sources}

    async with AsyncSessionLocal() as session:
        from sqlalchemy import select, delete
        
        # Get existing sources from DB
        result = await session.execute(select(SourceProfile))
        db_sources = result.scalars().all()
        db_source_ids = {s.id for s in db_sources}
        
        # 1. Delete sources in DB that are NOT in default_sources.json
        to_delete = db_source_ids - json_source_ids
        if to_delete:
            await session.execute(
                delete(SourceProfile).where(SourceProfile.id.in_(to_delete))
            )
            logger.info(f"Deleted obsolete sources from DB: {to_delete}")
            
        # 2. Insert or update sources from default_sources.json
        for s in sources:
            result = await session.execute(
                select(SourceProfile).where(SourceProfile.id == s["id"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.name = s["name"]
                existing.base_url = s["base_url"]
                existing.category = s.get("category", "economics")
                existing.language = s.get("language", "vi")
                existing.priority = s.get("priority", 5)
            else:
                new_src = SourceProfile(
                    id=s["id"],
                    name=s["name"],
                    base_url=s["base_url"],
                    category=s.get("category", "economics"),
                    language=s.get("language", "vi"),
                    is_active=True,
                    priority=s.get("priority", 5),
                )
                session.add(new_src)
                
        await session.commit()
        logger.info(f"Synchronized {len(sources)} sources from default_sources.json")


    # Ensure context directory exists
    os.makedirs(settings.context_dir, exist_ok=True)


@app.on_event("startup")
async def startup_event() -> None:
    """Initialize DB and seed default data on startup."""
    await init_db()
    await _seed_default_sources()
    logger.info("Agent Company API started successfully")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0"}
