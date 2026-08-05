import logging
import json
import unicodedata
import re
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue, MatchAny, PayloadSchemaType, ScrollRequest,
    SparseVector, Prefetch, FusionQuery, Fusion, VectorParams, Distance, SparseVectorParams
)

from .config import settings
from .gemini_service import generate_gemini_content, GEMINI_FAST_TIMEOUT
from .ollama_service import generate_ollama_content
from .reranker_service import rerank_documents
from .sources_registry import sources_registry

logger = logging.getLogger(__name__)

import asyncio
from functools import lru_cache

# Singletons for Dense and Sparse Embedders (Lazy-loaded)
_embedder = None
_sparse_embedder = None


def get_dense_embedder():
    """Lazy-load SentenceTransformer dense embedder (singleton)."""
    global _embedder
    if _embedder is None:
        try:
            logger.info("Initializing SentenceTransformer model 'intfloat/multilingual-e5-small'...")
            _embedder = SentenceTransformer("intfloat/multilingual-e5-small")
            logger.info("SentenceTransformer model initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize embedder: {e}")
            _embedder = None
    return _embedder


def get_sparse_embedder():
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


def _warmup_qdrant_embedders_sync():
    """Synchronous warmup for dense and sparse embedders."""
    e = get_dense_embedder()
    if e:
        e.encode("query: warmup")
    se = get_sparse_embedder()
    if se:
        list(se.embed(["warmup"]))


async def warmup_qdrant_embedders() -> None:
    """Async warmup for Qdrant embedders in background executor."""
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _warmup_qdrant_embedders_sync)
        logger.info("Qdrant embedders (Dense E5 & Sparse BM25) warmup complete.")
    except Exception as e:
        logger.warning(f"Qdrant embedders warmup failed (non-fatal): {e}")


def get_sparse_vector(text: str) -> SparseVector | None:
    """Tạo sparse vector (BM25) từ text cho Qdrant Hybrid Search."""
    se = get_sparse_embedder()
    if not se or not text:
        return None
    try:
        embeddings = list(se.embed([text]))
        if embeddings:
            emb = embeddings[0]
            return SparseVector(
                indices=emb.indices.tolist(),
                values=emb.values.tolist(),
            )
    except Exception as e:
        logger.warning(f"Error computing sparse vector: {e}")
    return None


# Initialize Qdrant Client
try:
    if settings.qdrant_url:
        qdrant_client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key if settings.qdrant_api_key else None
        )
    else:
        qdrant_client = None
except Exception as e:
    logger.error(f"Failed to initialize Qdrant client: {e}")
    qdrant_client = None


# ---------------------------------------------------------------------------
# Tag / category normalisation helpers
# ---------------------------------------------------------------------------

def _remove_accents(text: str) -> str:
    """Bỏ dấu tiếng Việt: 'kinh tế' → 'kinh te'."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _slugify(text: str) -> str:
    """Chuẩn hoá thành slug: bỏ dấu, lowercase, chỉ giữ chữ/số/gạch."""
    s = _remove_accents(text).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def _tag_variants(tag: str) -> list[str]:
    """
    Sinh tất cả biến thể có thể của một tag để match với Qdrant payload.

    Ví dụ:
        'Kinh tế'    → ['Kinh tế', 'kinh tế', 'kinh te', 'kinh-te', ...]
        'tai-chinh'  → nhiều dạng slug/no-accent
    """
    variants: set[str] = set()
    variants.add(tag)
    variants.add(tag.lower())
    variants.add(tag.strip())
    no_accent = _remove_accents(tag)
    variants.add(no_accent)
    variants.add(no_accent.lower())
    slug = _slugify(tag)
    variants.add(slug)
    variants.add(slug.replace("-", ""))   # 'chungkhoan'
    variants.add(slug.replace("-", " "))  # 'chung khoan'
    return [v for v in variants if v]


def _normalise_slug(text: str) -> str:
    """Chuẩn hoá về slug để so sánh: bỏ dấu, bỏ gạch, lowercase."""
    return _remove_accents(text).lower().replace("-", "").replace(" ", "")


def _doc_tag_score(doc: dict, query_tags: list[str]) -> float:
    """
    Heuristic score dựa trên mức độ overlap giữa query_tags và doc tags/categories.

    - So sánh slug-normalised để bỏ qua sự khác biệt dấu, gạch, hoa/thường.
    - Mỗi tag match chính xác → +1.0.  Partial match → +0.5.  Tìm thấy trong title → +0.3.
    """
    if not query_tags:
        return 0.0

    doc_tag_pool: list[str] = []
    raw_tags = doc.get("tags", [])
    if isinstance(raw_tags, list):
        doc_tag_pool.extend(raw_tags)
    elif isinstance(raw_tags, str):
        doc_tag_pool.append(raw_tags)

    raw_cats = doc.get("categories", doc.get("category", []))
    if isinstance(raw_cats, list):
        doc_tag_pool.extend(raw_cats)
    elif isinstance(raw_cats, str):
        doc_tag_pool.append(raw_cats)

    title = doc.get("article_title", doc.get("title", ""))
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


def _doc_time_score(doc: dict, reference_date: datetime | None = None) -> float:
    """
    Tính điểm ưu tiên theo độ mới của thời gian xuất bản (Recency Boost).
    
    Tỷ lệ điểm:
    - Trong 24 giờ (<= 1 ngày): 1.0
    - Trong 3 ngày (<= 3 ngày): 0.8
    - Trong 7 ngày (<= 7 ngày): 0.6
    - Trong 30 ngày (<= 30 ngày): 0.3
    - Cũ hơn 30 ngày: 0.1
    """
    pub_str = doc.get("published_at", "")
    if not pub_str:
        return 0.0

    try:
        dt_pub = datetime.strptime(str(pub_str)[:10], "%Y-%m-%d")
        now = reference_date or datetime.now()
        days_old = (now - dt_pub).days

        if days_old <= 1:
            return 1.0
        elif days_old <= 3:
            return 0.8
        elif days_old <= 7:
            return 0.6
        elif days_old <= 30:
            return 0.3
        else:
            return 0.1
    except Exception:
        return 0.0


def _heuristic_rerank(
    docs: list[dict],
    query_tags: list[str],
    tag_weight: float = 0.2,
    time_weight: float = 0.25,
    boost_weight: float | None = None,
) -> list[dict]:
    """
    Heuristic rerank kết hợp:
    1. Cross-Encoder Rerank rank score (nền tảng)
    2. Tag Overlap Score
    3. Time Recency Score (ưu tiên tin tức mới đăng)
    """
    if not docs:
        return docs

    if boost_weight is not None:
        tag_weight = boost_weight

    n = len(docs)
    # Rank scores decay gently (1.0 down to 0.85) so time recency boost can promote recent news over older candidates
    rank_scores = [1.0 - (0.15 * i / max(n - 1, 1)) for i in range(n)]
    tag_scores = [_doc_tag_score(doc, query_tags) for doc in docs]
    time_scores = [_doc_time_score(doc) for doc in docs]

    max_tag = max(tag_scores) if any(s > 0 for s in tag_scores) else 1.0
    tag_scores_norm = [s / max_tag if max_tag > 0 else 0.0 for s in tag_scores]

    combined = [
        (i, rs + (tag_weight * ts_norm) + (time_weight * tm))
        for i, (rs, ts_norm, tm) in enumerate(zip(rank_scores, tag_scores_norm, time_scores))
    ]
    combined.sort(key=lambda x: x[1], reverse=True)
    reranked = [docs[i] for i, _ in combined]

    original_order = list(range(n))
    new_order = [i for i, _ in combined]
    if original_order != new_order:
        logger.info(
            f"[HeuristicRerank] Boost changed order: {original_order} → {new_order} "
            f"(query_tags={query_tags}, tag_scores={[round(s, 2) for s in tag_scores]}, "
            f"time_scores={[round(s, 2) for s in time_scores]})"
        )
    return reranked


async def ensure_payload_indexes() -> None:
    """
    Tạo payload index cho các field cần filter / range query trong Qdrant.
    Tự động khởi tạo Hybrid Collection (Dense + Sparse) nếu collection chưa tồn tại.
    Hàm này idempotent: nếu index/collection đã tồn tại thì Qdrant bỏ qua, không báo lỗi.
    """
    if not qdrant_client:
        return
    collection = settings.qdrant_collection

    # 1. Kiểm tra collection tồn tại, nếu chưa có thì tạo mới dạng Hybrid (Dense + Sparse)
    try:
        if not qdrant_client.collection_exists(collection_name=collection):
            logger.info(f"[Qdrant] Collection '{collection}' does not exist. Creating Hybrid collection...")
            qdrant_client.create_collection(
                collection_name=collection,
                vectors_config={
                    "dense": VectorParams(size=384, distance=Distance.COSINE)
                },
                sparse_vectors_config={
                    "sparse": SparseVectorParams()
                }
            )
            logger.info(f"[Qdrant] Hybrid collection '{collection}' created successfully.")
    except Exception as create_err:
        logger.warning(f"[Qdrant] Failed to check/create collection '{collection}': {create_err}")

    # 2. Đảm bảo các payload indexes (Bao gồm url_hash, chunk_type, category để phục vụ scroll filter)
    indexes = [
        ("published_at", PayloadSchemaType.KEYWORD),  # lưu dạng string 'YYYY-MM-DD'
        ("site",         PayloadSchemaType.KEYWORD),
        ("tags",         PayloadSchemaType.KEYWORD),
        ("url_hash",     PayloadSchemaType.KEYWORD),
        ("chunk_type",   PayloadSchemaType.KEYWORD),  # Phục vụ lọc bài báo đại diện
        ("category",     PayloadSchemaType.KEYWORD),  # Phục vụ lọc theo danh mục
    ]
    for field_name, schema_type in indexes:
        try:
            qdrant_client.create_payload_index(
                collection_name=collection,
                field_name=field_name,
                field_schema=schema_type,
            )
            logger.info(f"[Qdrant] Payload index ensured: '{field_name}' ({schema_type})")
        except Exception as e:
            err = str(e).lower()
            if "already exists" in err or "conflict" in err:
                logger.debug(f"[Qdrant] Index '{field_name}' already exists, skipping.")
            else:
                logger.warning(f"[Qdrant] Could not create index for '{field_name}': {e}")



async def extract_structured_query(user_input: str, conversation_context: str = "") -> dict:
    """
    Phân tích câu hỏi và trả về structured query dạng JSON.

    Args:
        user_input:           Câu hỏi của người dùng.
        conversation_context: Tóm tắt ngắn về các chủ đề/bài báo đã retrieve trước đó.
                              Dùng để LLM quyết định `needs_retrieval`, `exclude_sites`, `target_sites`.

    Returns:
        dict với các trường: site, target_sites, exclude_sites, tags, date_from, date_to, semantic_query, needs_retrieval.
    """
    user_clean = user_input.strip().lower()
    # Fast heuristic check cho chitchat / chào hỏi / cảm ơn đơn giản
    chitchat_phrases = {
        "chào", "xin chào", "hello", "hi", "cảm ơn", "cam on", "thanks", "tốt quá", "ok", "okay",
        "bạn là ai", "bạn là ai?", "bạn có thể làm gì", "bạn làm được gì", "tạm biệt", "bye", "giúp tôi", "giúp tôi với"
    }
    if user_clean in chitchat_phrases or (len(user_clean.split()) <= 2 and user_clean in chitchat_phrases):
        logger.info(f"Fast-path chitchat detected for: '{user_input}' -> needs_retrieval=False")
        return {"semantic_query": user_input, "needs_retrieval": False}

    today = datetime.now().strftime("%Y-%m-%d")
    sources_summary = sources_registry.get_sources_prompt_summary()

    # Phần hướng dẫn về needs_retrieval & source filtering — chỉ thêm khi có context trước đó
    context_hint = ""
    if conversation_context:
        context_hint = (
            f"\n\nNGỮ CẢNH HỘI THOẠI & BÀI BÁO ĐÃ GHIM TRƯỚC ĐÓ:\n{conversation_context}\n\n"
            "Dựa vào ngữ cảnh hội thoại và bài báo đã có trên, hãy phân tích kỹ nhu cầu tìm kiếm:\n"
            "- Nếu câu hỏi là câu hỏi nối tiếp (follow-up), làm rõ, giải thích thêm, tóm tắt, so sánh hoặc hỏi chi tiết về nội dung ĐÃ CÓ trong ngữ cảnh/bài báo đã ghim:\n"
            "  + ĐẶT `needs_retrieval` = false (tuyệt đối không tìm kiếm lại dữ liệu mới từ DB).\n"
            "- Nếu người dùng hỏi câu dạng 'Các nguồn khác thì sao?', 'Báo khác nói gì?', 'Còn các trang khác?':\n"
            "  + ĐẶT `needs_retrieval` = true.\n"
            "  + Liệt kê tên các trang web ĐÃ XUẤT HIỆN trong ngữ cảnh trước đó vào danh sách `exclude_sites` (ví dụ: ['cafef']).\n"
            "  + Giữ nguyên `semantic_query` là chủ đề cốt lõi đang thảo luận ở các lượt trước.\n"
            "- Nếu người dùng yêu cầu rõ ràng muốn TÌM BÀI BÁO MỚI, nguồn tin mới, hoặc khoảng thời gian khác:\n"
            "  + ĐẶT `needs_retrieval` = true.\n\n"
        )

    # Hướng dẫn nghiêm ngặt cho tool calls và chitchat
    tool_and_chitchat_hint = (
        "- Nếu câu hỏi là CHÀO HỎI / XÃ GIAO / GIAO TIẾP THÔNG THƯỜNG ('xin chào', 'bạn là ai', 'cảm ơn', 'hôm nay thế nào', 'giúp tôi với', v.v.):\n"
        "  + ĐẶT `needs_retrieval` = false.\n"
        "- Nếu câu hỏi thuần túy về DỮ LIỆU TÀI CHÍNH / CÔNG CỤ TOOL CALL (giá cổ phiếu, biểu đồ, lịch sử giao dịch, "
        "báo cáo tài chính, P/E, EPS, MACD, RSI, giá vàng SJC, tỷ giá ngoại tệ USD/EUR/JPY, v.v.) và KHÔNG HỎI VỀ BÀI BÁO TIN TỨC:\n"
        "  + ĐẶT `needs_retrieval` = false (hệ thống có tool API riêng để lấy dữ liệu số realtime, không cần search bài báo).\n"
        "- Nếu câu hỏi yêu cầu giải thích khái niệm tổng quát, lập trình, tư vấn chung không liên quan đến bài báo cụ thể:\n"
        "  + ĐẶT `needs_retrieval` = false.\n"
    )

    system_prompt = (
        f"Hôm nay là ngày {today}.\n"
        f"{sources_summary}\n\n"
        "Bạn là chuyên gia phân tích truy vấn tìm kiếm ngữ nghĩa (semantic search). "
        "Nhiệm vụ: trích xuất thông tin từ câu hỏi và trả về JSON theo đúng cấu trúc bên dưới. "
        "KHÔNG thêm bất kỳ trường nào khác.\n\n"
        "QUY TẮC QUAN TRỌNG cho trường 'semantic_query':\n"
        "- Viết lại thành một MÔ TẢ NỘI DUNG súc tích, KHÔNG phải câu hỏi hay yêu cầu.\n"
        "- TUYỆT ĐỐI KHÔNG dùng các từ nhiễu: 'tin tức', 'tin mới', 'thông tin', 'cho tôi biết', "
        "'có gì', 'như thế nào', 'tình hình', 'cập nhật', 'mới nhất', 'hỏi về', 'cho tôi xem', 'các nguồn khác', 'báo khác'.\n"
        "- Tập trung vào CHỦ THỂ và SỰ KIỆN cốt lõi — những từ xuất hiện trong nội dung bài báo.\n"
        "- Không bao gồm thông tin về website hay khoảng thời gian.\n\n"
        "VÍ DỤ (few-shot):\n"
        "  Input:  'Xin chào bạn'\n"
        "  Output: {\"semantic_query\": \"xin chào\", \"needs_retrieval\": false}\n\n"
        "  Input:  'Giá cổ phiếu FPT hôm nay bao nhiêu?'\n"
        "  Output: {\"semantic_query\": \"giá cổ phiếu FPT\", \"needs_retrieval\": false}\n\n"
        "  Input:  'Cập nhật giá vàng SJC hôm nay'\n"
        "  Output: {\"semantic_query\": \"giá vàng SJC\", \"needs_retrieval\": false}\n\n"
        "  Input:  'Báo cáo tài chính quý 1 của HPG thế nào?'\n"
        "  Output: {\"semantic_query\": \"báo cáo tài chính HPG\", \"needs_retrieval\": false}\n\n"
        "  Input:  'Tin tức biến động giá vàng 2 ngày nay'\n"
        "  Output: {\"semantic_query\": \"giá vàng biến động\", \"needs_retrieval\": true}\n\n"
        "  Input:  'Có bài báo nào nói về Bitcoin trên Saigon Times không?'\n"
        "  Output: {\"semantic_query\": \"Bitcoin tiền mã hóa\", \"target_sites\": [\"thesaigontimes\"], \"needs_retrieval\": true}\n\n"
        "  Input:  'Tóm tắt thêm thông tin này cho tôi' (Đã có bài viết ở ngữ cảnh trước)\n"
        "  Output: {\"semantic_query\": \"tóm tắt thông tin\", \"needs_retrieval\": false}\n\n"
        "  Input:  'Các nguồn khác nói gì về vấn đề này?' (Ngữ cảnh cũ đã dùng cafef)\n"
        "  Output: {\"semantic_query\": \"<chủ đề cũ>\", \"exclude_sites\": [\"cafef\"], \"needs_retrieval\": true}\n\n"
        + tool_and_chitchat_hint
        + context_hint
        + "CẤU TRÚC JSON:\n"
        "{\n"
        "  \"site\": \"tên 1 trang web nếu người dùng chỉ định duy nhất (ví dụ: cafef, thesaigontimes, vneconomy), để trống nếu không\",\n"
        "  \"target_sites\": [\"danh sách mã trang web muốn tìm cụ thể (như 'cafef', 'thesaigontimes', 'vneconomy')\"],\n"
        "  \"exclude_sites\": [\"danh sách mã trang web CẦN LOẠI TRỪ khi hỏi 'các nguồn khác' (ví dụ: ['cafef'])\"],\n"
        "  \"tags\": [\"tối đa 3 chủ đề, tiếng Việt CÓ DẤU (ví dụ: 'kinh tế', 'tài chính')\"],\n"
        "  \"date_from\": \"YYYY-MM-DD nếu người dùng đề cập khoảng thời gian, để trống nếu không\",\n"
        "  \"date_to\": \"YYYY-MM-DD ngày kết thúc, thường là hôm nay nếu có date_from, để trống nếu không\",\n"
        "  \"semantic_query\": \"mô tả nội dung cốt lõi theo quy tắc trên\",\n"
        "  \"needs_retrieval\": false\n"
        "}\n"
        "QUY TẮC QUAN TRỌNG cho 'needs_retrieval':\n"
        "- Giá trị PHẢI là boolean JSON thuần túy: true hoặc false.\n"
        "- Đặt FALSE khi: câu hỏi chào hỏi/xã giao, câu hỏi về giá cổ phiếu/vàng/tỷ giá (tool call), câu hỏi có thể trả lời hoàn toàn từ bài báo đã ghim hoặc ngữ cảnh trước đó.\n"
        "- Đặt TRUE CHỈ KHI: người dùng cần tra cứu bài báo tin tức mới trong Qdrant mà ngữ cảnh hiện tại chưa có."
    )
    
    logger.info(f"Extracting structured query for input: '{user_input}'")

    try:
        if settings.gemini_api_key:
            # Dùng Gemini nếu có API key (nhanh hơn Ollama ~5-10x)
            try:
                raw = await generate_gemini_content(
                    api_key=settings.gemini_api_key,
                    model=settings.gemini_model_fast,
                    contents=user_input,
                    system_instruction=system_prompt,
                    temperature=0.0,
                    timeout=GEMINI_FAST_TIMEOUT,  # query rewrite: fail nhanh và fallback
                )
                # Gemini có thể trả về JSON bọc trong markdown code block
                raw = raw.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                data = json.loads(raw.strip())
                logger.info(
                    f"\n================ [STRUCTURED QUERY EXTRACTED (Gemini)] ================\n"
                    f"{json.dumps(data, ensure_ascii=False, indent=2)}\n"
                    f"========================================================================="
                )
                return data
            except Exception as gemini_err:
                err_str = str(gemini_err)
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "TimeoutError" in type(gemini_err).__name__:
                    logger.warning(
                        f"Gemini unavailable ({type(gemini_err).__name__}), "
                        "falling back to Ollama for query extraction."
                    )
                else:
                    logger.error(f"Gemini error during query extraction: {gemini_err}")
                # Fall through to Ollama below

        # Fallback sang Ollama (hoặc khi không có Gemini key)
        logger.info("Using Ollama for structured query extraction...")
        raw = await generate_ollama_content(
            model=settings.model_name,
            contents=user_input,
            system_instruction=system_prompt,
            json_format=True
        )
        data = json.loads(raw)
        logger.info(
            f"\n================ [STRUCTURED QUERY EXTRACTED (Ollama)] ================\n"
            f"{json.dumps(data, ensure_ascii=False, indent=2)}\n"
            f"========================================================================="
        )
        return data
    except Exception as e:
        logger.error(f"Error extracting structured query: {e}")
        return {"semantic_query": user_input, "needs_retrieval": True}


async def search_articles(
    query: str,
    limit: int = 5,
    rerank: bool = True,
    cached_articles: list[dict] | None = None,
    conversation_context: str = "",
) -> tuple[list[dict], bool]:
    """
    Generate an embedding for the structured query and search Qdrant for relevant articles with filters.
    Optionally applies Cross-Encoder reranking to improve result quality.
    """
    try:
        # 1. Extract structured query via LLM
        structured_data = await extract_structured_query(
            query, conversation_context=conversation_context
        )
        semantic_query = structured_data.get("semantic_query") or query
        site = structured_data.get("site", "").strip()
        target_sites = structured_data.get("target_sites", [])
        exclude_sites = structured_data.get("exclude_sites", [])
        tags = structured_data.get("tags", [])
        date_from = structured_data.get("date_from", "").strip()
        date_to = structured_data.get("date_to", "").strip()
        
        # Xử lý an toàn boolean / string cho needs_retrieval
        raw_needs_retrieval = structured_data.get("needs_retrieval", True)
        if isinstance(raw_needs_retrieval, str):
            needs_retrieval = raw_needs_retrieval.lower().strip() not in ("false", "0", "no")
        else:
            needs_retrieval = bool(raw_needs_retrieval)

        logger.info(
            f"[RAG SEARCH] Query: '{query}' | semantic_query: '{semantic_query}' | "
            f"needs_retrieval={needs_retrieval} | has_cache={bool(cached_articles)}"
        )

        # 2. Nếu LLM xác định không cần retrieve mới và đã có cache → dùng cache
        if not needs_retrieval and cached_articles:
            logger.info(
                f"[RAG] Skipping Qdrant — reusing {len(cached_articles)} cached articles "
                f"(needs_retrieval=False)"
            )
            return cached_articles, False

        embedder = get_dense_embedder()
        if not embedder or not qdrant_client:
            logger.warning("Embedder or Qdrant client not initialized, skipping RAG search.")
            return [], False

        # 3. Build Qdrant Filter (must, should, must_not)
        must_conditions = []
        should_conditions = []
        must_not_conditions = []

        # --- must: target_sites / site filter ---
        if target_sites and isinstance(target_sites, list) and len(target_sites) > 0:
            norm_targets = [sources_registry.normalize_site(s) for s in target_sites if s]
            norm_targets = [s for s in norm_targets if s]
            if len(norm_targets) == 1:
                must_conditions.append(FieldCondition(key="site", match=MatchValue(value=norm_targets[0])))
            elif len(norm_targets) > 1:
                must_conditions.append(FieldCondition(key="site", match=MatchAny(any=norm_targets)))
        elif site:
            norm_site = sources_registry.normalize_site(site)
            if norm_site:
                must_conditions.append(FieldCondition(key="site", match=MatchValue(value=norm_site)))

        # --- must_not: exclude_sites filter (dùng cho 'các nguồn khác') ---
        if exclude_sites and isinstance(exclude_sites, list) and len(exclude_sites) > 0:
            norm_excludes = [sources_registry.normalize_site(s) for s in exclude_sites if s]
            norm_excludes = [s for s in norm_excludes if s]
            for ex_site in norm_excludes:
                must_not_conditions.append(FieldCondition(key="site", match=MatchValue(value=ex_site)))
            logger.info(f"Excluding sites filter: {norm_excludes}")

        # --- must: date range filter ---
        if date_from and date_to:
            try:
                dt_from = datetime.strptime(date_from, "%Y-%m-%d")
                dt_to   = datetime.strptime(date_to,   "%Y-%m-%d")
                delta   = (dt_to - dt_from).days
                date_list = [
                    (dt_from + timedelta(days=i)).strftime("%Y-%m-%d")
                    for i in range(delta + 1)
                ]
                must_conditions.append(
                    FieldCondition(key="published_at", match=MatchAny(any=date_list))
                )
                logger.info(f"Date filter: {date_list}")
            except ValueError:
                logger.warning(f"Invalid date range: {date_from}~{date_to}, skipping.")
        elif date_from:
            try:
                datetime.strptime(date_from, "%Y-%m-%d")
                must_conditions.append(
                    FieldCondition(key="published_at", match=MatchValue(value=date_from))
                )
            except ValueError:
                logger.warning(f"Invalid date_from: {date_from}, skipping.")

        # --- should: tags filter ---
        if tags and isinstance(tags, list) and len(tags) > 0:
            all_variants: list[str] = []
            for t in tags:
                all_variants.extend(_tag_variants(t))
            unique_variants = list(dict.fromkeys(v for v in all_variants if v))
            should_conditions.append(
                FieldCondition(key="tags", match=MatchAny(any=unique_variants))
            )
            logger.info(f"Tag filter variants (first 10): {unique_variants[:10]} ...")

        # Tạo filter tổng hợp
        qdrant_filter = None
        if must_conditions or should_conditions or must_not_conditions:
            qdrant_filter = Filter(
                must=must_conditions if must_conditions else None,
                should=should_conditions if should_conditions else None,
                must_not=must_not_conditions if must_not_conditions else None,
            )

        # 4. Create embeddings (Dense E5 + FastEmbed BM25 Sparse)
        query_text = f"query: {semantic_query}"
        query_vector = embedder.encode(query_text).tolist()
        sparse_vector = get_sparse_vector(semantic_query)

        # 5. Retrieve more candidates when reranking is enabled (3× the final limit)
        retrieval_limit = (limit * 3) if rerank else limit

        # 6. Execute Hybrid Search (Dense + Sparse with RRF Fusion) or fallback to Dense Search
        candidates = []
        if sparse_vector:
            try:
                logger.info(f"Executing Hybrid Search (Dense E5 + Sparse BM25 RRF Fusion) for: '{semantic_query}'")
                response = qdrant_client.query_points(
                    collection_name=settings.qdrant_collection,
                    prefetch=[
                        Prefetch(query=query_vector, using="dense", limit=retrieval_limit, filter=qdrant_filter),
                        Prefetch(query=sparse_vector, using="sparse", limit=retrieval_limit, filter=qdrant_filter),
                    ],
                    query=FusionQuery(fusion=Fusion.RRF),
                    limit=retrieval_limit,
                    with_payload=True,
                )
                candidates = [pt.payload for pt in response.points if pt.payload]
                logger.info(f"Hybrid Search returned {len(candidates)} candidates.")
            except Exception as hybrid_err:
                logger.warning(
                    f"Hybrid search prefetch failed (collection might be using single-vector format), "
                    f"falling back to Dense Search: {hybrid_err}"
                )
                candidates = []

        if not candidates:
            # Dense Vector Search fallback
            response = qdrant_client.query_points(
                collection_name=settings.qdrant_collection,
                query=query_vector,
                using="dense",
                query_filter=qdrant_filter,
                limit=retrieval_limit,
                with_payload=True,
                score_threshold=0.5,
            )
            candidates = [pt.payload for pt in response.points if pt.payload]

        logger.info(
            f"Qdrant search returned {len(candidates)} candidates "
            f"(filter: site='{site}', date={date_from}~{date_to}, tags={tags})"
        )

        # ---------------------------------------------------------------
        # FALLBACK: Nếu không tìm được kết quả nào với filter hiện tại,
        # thử lại với filter nới lỏng dần để gợi ý cho người dùng.
        # ---------------------------------------------------------------
        if not candidates:
            logger.info(
                "[RAG] Strict query returned 0 results — attempting relaxed fallback search."
            )
            fallback_results = await _relaxed_fallback_search(
                query_vector=query_vector,
                semantic_query=semantic_query,
                site=site,
                tags=tags,
                limit=limit,
                rerank=rerank,
            )
            if fallback_results:
                # Đánh dấu đây là kết quả gợi ý (fallback), không phải kết quả chính xác
                for chunk in fallback_results:
                    chunk["_is_fallback"] = True
                logger.info(
                    f"[RAG] Fallback search returned {len(fallback_results)} suggestions."
                )
                return fallback_results, True
            # Hoàn toàn không có kết quả gì
            logger.info("[RAG] No results found even after relaxed fallback.")
            return [], True

        # 7. Rerank candidates with Cross-Encoder (runs on CPU in background thread)
        # score_threshold=0.0: chỉ giữ bài cross-encoder cho điểm dương (thực sự liên quan)
        if rerank and len(candidates) > 1:
            results = await rerank_documents(
                query=semantic_query,
                docs=candidates,
                top_k=limit,
                score_threshold=0.0,
            )
        else:
            results = candidates[:limit]

        # 8. Heuristic tag-boost rerank (nhẹ, không đảo lộn kết quả cross-encoder)
        if tags and len(results) > 1:
            results = _heuristic_rerank(results, tags, boost_weight=0.15)

        # 9. Context enrichment: bổ sung đầy đủ các chunk của cùng bài báo
        #    để LLM nhận được ngữ cảnh hoàn chỉnh, không bị cắt giữa chừng.
        if results:
            results = await _enrich_with_full_article_chunks(
                top_chunks=results,
                article_limit=limit,
            )

        return results, True

    except Exception as e:
        logger.error(f"Error during Qdrant search: {e}", exc_info=True)
        return [], False


async def _enrich_with_full_article_chunks(
    top_chunks: list[dict],
    article_limit: int = 5,
) -> list[dict]:
    """
    Làm giàu kết quả top-ranked chunks bằng cách lấy TẤT CẢ các chunk
    của các bài báo đã được chọn, sắp xếp theo chunk_index.

    Mục đích:
    - Top chunks xác định BÀI BÁO nào liên quan nhất (ranking bằng embedding + rerank).
    - Sau khi xác định bài, ta lấy đầy đủ nội dung bài đó (tất cả chunks)
      để LLM có ngữ cảnh hoàn chỉnh thay vì chỉ thấy một phần nhỏ.

    Args:
        top_chunks:    Danh sách chunk đã rerank, mỗi chunk là payload dict.
        article_limit: Số bài báo tối đa để enrich (giới hạn theo số bài, không phải chunk).

    Returns:
        Danh sách đầy đủ chunks, nhóm theo bài báo, mỗi bài sắp theo chunk_index.
    """
    if not qdrant_client or not top_chunks:
        return top_chunks

    # Thu thập các url_hash duy nhất từ top chunks (giữ thứ tự ưu tiên)
    seen_hashes: list[str] = []
    hash_to_chunks: dict[str, list[dict]] = {}
    for chunk in top_chunks:
        url_hash = chunk.get("url_hash", "")
        if url_hash and url_hash not in seen_hashes:
            seen_hashes.append(url_hash)
            hash_to_chunks[url_hash] = []
        if not url_hash:
            # Chunk không có url_hash → giữ nguyên vị trí
            hash_to_chunks.setdefault("__no_hash__", []).append(chunk)

    # Giới hạn số bài enrich
    hashes_to_enrich = seen_hashes[:article_limit]

    # Với mỗi bài báo, scroll lấy tất cả chunks theo url_hash
    collection = settings.qdrant_collection
    for url_hash in hashes_to_enrich:
        try:
            scroll_filter = Filter(
                must=[
                    FieldCondition(
                        key="url_hash",
                        match=MatchValue(value=url_hash)
                    )
                ]
            )
            scroll_result, _ = qdrant_client.scroll(
                collection_name=collection,
                scroll_filter=scroll_filter,
                limit=50,           # một bài thường < 20 chunks
                with_payload=True,
                with_vectors=False,
            )
            all_chunks = [pt.payload for pt in scroll_result if pt.payload]
            # Sắp xếp theo chunk_index để giữ thứ tự tự nhiên của bài
            all_chunks.sort(key=lambda c: c.get("chunk_index", 0))
            hash_to_chunks[url_hash] = all_chunks
            logger.debug(
                f"[Enrich] url_hash={url_hash[:8]}... → {len(all_chunks)} chunks fetched."
            )
        except Exception as e:
            logger.warning(f"[Enrich] Failed to scroll chunks for url_hash={url_hash}: {e}")
            # Giữ lại chunk gốc từ top_chunks nếu scroll lỗi
            hash_to_chunks[url_hash] = [
                c for c in top_chunks if c.get("url_hash") == url_hash
            ]

    # Ghép kết quả: mỗi bài một lần, theo thứ tự ưu tiên từ rerank
    enriched: list[dict] = []
    for url_hash in hashes_to_enrich:
        enriched.extend(hash_to_chunks.get(url_hash, []))
    # Thêm các chunk không có url_hash (nếu có)
    enriched.extend(hash_to_chunks.get("__no_hash__", []))

    logger.info(
        f"[Enrich] {len(hashes_to_enrich)} articles enriched: "
        f"{len(top_chunks)} top chunks → {len(enriched)} full chunks."
    )
    return enriched


async def _relaxed_fallback_search(
    query_vector: list[float],
    semantic_query: str,
    site: str,
    tags: list[str],
    limit: int,
    rerank: bool,
) -> list[dict]:
    """
    Thực hiện tìm kiếm với filter nới lỏng dần khi query gốc không có kết quả.

    Chiến lược nới lỏng (theo thứ tự):
      1. Bỏ date filter, giữ site + tags.
      2. Bỏ date + site filter, chỉ giữ tags.
      3. Bỏ tất cả filter (semantic search thuần tuý).

    Args:
        query_vector:    Vector đã embed sẵn.
        semantic_query:  Câu query dạng ngôn ngữ tự nhiên để rerank.
        site:            Giá trị site filter gốc (có thể rỗng).
        tags:            Danh sách tags gốc.
        limit:           Số kết quả tối đa.
        rerank:          Có dùng reranking không.

    Returns:
        Danh sách chunk gợi ý (có thể rỗng nếu hoàn toàn không tìm được gì).
    """
    if not qdrant_client:
        return []

    collection = settings.qdrant_collection
    retrieval_limit = (limit * 3) if rerank else limit

    # Tạo tag conditions để tái sử dụng
    tag_conditions: list[FieldCondition] = []
    if tags and isinstance(tags, list) and len(tags) > 0:
        all_variants: list[str] = []
        for t in tags:
            all_variants.extend(_tag_variants(t))
        unique_variants = list(dict.fromkeys(v for v in all_variants if v))
        tag_conditions = [FieldCondition(key="tags", match=MatchAny(any=unique_variants))]

    # Tạo site condition để tái sử dụng
    site_condition: FieldCondition | None = None
    if site:
        site_condition = FieldCondition(key="site", match=MatchValue(value=site))

    # Thứ tự nới lỏng: (must_conditions, should_conditions, label)
    fallback_strategies = [
        # 1. Giữ site + tags, bỏ date
        (
            [site_condition] if site_condition else [],
            tag_conditions,
            "site+tags (no date)",
        ),
        # 2. Chỉ giữ tags, bỏ site + date
        (
            [],
            tag_conditions,
            "tags only (no site, no date)",
        ),
        # 3. Không filter gì cả — semantic search thuần tuý
        (
            [],
            [],
            "no filter (pure semantic)",
        ),
    ]

    for must_conds, should_conds, label in fallback_strategies:
        # Nếu cả must và should đều rỗng và đây là bước cuối, luôn chạy
        if not must_conds and not should_conds and label != "no filter (pure semantic)":
            continue  # skip nếu không có điều kiện gì và chưa đến bước cuối

        relaxed_filter = None
        if must_conds or should_conds:
            relaxed_filter = Filter(
                must=must_conds if must_conds else None,
                should=should_conds if should_conds else None,
            )

        logger.info(f"[Fallback] Trying relaxed search with strategy: '{label}'")
        try:
            response = qdrant_client.query_points(
                collection_name=collection,
                query=query_vector,
                using="dense",
                query_filter=relaxed_filter,
                limit=retrieval_limit,
                with_payload=True,
                score_threshold=0.4,  # nới lỏng score threshold so với 0.5 của strict search
            )
            candidates = [pt.payload for pt in response.points if pt.payload]
            logger.info(
                f"[Fallback] Strategy '{label}' returned {len(candidates)} candidates."
            )
            if candidates:
                # Rerank nếu được bật
                if rerank and len(candidates) > 1:
                    results = await rerank_documents(
                        query=semantic_query,
                        docs=candidates,
                        top_k=limit,
                        score_threshold=0.0,
                    )
                else:
                    results = candidates[:limit]
                # Enrich với đầy đủ chunks của bài
                if results:
                    results = await _enrich_with_full_article_chunks(
                        top_chunks=results,
                        article_limit=limit,
                    )
                return results
        except Exception as e:
            logger.warning(f"[Fallback] Strategy '{label}' failed: {e}")

    return []
