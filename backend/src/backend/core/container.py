"""Application Dependency Injection Container."""

import asyncio
import logging
import os

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.cache import TTLCache
from ..db.database import Database
from ..repositories.cache_repository import CacheRepository
from ..repositories.chat_repository import ChatRepository
from ..repositories.preference_repository import PreferenceRepository
from ..services.chat_service import ChatService
from ..services.forex_service import ForexService
from ..services.gemini_service import GeminiService
from ..services.gold_service import GoldService
from ..services.ollama_service import OllamaService
from ..services.qdrant_service import QdrantService, warmup_qdrant_embedders
from ..services.reranker_service import RerankerService
from ..services.sources_registry import SourcesRegistry
from ..services.stock_service import StockService
from .config import Settings, settings

logger = logging.getLogger(__name__)


class AppContainer:
    """Manages application-wide singletons, database connections, and service lifecycles."""

    def __init__(self, app_settings: Settings | None = None) -> None:
        self.settings: Settings = app_settings or settings

        # Storage & Connections
        self.db = Database(self.settings)
        self.ttl_cache: TTLCache[object] = TTLCache()
        self.http_client = httpx.AsyncClient(timeout=30.0)

        # Core Services
        self.sources_registry = SourcesRegistry()
        self.gemini_service = GeminiService(
            api_key=self.settings.gemini_api_key,
            default_fast_model=self.settings.gemini_model_fast,
            default_chat_model=self.settings.gemini_model_chat,
        )
        self.ollama_service = OllamaService(
            base_url=self.settings.ollama_base_url,
            default_model=self.settings.model_name,
            http_client=self.http_client,
        )
        self.reranker_service = RerankerService()
        self.qdrant_service = QdrantService(
            app_settings=self.settings,
            gemini_service=self.gemini_service,
            ollama_service=self.ollama_service,
            reranker_service=self.reranker_service,
            sources_reg=self.sources_registry,
        )
        self.stock_service = StockService(cache=self.ttl_cache)
        self.gold_service = GoldService(cache=self.ttl_cache, http_client=self.http_client)
        self.forex_service = ForexService(cache=self.ttl_cache, http_client=self.http_client)

        # Orchestrator
        self.chat_service = ChatService(
            gemini_service=self.gemini_service,
            ollama_service=self.ollama_service,
            qdrant_service=self.qdrant_service,
            stock_service=self.stock_service,
            gold_service=self.gold_service,
            forex_service=self.forex_service,
            sources_reg=self.sources_registry,
            app_settings=self.settings,
        )

    async def _background_warmup(self) -> None:
        """Warmup models and prefetch market data in background."""
        logger.info("Starting background warmup and prefetching in AppContainer...")
        try:
            await self.reranker_service.warmup()
            await warmup_qdrant_embedders()
            logger.info("AI models pre-loaded in memory successfully.")
        except Exception as e:
            logger.warning(f"AI model warmup warning: {e}")

        try:
            await self.gold_service.get_gold_overview()
            await self.forex_service.get_forex_overview()
            logger.info("Gold & Forex data pre-fetched into memory cache successfully.")
        except Exception as e:
            logger.warning(f"Gold/Forex pre-fetch warning: {e}")

        popular_symbols = ["VNINDEX", "FPT", "VNM", "HPG", "VIC", "TCB"]
        for sym in popular_symbols:
            try:
                await self.stock_service.get_stock_overview(sym)
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.warning(f"Stock pre-fetch warning for {sym}: {e}")
        logger.info("Popular stock symbols pre-fetched into memory cache successfully.")

    async def init_resources(self) -> None:
        """Initialize database, vector indexes, and launch background warmup."""
        os.makedirs(self.settings.context_dir, exist_ok=True)
        await self.db.init_db()
        await self.qdrant_service.ensure_payload_indexes()

        if self.settings.vnstock_api_key:
            os.environ["VNSTOCK_API_KEY"] = self.settings.vnstock_api_key
            logger.info("VNSTOCK_API_KEY has been configured.")

        asyncio.create_task(self._background_warmup())

    async def close_resources(self) -> None:
        """Clean up HTTP clients, database connections, and pools."""
        await self.http_client.aclose()
        await self.db.close()
        logger.info("AppContainer resources cleaned up.")

    def get_chat_repository(self, session: AsyncSession) -> ChatRepository:
        return ChatRepository(session)

    def get_preference_repository(self, session: AsyncSession) -> PreferenceRepository:
        return PreferenceRepository(session)

    def get_cache_repository(self, session: AsyncSession) -> CacheRepository:
        return CacheRepository(session, self.settings)


# Default container singleton
container = AppContainer(settings)
