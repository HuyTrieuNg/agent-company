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
from .db.database import init_db
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


# Ensure context directory exists
os.makedirs(settings.context_dir, exist_ok=True)

@app.on_event("startup")
async def startup_event() -> None:
    """Initialize DB and seed default data on startup."""
    await init_db()
    logger.info("Agent Company API started successfully")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0"}
