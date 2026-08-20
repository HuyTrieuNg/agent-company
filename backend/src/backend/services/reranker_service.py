"""Reranking service using a Cross-Encoder model running on CPU."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

logger = logging.getLogger(__name__)

RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"


class RerankerService:
    """Class-based reranker service managing CPU inference and cross-encoder lifecycle."""

    def __init__(
        self,
        model_name: str = RERANKER_MODEL_NAME,
        executor: ThreadPoolExecutor | None = None,
    ) -> None:
        self.model_name = model_name
        self.executor = executor or ThreadPoolExecutor(max_workers=2, thread_name_prefix="reranker")
        self._model: Any | None = None

    def get_cross_encoder(self) -> Any:
        """Lazy-load the CrossEncoder model."""
        if self._model is None:
            from sentence_transformers import CrossEncoder  # noqa: PLC0415

            logger.info(f"Loading Cross-Encoder model '{self.model_name}' on CPU...")
            self._model = CrossEncoder(self.model_name, device="cpu", max_length=512)
            logger.info("Cross-Encoder model loaded successfully.")
        return self._model

    def rerank_sync(
        self,
        query: str,
        docs: list[dict[str, Any]],
        top_k: int,
        score_threshold: float = -5.0,
    ) -> list[dict[str, Any]]:
        """Synchronous reranking running in a background thread."""
        if not docs:
            return docs

        model = self.get_cross_encoder()
        pairs = [[query, str(doc.get("text", ""))] for doc in docs]
        scores = model.predict(pairs, show_progress_bar=False)

        scored = sorted(
            [
                (float(s), d)
                for s, d in zip(scores, docs, strict=False)
                if float(s) >= score_threshold
            ],
            key=lambda x: x[0],
            reverse=True,
        )

        reranked = [doc for _, doc in scored[:top_k]]
        logger.info(
            f"Reranking: {len(docs)} candidates → {len(reranked)} kept (threshold={score_threshold}). "
            + (f"Top score: {scored[0][0]:.4f}" if scored else "No docs passed threshold.")
        )
        return reranked

    async def rerank_documents(
        self,
        query: str,
        docs: list[dict[str, Any]],
        top_k: int = 5,
        score_threshold: float = 0.0,
    ) -> list[dict[str, Any]]:
        """Async wrapper around CPU-bound reranker."""
        if not docs:
            return docs

        loop = asyncio.get_running_loop()
        try:
            reranked = await loop.run_in_executor(
                self.executor,
                self.rerank_sync,
                query,
                docs,
                top_k,
                score_threshold,
            )
            return reranked
        except Exception as e:
            logger.error(f"Reranking failed, returning original order: {e}", exc_info=True)
            return docs[:top_k]

    async def warmup(self) -> None:
        """Pre-load the Cross-Encoder model at startup."""
        try:
            await self.rerank_documents(
                query="warmup",
                docs=[{"text": "warmup document"}],
                top_k=1,
            )
            logger.info("Reranker warmup complete.")
        except Exception as e:
            logger.warning(f"Reranker warmup failed (non-fatal): {e}")


# Global default service instance
_default_reranker_service = RerankerService()


def _get_cross_encoder() -> Any:
    return _default_reranker_service.get_cross_encoder()


def _rerank_sync(
    query: str, docs: list[dict[str, Any]], top_k: int, score_threshold: float = -5.0
) -> list[dict[str, Any]]:
    return _default_reranker_service.rerank_sync(query, docs, top_k, score_threshold)


async def rerank_documents(
    query: str,
    docs: list[dict[str, Any]],
    top_k: int = 5,
    score_threshold: float = 0.0,
) -> list[dict[str, Any]]:
    """Module-level function for rerank_documents."""
    return await _default_reranker_service.rerank_documents(
        query=query,
        docs=docs,
        top_k=top_k,
        score_threshold=score_threshold,
    )


async def warmup_reranker() -> None:
    """Module-level function for warmup_reranker."""
    await _default_reranker_service.warmup()
