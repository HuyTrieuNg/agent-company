"""Compatibility wrapper for backend.services.reranker_service."""

from .services.reranker_service import (
    RERANKER_MODEL_NAME,
    RerankerService,
    _get_cross_encoder,
    _rerank_sync,
    rerank_documents,
    warmup_reranker,
)

__all__ = [
    "RERANKER_MODEL_NAME",
    "RerankerService",
    "rerank_documents",
    "warmup_reranker",
    "_get_cross_encoder",
    "_rerank_sync",
]
