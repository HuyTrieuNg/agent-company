"""FastAPI Application Entry Point with App Factory and Dependency Injection."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import Settings, settings
from .core.container import AppContainer
from .core.container import container as default_container
from .core.logging import setup_logging
from .routers.chat import router as chat_router
from .routers.forex import router as forex_router
from .routers.gold import router as gold_router
from .routers.news import router as news_router
from .routers.preferences import router as preferences_router
from .routers.stock import router as stock_router

setup_logging(settings.log_level)
logger = logging.getLogger(__name__)


def create_app(
    app_container: AppContainer | None = None,
    app_settings: Settings | None = None,
) -> FastAPI:
    """Application factory that wires AppContainer and registers routes."""
    resolved_settings = app_settings or (app_container.settings if app_container else settings)
    resolved_container = app_container or AppContainer(resolved_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        logger.info("Initializing application resources via AppContainer...")
        await resolved_container.init_resources()
        logger.info("Agent Company API started successfully.")
        yield
        logger.info("Closing application resources...")
        await resolved_container.close_resources()
        logger.info("Agent Company API shut down.")

    app = FastAPI(
        title="Agent Company API",
        description="Multi-agent backend powered by Google Gemini & LangGraph",
        version="0.2.0",
        lifespan=lifespan,
    )

    app.state.container = resolved_container

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.allowed_origins,
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
    async def health_check() -> dict[str, str]:
        return {"status": "ok", "version": "0.2.0"}

    return app


# Default application instance for Uvicorn
app = create_app(default_container)
