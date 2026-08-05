import asyncio
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

from .db.database import init_db
from .qdrant_service import ensure_payload_indexes, warmup_qdrant_embedders
from .reranker_service import warmup_reranker
from .services.forex_service import get_forex_overview
from .services.gold_service import get_gold_overview
from .services.stock_service import get_stock_overview
from .routers.chat import router as chat_router
from .routers.forex import router as forex_router
from .routers.gold import router as gold_router
from .routers.news import router as news_router
from .routers.preferences import router as preferences_router
from .routers.stock import router as stock_router

logger = logging.getLogger(__name__)

# Ensure context directory exists
os.makedirs(settings.context_dir, exist_ok=True)


async def _background_warmup_all():
    """Warmup AI models & pre-fetch gold/forex/stock data in background to avoid blocking startup or hot-reload."""
    logger.info("Starting background warmup and prefetching...")

    # 1. Warmup AI Models in background threads
    try:
        await warmup_reranker()
        await warmup_qdrant_embedders()
        logger.info("All AI models pre-loaded in memory successfully.")
    except Exception as e:
        logger.warning(f"AI model background warmup warning: {e}")

    # 2. Prefetch Giá Vàng & Ngoại Tệ vào RAM cache
    try:
        await get_gold_overview()
        await get_forex_overview()
        logger.info("Gold & Forex data pre-fetched into memory cache successfully.")
    except Exception as e:
        logger.warning(f"Gold/Forex pre-fetch warning: {e}")

    # 3. Prefetch một vài mã chứng khoán phổ biến (tránh rate limit API)
    popular_symbols = ["VNINDEX", "FPT", "VNM", "HPG", "VIC", "TCB"]
    for symbol in popular_symbols:
        try:
            await get_stock_overview(symbol)
            await asyncio.sleep(0.5)  # Tránh vượt quá rate limit API
        except Exception as e:
            logger.warning(f"Stock pre-fetch warning for {symbol}: {e}")
    logger.info("Popular stock symbols pre-fetched into memory cache successfully.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    # --- Startup ---
    await init_db()
    # Tạo Qdrant payload indexes (idempotent — bỏ qua nếu đã tồn tại)
    await ensure_payload_indexes()

    # Cấu hình Vnstock API Key nếu có
    if settings.vnstock_api_key:
        os.environ["VNSTOCK_API_KEY"] = settings.vnstock_api_key
        logger.info("VNSTOCK_API_KEY has been configured.")

    # Khởi chạy non-blocking background task nạp model + prefetch dữ liệu
    asyncio.create_task(_background_warmup_all())

    logger.info("Agent Company API started successfully (hot-reload ready in < 0.5s)")

    yield  # Application runs here

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
app.include_router(stock_router)
app.include_router(gold_router)
app.include_router(forex_router)
app.include_router(preferences_router)
app.include_router(news_router)



@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0"}
