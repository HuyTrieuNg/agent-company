import logging
import os
from contextlib import asynccontextmanager

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
from .reranker_service import warmup_reranker
from .qdrant_service import ensure_payload_indexes

logger = logging.getLogger(__name__)

# Ensure context directory exists
os.makedirs(settings.context_dir, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    # --- Startup ---
    await init_db()
    # Tạo Qdrant payload indexes (idempotent — bỏ qua nếu đã tồn tại)
    await ensure_payload_indexes()
    # Pre-load Cross-Encoder model so first user request has no cold-start delay
    await warmup_reranker()
    logger.info("Agent Company API started successfully")

    yield  # Application runs here

    # --- Shutdown (thêm cleanup logic ở đây nếu cần) ---
    logger.info("Agent Company API shutting down")


app = FastAPI(
    title="Agent Company API",
    description="Multi-agent backend powered by Google Gemini & LangGraph",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0"}
