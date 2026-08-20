"""Routers package."""

from .chat import router as chat_router
from .forex import router as forex_router
from .gold import router as gold_router
from .news import router as news_router
from .preferences import router as preferences_router
from .stock import router as stock_router

__all__ = [
    "chat_router",
    "forex_router",
    "gold_router",
    "news_router",
    "preferences_router",
    "stock_router",
]
