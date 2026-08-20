"""Qdrant Vector Database Service with hybrid dense + sparse retrieval and Cross-Encoder reranking."""

import asyncio
import json
import logging
import re
import sys
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from qdrant_client import QdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    Fusion,
    FusionQuery,
    MatchAny,
    MatchValue,
    PayloadSchemaType,
    Prefetch,
    SparseVector,
)

from ..core.config import Settings, settings
from .gemini_service import (
    GeminiService,
)
from .gemini_service import (
    generate_gemini_content as generate_gemini_content,
)
from .ollama_service import (
    OllamaService,
)
from .ollama_service import (
    generate_ollama_content as generate_ollama_content,
)
from .reranker_service import RerankerService, rerank_documents
from .sources_registry import SourcesRegistry, sources_registry

logger = logging.getLogger(__name__)

# Singletons for models to prevent reloading weights per request
_dense_embedder: Any = None
_sparse_embedder: Any = None
embedder: Any = None


def get_dense_embedder() -> Any:
    """Lazy-load SentenceTransformer dense embedder (singleton)."""
    global embedder, _dense_embedder
    if embedder is not None:
        return embedder
    if _dense_embedder is None:
        try:
            from sentence_transformers import SentenceTransformer

            logger.info(
                "Initializing SentenceTransformer embedder 'bkai-foundation-models/vietnamese-bi-encoder'..."
            )
            _dense_embedder = SentenceTransformer(
                "bkai-foundation-models/vietnamese-bi-encoder",
                trust_remote_code=True,
            )
            logger.info("SentenceTransformer embedder initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize embedder: {e}")
            _dense_embedder = None
    return _dense_embedder


def get_sparse_embedder() -> Any:
    """Lazy-load FastEmbed BM25 sparse embedder (singleton)."""
    global _sparse_embedder
    if _sparse_embedder is None:
        try:
            from fastembed import SparseTextEmbedding

            logger.info("Initializing FastEmbed BM25 sparse embedder 'Qdrant/bm25'...")
            _sparse_embedder = SparseTextEmbedding(model_name="Qdrant/bm25")
            logger.info("FastEmbed BM25 sparse embedder initialized successfully.")
        except Exception as e:
            logger.warning(f"FastEmbed BM25 sparse embedder not available: {e}")
            _sparse_embedder = None
    return _sparse_embedder


def _warmup_qdrant_embedders_sync() -> None:
    """Synchronous warmup for dense and sparse embedders."""
    e = get_dense_embedder()
    if e:
        e.encode("query: warmup")
    se = get_sparse_embedder()
    if se:
        list(se.embed(["warmup"]))


async def warmup_qdrant_embedders() -> None:
    """Async warmup for Qdrant embedders in background executor."""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, _warmup_qdrant_embedders_sync)
        logger.info("Qdrant embedders (Dense E5 & Sparse BM25) warmup complete.")
    except Exception as e:
        logger.warning(f"Qdrant embedders warmup failed (non-fatal): {e}")


def get_sparse_vector(text: str) -> SparseVector | None:
    """Generate BM25 sparse vector representation using FastEmbed."""
    embed_obj = get_sparse_embedder()
    if not embed_obj:
        return None
    try:
        results = list(embed_obj.embed([text]))
        if results:
            sparse_embedding = results[0]
            return SparseVector(
                indices=sparse_embedding.indices.tolist(),
                values=sparse_embedding.values.tolist(),
            )
    except Exception as e:
        logger.error(f"Failed to compute sparse vector for text: {e}")
    return None


def _remove_accents(text: str) -> str:
    """Xóa dấu tiếng Việt, chuyển về dạng không dấu chuẩn ASCII."""
    nfkd = unicodedata.normalize("NFKD", text)
    return (
        "".join(c for c in nfkd if not unicodedata.combining(c)).replace("đ", "d").replace("Đ", "D")
    )


def _slugify(text: str) -> str:
    """Chuẩn hoá thành slug: bỏ dấu, lowercase, chỉ giữ chữ/số/gạch."""
    s = _remove_accents(text).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def _tag_variants(tag: str) -> list[str]:
    """Sinh tất cả biến thể có thể của một tag để match với Qdrant payload."""
    variants: set[str] = set()
    variants.add(tag)
    variants.add(tag.lower())
    variants.add(tag.strip())
    no_accent = _remove_accents(tag)
    variants.add(no_accent)
    variants.add(no_accent.lower())
    slug = _slugify(tag)
    variants.add(slug)
    variants.add(slug.replace("-", ""))  # 'chungkhoan'
    variants.add(slug.replace("-", " "))  # 'chung khoan'
    return [v for v in variants if v]


def _normalise_slug(text: str) -> str:
    """Chuẩn hoá về slug để so sánh: bỏ dấu, bỏ gạch, lowercase."""
    return re.sub(r"[^a-z0-9]", "", _remove_accents(text).lower())


def _doc_tag_score(doc: dict[str, Any], query_tags: list[str]) -> float:
    """Heuristic score dựa trên mức độ overlap giữa query_tags và doc tags/categories."""
    if not query_tags:
        return 0.0

    doc_tag_pool: list[str] = []
    raw_tags: Any = doc.get("tags", [])
    if isinstance(raw_tags, list):
        doc_tag_pool.extend(str(x) for x in cast(list[Any], raw_tags))
    elif isinstance(raw_tags, str):
        doc_tag_pool.append(raw_tags)

    raw_cats: Any = doc.get("categories", doc.get("category", []))
    if isinstance(raw_cats, list):
        doc_tag_pool.extend(str(x) for x in cast(list[Any], raw_cats))
    elif isinstance(raw_cats, str):
        doc_tag_pool.append(raw_cats)

    title: str = str(doc.get("article_title") or doc.get("title") or "")
    doc_slugs = [_normalise_slug(t) for t in doc_tag_pool if t]
    title_slug = _normalise_slug(title)

    score = 0.0
    for qt in query_tags:
        qs = _normalise_slug(qt)
        if not qs:
            continue
        exact_match = any(qs == ds for ds in doc_slugs)
        partial_match = any(qs in ds or ds in qs for ds in doc_slugs)
        title_match = qs in title_slug

        if exact_match:
            score += 1.0
        elif partial_match:
            score += 0.5
        elif title_match:
            score += 0.3

    return score


def _doc_time_score(doc: dict[str, Any], reference_date: datetime | None = None) -> float:
    """Tính điểm độ mới của bài viết (0.0 → 1.0)."""
    if reference_date is None:
        reference_date = datetime.now()

    pub_str = doc.get("published_at")
    if not pub_str:
        return 0.2

    try:
        clean_pub = re.sub(r"Z$", "+00:00", str(pub_str).strip())
        if "+" in clean_pub or (clean_pub.count("-") == 3 and "T" in clean_pub):
            doc_date = datetime.fromisoformat(clean_pub)
            if doc_date.tzinfo is not None:
                doc_date = doc_date.astimezone(UTC).replace(tzinfo=None)
        else:
            doc_date = datetime.fromisoformat(clean_pub[:19])
    except Exception:
        try:
            doc_date = datetime.strptime(str(pub_str)[:10], "%Y-%m-%d")
        except Exception:
            return 0.2

    age_days = (reference_date - doc_date).total_seconds() / 86400.0
    if age_days < 0:
        age_days = 0.0

    if age_days <= 1.0:
        return 1.0
    elif age_days <= 7.0:
        return 0.7 + 0.3 * (1.0 - (age_days - 1.0) / 6.0)
    elif age_days <= 30.0:
        return 0.4 + 0.3 * (1.0 - (age_days - 7.0) / 23.0)
    else:
        return max(0.05, 0.4 * (0.5 ** ((age_days - 30.0) / 30.0)))


def _heuristic_rerank(
    docs: list[dict[str, Any]],
    query_tags: list[str],
    reference_date: datetime | None = None,
    tag_weight: float = 0.6,
    time_weight: float = 0.4,
    boost_weight: float = 0.15,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    """Rerank danh sách documents theo heuristic đa tiêu chí."""
    if not docs:
        return docs

    scored: list[tuple[float, dict[str, Any]]] = []
    for doc in docs:
        tag_sc = _doc_tag_score(doc, query_tags)
        time_sc = _doc_time_score(doc, reference_date)
        final_score = tag_weight * tag_sc + time_weight * time_sc + boost_weight * tag_sc
        scored.append((final_score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored]


class QdrantService:
    """Class-based service for vector and hybrid search in Qdrant."""

    def __init__(
        self,
        client: QdrantClient | None = None,
        app_settings: Settings | None = None,
        gemini_service: GeminiService | None = None,
        ollama_service: OllamaService | None = None,
        reranker_service: RerankerService | None = None,
        sources_reg: SourcesRegistry | None = None,
    ) -> None:
        self.settings = app_settings or settings
        self.client = client
        if self.client is None and self.settings.qdrant_url:
            try:
                self.client = QdrantClient(
                    url=self.settings.qdrant_url,
                    api_key=self.settings.qdrant_api_key if self.settings.qdrant_api_key else None,
                )
            except Exception as e:
                logger.error(f"Failed to initialize Qdrant client: {e}")
                self.client = None

        self.gemini_service = gemini_service
        self.ollama_service = ollama_service
        self.reranker_service = reranker_service
        self.sources_registry = sources_reg or sources_registry

    def _get_active_client(self) -> QdrantClient | None:
        if "qdrant_client" in sys.modules[__name__].__dict__:
            return sys.modules[__name__].__dict__["qdrant_client"]
        return self.client

    async def ensure_payload_indexes(self) -> None:
        """Tạo các payload index cần thiết trên collection Qdrant."""
        active_client = self._get_active_client()
        if not active_client:
            logger.warning("[Qdrant] Client not initialized, skipping payload index creation.")
            return

        collection = self.settings.qdrant_collection
        keyword_fields = ["site", "category", "tags", "chunk_type", "published_at", "url_hash"]

        for field in keyword_fields:
            try:
                active_client.create_payload_index(
                    collection_name=collection,
                    field_name=field,
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                logger.info(f"[Qdrant] Index created: {collection}.{field} (KEYWORD)")
            except Exception as exc:
                err_msg = str(exc).lower()
                if "already exists" in err_msg or "resource_already_exists" in err_msg:
                    logger.debug(f"[Qdrant] Index already exists: {collection}.{field}")
                else:
                    logger.warning(f"[Qdrant] Could not create index for '{field}': {exc}")

    async def extract_structured_query(
        self, user_input: str, conversation_context: str = ""
    ) -> dict[str, Any]:
        """Trích xuất structured filter (site, tags, date range, semantic_query) từ câu hỏi người dùng."""
        now = datetime.now()
        current_date_str = now.strftime("%Y-%m-%d")
        current_year = now.year

        sources_summary = self.sources_registry.get_sources_prompt_summary()

        system_instruction = (
            "Bạn là một hệ thống phân tích câu hỏi người dùng để trích xuất các bộ lọc tìm kiếm cho Vector Database.\n"
            f"Hôm nay là: {current_date_str} (Năm {current_year}).\n"
            "Nhiệm vụ của bạn là đọc câu hỏi của người dùng và trả về MỘT JSON OBJECT DUY NHẤT (không kèm markdown hay text giải thích) chứa các trường sau:\n"
            "- site: (string) Mã nguồn trang web (ví dụ: 'cafef', 'vneconomy', 'thesaigontimes', 'tuoitre', 'vnexpress', 'vietnamnet', 'vietstock', v.v.) nếu người dùng có nhắc đến hoặc yêu cầu rõ. Nếu không nhắc hoặc không chắc, để rỗng \"\".\n"
            f"{sources_summary}\n"
            "- tags: (list string) Danh sách các chủ đề, mã chứng khoán (ví dụ: 'VNM', 'HPG', 'FPT', 'chứng khoán', 'bất động sản', 'vàng', 'tỷ giá', v.v.) liên quan đến câu hỏi. Nếu không có để [].\n"
            "- date_from: (string YYYY-MM-DD hoặc rỗng \"\"): Ngày bắt đầu nếu người dùng hỏi theo mốc/khoảng thời gian. Ví dụ 'hôm nay' -> date_from là ngày hôm nay. 'tuần này' -> thứ Hai đầu tuần. 'tháng 3 năm 2026' -> '2026-03-01'. 'năm 2025' -> '2025-01-01'.\n"
            "- date_to: (string YYYY-MM-DD hoặc rỗng \"\"): Ngày kết thúc nếu người dùng hỏi theo khoảng thời gian. 'tháng 3 năm 2026' -> '2026-03-31'. 'năm 2025' -> '2025-12-31'. Nếu chỉ hỏi 1 ngày cụ thể thì date_to giống date_from hoặc để rỗng.\n"
            "- semantic_query: (string) Câu truy vấn ngữ nghĩa tối ưu để search vector (loại bỏ các từ filter như 'trên cafef', 'ngày hôm qua', chỉ giữ lại nội dung cốt lõi của câu hỏi).\n"
            "- needs_retrieval: (boolean) True nếu câu hỏi cần tra cứu dữ liệu/tin tức. False nếu chỉ là chào hỏi xã giao (như 'xin chào', 'bạn là ai', 'cảm ơn')."
        )

        user_prompt = f'Câu hỏi của người dùng: "{user_input}"'
        if conversation_context:
            user_prompt = f"Ngữ cảnh hội thoại trước đó:\n{conversation_context}\n\n" + user_prompt

        parsed_json: Any = None
        raw_text = ""

        gemini_fn = sys.modules[__name__].__dict__.get("generate_gemini_content", None)

        # 1. Try Gemini first
        gemini_svc = self.gemini_service or GeminiService(self.settings.gemini_api_key)
        if self.settings.gemini_api_key or gemini_fn is not None:
            try:
                if gemini_fn is not None:
                    raw_text = await gemini_fn(
                        api_key=self.settings.gemini_api_key,
                        contents=user_prompt,
                        model=self.settings.gemini_model_fast,
                        system_instruction=system_instruction,
                        temperature=0.0,
                    )
                else:
                    raw_text = await gemini_svc.generate_content(
                        contents=user_prompt,
                        model=self.settings.gemini_model_fast,
                        system_instruction=system_instruction,
                        temperature=0.0,
                    )
                if raw_text:
                    clean_text = raw_text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    elif clean_text.startswith("```"):
                        clean_text = clean_text[3:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    parsed_json = json.loads(clean_text.strip())
            except Exception as e:
                logger.warning(
                    f"[Qdrant] Gemini query extraction failed: {e}. Trying Ollama fallback..."
                )

        # 2. Fallback to Ollama
        if not parsed_json:
            ollama_fn = sys.modules[__name__].__dict__.get("generate_ollama_content", None)

            ollama_svc = self.ollama_service or OllamaService(
                self.settings.ollama_base_url, self.settings.model_name
            )
            try:
                if ollama_fn is not None:
                    raw_text = await ollama_fn(
                        prompt=user_prompt,
                        model=self.settings.model_name,
                        system_instruction=system_instruction,
                        json_format=True,
                    )
                else:
                    raw_text = await ollama_svc.generate_content(
                        contents=user_prompt,
                        system_instruction=system_instruction,
                        json_format=True,
                    )
                if raw_text:
                    parsed_json = json.loads(raw_text.strip())
            except Exception as e:
                logger.error(f"[Qdrant] Ollama query extraction failed: {e}")

        # Fallback default dict
        if not parsed_json or not isinstance(parsed_json, dict):
            parsed_json = {
                "site": "",
                "tags": [],
                "date_from": "",
                "date_to": "",
                "semantic_query": user_input,
                "needs_retrieval": True,
            }

        # Explicit cast so pyright knows the dict key/value types
        typed_json: dict[str, Any] = cast(dict[str, Any], parsed_json)

        # Normalize site code
        if typed_json.get("site"):
            raw_site = str(typed_json["site"]).lower().strip()
            typed_json["site"] = self.sources_registry.normalize_site(raw_site)

        logger.info(f"[Qdrant] Extracted Query: {typed_json}")
        return typed_json

    async def _enrich_with_full_article_chunks(
        self,
        top_chunks: list[dict[str, Any]],
        article_limit: int = 5,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """Làm giàu kết quả top-ranked chunks bằng cách lấy TẤT CẢ các chunk của các bài báo đã được chọn."""
        active_client = self._get_active_client()
        if not active_client or not top_chunks:
            return top_chunks

        seen_hashes: list[str] = []
        hash_to_chunks: dict[str, list[dict[str, Any]]] = {}
        for chunk in top_chunks:
            url_hash = str(chunk.get("url_hash", ""))
            if url_hash and url_hash not in seen_hashes:
                seen_hashes.append(url_hash)
                hash_to_chunks[url_hash] = []
            if not url_hash:
                hash_to_chunks.setdefault("__no_hash__", []).append(chunk)

        hashes_to_enrich = seen_hashes[:article_limit]
        collection = self.settings.qdrant_collection

        for url_hash in hashes_to_enrich:
            try:
                scroll_filter = Filter(
                    must=[
                        FieldCondition(
                            key="url_hash",
                            match=MatchValue(value=url_hash),
                        )
                    ]
                )
                scroll_result, _ = active_client.scroll(
                    collection_name=collection,
                    scroll_filter=scroll_filter,
                    limit=50,
                    with_payload=True,
                    with_vectors=False,
                )
                all_chunks = [pt.payload for pt in scroll_result if pt.payload]
                all_chunks.sort(key=lambda c: c.get("chunk_index", 0))
                hash_to_chunks[url_hash] = all_chunks
            except Exception as e:
                logger.warning(f"[Enrich] Failed to scroll chunks for url_hash={url_hash}: {e}")
                hash_to_chunks[url_hash] = [c for c in top_chunks if c.get("url_hash") == url_hash]

        enriched: list[dict[str, Any]] = []
        for url_hash in hashes_to_enrich:
            enriched.extend(hash_to_chunks.get(url_hash, []))
        enriched.extend(hash_to_chunks.get("__no_hash__", []))

        return enriched

    async def _relaxed_fallback_search(
        self,
        query_vector: list[float] | None,
        semantic_query: str = "",
        site: str = "",
        tags: list[str] | None = None,
        limit: int = 5,
        rerank: bool = True,
        sparse_vector: SparseVector | None = None,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """Thực hiện tìm kiếm với filter nới lỏng dần khi query gốc không có kết quả."""
        active_client = self._get_active_client()
        if not active_client or not query_vector:
            return []

        collection = self.settings.qdrant_collection
        retrieval_limit = (limit * 3) if rerank else limit

        tag_conditions: list[Any] = []
        if tags and len(tags) > 0:
            all_variants: list[str] = []
            for t in tags:
                all_variants.extend(_tag_variants(t))
            unique_variants = list(dict.fromkeys(v for v in all_variants if v))
            tag_conditions = [FieldCondition(key="tags", match=MatchAny(any=unique_variants))]

        site_condition: Any = None
        if site:
            site_condition = FieldCondition(key="site", match=MatchValue(value=site))

        fallback_strategies: list[tuple[list[Any], list[Any], str]] = [
            (
                [site_condition] if site_condition else [],
                tag_conditions,
                "site+tags (no date)",
            ),
            (
                [],
                tag_conditions,
                "tags only (no site, no date)",
            ),
            (
                [],
                [],
                "no filter (pure semantic)",
            ),
        ]

        for must_conds, should_conds, label in fallback_strategies:
            if not must_conds and not should_conds and label != "no filter (pure semantic)":
                continue

            relaxed_filter = None
            if must_conds or should_conds:
                relaxed_filter = Filter(
                    must=must_conds if must_conds else None,
                    should=should_conds if should_conds else None,
                )

            logger.info(f"[Fallback] Trying relaxed search with strategy: '{label}'")
            try:
                response = active_client.query_points(
                    collection_name=collection,
                    query=query_vector,
                    using="dense",
                    query_filter=relaxed_filter,
                    limit=retrieval_limit,
                    with_payload=True,
                    score_threshold=0.4,
                )
                candidates = [pt.payload for pt in response.points if pt.payload]
                if candidates:
                    if rerank and len(candidates) > 1:
                        rerank_fn = sys.modules[__name__].__dict__.get(
                            "rerank_documents", rerank_documents
                        )
                        results = await rerank_fn(
                            query=semantic_query,
                            docs=candidates,
                            top_k=limit,
                            score_threshold=0.0,
                        )
                    else:
                        results = candidates[:limit]

                    if results:
                        enrich_fn = sys.modules[__name__].__dict__.get(
                            "_enrich_with_full_article_chunks",
                            self._enrich_with_full_article_chunks,
                        )
                        results = await enrich_fn(
                            top_chunks=results,
                            article_limit=limit,
                        )
                    return results
            except Exception as e:
                logger.warning(f"[Fallback] Strategy '{label}' failed: {e}")

        return []

    async def search_articles(
        self,
        query: str,
        limit: int = 5,
        cached_articles: list[dict[str, Any]] | None = None,
        conversation_context: str = "",
    ) -> tuple[list[dict[str, Any]], bool]:
        """Tìm kiếm bài báo hybrid kết hợp semantic extraction, metadata filter, RRF fusion và Cross-Encoder reranking."""
        extract_fn = sys.modules[__name__].__dict__.get(
            "extract_structured_query", self.extract_structured_query
        )

        # 1. Trích xuất Structured Query
        sq = await extract_fn(query, conversation_context=conversation_context)
        if not sq.get("needs_retrieval", True):
            if cached_articles:
                logger.info(
                    f"[RAG] Skipping Qdrant — reusing {len(cached_articles)} cached articles (needs_retrieval=False)"
                )
                return cached_articles, False
            logger.info("[Qdrant] Query does not need retrieval.")
            return [], False

        active_client = self._get_active_client()
        if not active_client:
            logger.warning("[Qdrant] Client not initialized.")
            return [], False

        semantic_query = sq.get("semantic_query") or query
        site_filter = sq.get("site")
        raw_tags: Any = sq.get("tags") or []
        tags: list[str] = (
            [str(t) for t in cast(list[Any], raw_tags)] if isinstance(raw_tags, list) else []
        )
        date_from = sq.get("date_from")
        date_to = sq.get("date_to")

        # 2. Xây dựng Qdrant Filters
        must_conditions: list[Any] = []
        if site_filter:
            must_conditions.append(FieldCondition(key="site", match=MatchValue(value=site_filter)))

        if tags:
            tag_variations: list[str] = []
            for t in tags:
                tag_variations.extend(_tag_variants(t))
            if tag_variations:
                must_conditions.append(
                    FieldCondition(key="tags", match=MatchAny(any=tag_variations))
                )

        if date_from and date_to:
            try:
                dt_from = datetime.strptime(date_from, "%Y-%m-%d")
                dt_to = datetime.strptime(date_to, "%Y-%m-%d")
                if dt_from > dt_to:
                    dt_from, dt_to = dt_to, dt_from
                delta = (dt_to - dt_from).days
                date_list = [
                    (dt_from + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(delta + 1)
                ]
                must_conditions.append(
                    FieldCondition(key="published_at", match=MatchAny(any=date_list))
                )
            except ValueError:
                pass
        elif date_from:
            must_conditions.append(
                FieldCondition(key="published_at", match=MatchValue(value=date_from))
            )
        elif date_to:
            must_conditions.append(
                FieldCondition(key="published_at", match=MatchValue(value=date_to))
            )

        qdrant_filter = Filter(must=must_conditions) if must_conditions else None

        # 3. Tạo Embeddings
        embed_obj = get_dense_embedder()
        dense_vector: list[float] | None = None
        if embed_obj:
            prompt_query = f"query: {semantic_query}"
            res_vec = embed_obj.encode(prompt_query)
            dense_vector = res_vec.tolist() if hasattr(res_vec, "tolist") else list(res_vec)

        sparse_vector = get_sparse_vector(semantic_query)
        collection = self.settings.qdrant_collection

        # 4. Thực thi Hybrid Search
        candidate_points: list[Any] = []

        try:
            if dense_vector and sparse_vector:
                prefetch = [
                    Prefetch(
                        query=dense_vector,
                        using="dense",
                        filter=qdrant_filter,
                        limit=limit * 3,
                    ),
                    Prefetch(
                        query=sparse_vector,
                        using="sparse",
                        filter=qdrant_filter,
                        limit=limit * 3,
                    ),
                ]
                res = active_client.query_points(
                    collection_name=collection,
                    prefetch=prefetch,
                    query=FusionQuery(fusion=Fusion.RRF),
                    limit=limit * 2,
                    with_payload=True,
                )
                candidate_points = res.points
            elif dense_vector:
                res = active_client.query_points(
                    collection_name=collection,
                    query=dense_vector,
                    using="dense",
                    query_filter=qdrant_filter,
                    limit=limit * 2,
                    with_payload=True,
                )
                candidate_points = res.points
        except Exception as e:
            logger.warning(f"[Qdrant] Search error: {e}")

        # 5. Fallback nếu không có kết quả với filter chặt
        if not candidate_points:
            logger.info(
                "[Qdrant] No candidates found with strict filter. Attempting relaxed search..."
            )
            fallback_fn = sys.modules[__name__].__dict__.get(
                "_relaxed_fallback_search", self._relaxed_fallback_search
            )
            fallback_payloads = await fallback_fn(
                query_vector=dense_vector,
                semantic_query=semantic_query,
                site=site_filter or "",
                tags=tags,
                limit=limit,
                rerank=True,
            )
            if fallback_payloads:
                for doc in fallback_payloads:
                    doc["_is_fallback"] = True
                return fallback_payloads, True
            return [], True

        docs: list[dict[str, Any]] = [dict(pt.payload) for pt in candidate_points if pt.payload]

        if not docs:
            return [], False

        # Deduplicate docs by url_hash or article_url
        seen_urls: set[str] = set()
        unique_docs: list[dict[str, Any]] = []
        for d in docs:
            k = str(d.get("url_hash") or d.get("article_url") or "")
            if k and k not in seen_urls:
                seen_urls.add(k)
                unique_docs.append(d)
            elif not k:
                unique_docs.append(d)

        # 6. Rerank kết quả
        reranked_docs = unique_docs
        try:
            rerank_fn = sys.modules[__name__].__dict__.get("rerank_documents", rerank_documents)
            reranked_docs = await rerank_fn(query=semantic_query, docs=unique_docs, top_k=limit)
        except Exception as e:
            logger.warning(f"[Qdrant] Reranker failed, falling back to heuristic: {e}")
            reranked_docs = _heuristic_rerank(unique_docs, tags)[:limit]

        # 7. Enrich với full article body chunks
        enrich_fn = sys.modules[__name__].__dict__.get(
            "_enrich_with_full_article_chunks", self._enrich_with_full_article_chunks
        )
        final_docs = await enrich_fn(top_chunks=reranked_docs, article_limit=limit)
        return final_docs, True


# Global default service instance
_default_qdrant_service = QdrantService()
qdrant_client = _default_qdrant_service.client


async def ensure_payload_indexes() -> None:
    await _default_qdrant_service.ensure_payload_indexes()


async def extract_structured_query(
    user_input: str, conversation_context: str = ""
) -> dict[str, Any]:
    return await _default_qdrant_service.extract_structured_query(user_input, conversation_context)


async def search_articles(
    query: str,
    limit: int = 5,
    cached_articles: list[dict[str, Any]] | None = None,
    conversation_context: str = "",
) -> tuple[list[dict[str, Any]], bool]:
    return await _default_qdrant_service.search_articles(
        query=query,
        limit=limit,
        cached_articles=cached_articles,
        conversation_context=conversation_context,
    )


async def _enrich_with_full_article_chunks(
    top_chunks: list[dict[str, Any]],
    article_limit: int = 5,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    return await _default_qdrant_service._enrich_with_full_article_chunks(
        top_chunks=top_chunks, article_limit=article_limit, **kwargs
    )


async def _relaxed_fallback_search(
    query_vector: list[float] | None,
    semantic_query: str = "",
    site: str = "",
    tags: list[str] | None = None,
    limit: int = 5,
    rerank: bool = True,
    sparse_vector: SparseVector | None = None,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    return await _default_qdrant_service._relaxed_fallback_search(
        query_vector=query_vector,
        semantic_query=semantic_query,
        site=site,
        tags=tags or [],
        limit=limit,
        rerank=rerank,
        sparse_vector=sparse_vector,
        **kwargs,
    )
