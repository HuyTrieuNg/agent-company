"""Compatibility wrapper for backend.services.sources_registry."""

from .services.sources_registry import (
    SITE_ALIASES,
    SourcesRegistry,
    sources_registry,
)

__all__ = ["SourcesRegistry", "sources_registry", "SITE_ALIASES"]
