"""FastAPI Dependency Injection providers."""

from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.container import AppContainer
from ..core.container import container as default_container
from ..repositories.chat_repository import ChatRepository
from ..repositories.preference_repository import PreferenceRepository
from ..services.chat_service import ChatService
from ..services.forex_service import ForexService
from ..services.gemini_service import GeminiService
from ..services.gold_service import GoldService
from ..services.ollama_service import OllamaService
from ..services.qdrant_service import QdrantService
from ..services.sources_registry import SourcesRegistry
from ..services.stock_service import StockService


def get_container(request: Request) -> AppContainer:
    """Retrieve AppContainer from FastAPI state if available, else default."""
    if hasattr(request.app.state, "container"):
        return request.app.state.container  # type: ignore[no-any-return]
    return default_container


async def get_db_session(
    c: AppContainer = Depends(get_container),
) -> AsyncGenerator[AsyncSession, None]:
    """Yield database session from container."""
    async for s in c.db.get_session():
        yield s


def get_chat_service(c: AppContainer = Depends(get_container)) -> ChatService:
    return c.chat_service


def get_stock_service(c: AppContainer = Depends(get_container)) -> StockService:
    return c.stock_service


def get_gold_service(c: AppContainer = Depends(get_container)) -> GoldService:
    return c.gold_service


def get_forex_service(c: AppContainer = Depends(get_container)) -> ForexService:
    return c.forex_service


def get_qdrant_service(c: AppContainer = Depends(get_container)) -> QdrantService:
    return c.qdrant_service


def get_gemini_service(c: AppContainer = Depends(get_container)) -> GeminiService:
    return c.gemini_service


def get_ollama_service(c: AppContainer = Depends(get_container)) -> OllamaService:
    return c.ollama_service


def get_sources_registry(c: AppContainer = Depends(get_container)) -> SourcesRegistry:
    return c.sources_registry


def get_chat_repository(
    session: AsyncSession = Depends(get_db_session),
    c: AppContainer = Depends(get_container),
) -> ChatRepository:
    return c.get_chat_repository(session)


def get_preference_repository(
    session: AsyncSession = Depends(get_db_session),
    c: AppContainer = Depends(get_container),
) -> PreferenceRepository:
    return c.get_preference_repository(session)
