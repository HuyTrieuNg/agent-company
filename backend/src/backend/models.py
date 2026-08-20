"""Compatibility wrapper for backend.schemas.chat."""

from .schemas.chat import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ChatSessionDetail,
    ChatSessionSummary,
    UserPreferenceSchema,
)

__all__ = [
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "ChatSessionSummary",
    "ChatSessionDetail",
    "UserPreferenceSchema",
]
