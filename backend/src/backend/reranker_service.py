"""
Reranking service using a Cross-Encoder model that runs entirely on CPU.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2
- Size: ~80 MB (6-layer MiniLM)
- Device: CPU-only (no GPU required)
- Latency: ~5–20 ms per pair on modern CPU
- Task: pointwise relevance scoring (query, passage) → float score

The reranker runs in a thread pool executor to avoid blocking the asyncio
event loop and causing request timeouts.
"""
import asyncio
import logging
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Dedicated thread pool for CPU-bound reranking inference
_RERANK_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="reranker")

RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"


@lru_cache(maxsize=1)
def _get_cross_encoder():
    """
    Lazy-load the CrossEncoder model (cached as a singleton).
    Uses lru_cache so the model is loaded only once on first call.
    Configured for CPU execution with BAAI/bge-reranker-v2-m3.
    """
    from sentence_transformers import CrossEncoder  # noqa: PLC0415
    logger.info(f"Loading Cross-Encoder model '{RERANKER_MODEL_NAME}' on CPU...")
    model = CrossEncoder(RERANKER_MODEL_NAME, device="cpu", max_length=512)
    logger.info("Cross-Encoder model loaded successfully.")
    return model


def _rerank_sync(query: str, docs: list[dict], top_k: int, score_threshold: float = -5.0) -> list[dict]:
    """
    Synchronous reranking — runs in a background thread.

    Args:
        query:           The user's semantic query string.
        docs:            List of payload dicts from Qdrant (each must have a 'text' field).
        top_k:           Number of top documents to return after reranking.
        score_threshold: Cross-Encoder score cutoff. Documents scoring below this
                         are dropped even if they are in the top_k.
                         ms-marco-MiniLM scores typically range from -10 to +10;
                         scores > 0 indicate genuine relevance.

    Returns:
        Reranked list of payload dicts (best first), truncated to top_k.
    """
    if not docs:
        return docs

    model = _get_cross_encoder()

    # Build (query, passage) pairs — CrossEncoder expects list of [str, str]
    pairs = [[query, doc.get("text", "")] for doc in docs]

    # predict() returns numpy array of float scores
    scores = model.predict(pairs, show_progress_bar=False)

    # Attach score, filter by threshold, sort descending
    scored = sorted(
        [(s, d) for s, d in zip(scores, docs) if float(s) >= score_threshold],
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
    query: str,
    docs: list[dict],
    top_k: int = 5,
    score_threshold: float = 0.0,
) -> list[dict]:
    """
    Async wrapper around the CPU-bound reranker.

    Args:
        query:           The original user query (or refined semantic query).
        docs:            Candidate documents retrieved from Qdrant.
        top_k:           How many top documents to return.
        score_threshold: Cross-Encoder score cutoff (default 0.0).
                         Set to 0.0 to keep only genuinely relevant docs.

    Returns:
        Reranked list of documents, best-first, limited to top_k.
    """
    if not docs:
        return docs

    loop = asyncio.get_event_loop()
    try:
        reranked = await loop.run_in_executor(
            _RERANK_EXECUTOR,
            _rerank_sync,
            query,
            docs,
            top_k,
            score_threshold,
        )
        return reranked
    except Exception as e:
        logger.error(f"Reranking failed, returning original order: {e}", exc_info=True)
        # Graceful fallback: return first top_k docs in original retrieval order
        return docs[:top_k]


async def warmup_reranker() -> None:
    """
    Pre-load the Cross-Encoder model at startup so the first real request
    does not pay the cold-start cost (~1–3 seconds).
    Call this from the FastAPI lifespan/startup event.
    """
    try:
        await rerank_documents(
            query="warmup",
            docs=[{"text": "warmup document"}],
            top_k=1,
        )
        logger.info("Reranker warmup complete.")
    except Exception as e:
        logger.warning(f"Reranker warmup failed (non-fatal): {e}")
