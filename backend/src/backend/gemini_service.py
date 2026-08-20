"""Compatibility wrapper for backend.services.gemini_service."""

from .services.gemini_service import (
    GEMINI_CALL_TIMEOUT,
    GEMINI_FAST_TIMEOUT,
    GeminiService,
    _build_contents,
    generate_gemini_content,
    generate_gemini_content_with_tools,
    get_gemini_client,
)

__all__ = [
    "GEMINI_CALL_TIMEOUT",
    "GEMINI_FAST_TIMEOUT",
    "GeminiService",
    "get_gemini_client",
    "generate_gemini_content",
    "generate_gemini_content_with_tools",
    "_build_contents",
]
