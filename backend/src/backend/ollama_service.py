"""Compatibility wrapper for backend.services.ollama_service."""

from .services.ollama_service import (
    OllamaService,
    generate_ollama_content,
    get_ollama_response,
)

__all__ = ["OllamaService", "generate_ollama_content", "get_ollama_response"]
