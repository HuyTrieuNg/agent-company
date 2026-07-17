import logging
import json
import unicodedata
import re
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue, MatchAny, PayloadSchemaType, ScrollRequest
)

from .config import settings
from .gemini_service import generate_gemini_content, GEMINI_FAST_TIMEOUT
from .ollama_service import generate_ollama_content
from .reranker_service import rerank_documents

logger = logging.getLogger(__name__)

# Initialize SentenceTransformer Model
try:
    logger.info("Initializing SentenceTransformer model 'intfloat/multilingual-e5-small'...")
    embedder = SentenceTransformer("intfloat/multilingual-e5-small")
except Exception as e:
    logger.error(f"Failed to initialize embedder: {e}")
    embedder = None

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


def _heuristic_rerank(docs: list[dict], query_tags: list[str], boost_weight: float = 0.15) -> list[dict]:
    """
    Heuristic rerank dựa trên tag similarity.

    Giữ nguyên thứ tự cross-encoder làm nền tảng,
    tag score chỉ điều chỉnh nhẹ (boost_weight=0.15).
    """
    if not query_tags or not docs:
        return docs

    n = len(docs)
    rank_scores = [(n - i) / n for i in range(n)]
    tag_scores = [_doc_tag_score(doc, query_tags) for doc in docs]

    max_tag = max(tag_scores) if any(s > 0 for s in tag_scores) else 1.0
    tag_scores_norm = [s / max_tag if max_tag > 0 else 0.0 for s in tag_scores]

    combined = [
        (i, (1 - boost_weight) * rs + boost_weight * ts_norm)
        for i, (rs, ts_norm) in enumerate(zip(rank_scores, tag_scores_norm))
    ]
    combined.sort(key=lambda x: x[1], reverse=True)
    reranked = [docs[i] for i, _ in combined]

    original_order = list(range(n))
    new_order = [i for i, _ in combined]
    if original_order != new_order:
        logger.info(
            f"[HeuristicRerank] Tag boost changed order: {original_order} → {new_order} "
            f"(query_tags={query_tags}, tag_scores={[round(s, 2) for s in tag_scores]})"
        )
    return reranked


async def ensure_payload_indexes() -> None:
    """
    Tạo payload index cho các field cần filter / range query trong Qdrant.
    Hàm này idempotent: nếu index đã tồn tại thì Qdrant bỏ qua, không báo lỗi.

    Các field cần index:
    - published_at : float (Unix timestamp) — dùng cho Range filter
    - site         : keyword              — dùng cho MatchValue filter
    - tags         : keyword              — dùng cho MatchAny filter
    """
    if not qdrant_client:
        return
    collection = settings.qdrant_collection
    indexes = [
        ("published_at", PayloadSchemaType.KEYWORD),  # lưu dạng string 'YYYY-MM-DD'
        ("site",         PayloadSchemaType.KEYWORD),
        ("tags",         PayloadSchemaType.KEYWORD),
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
                              Dùng để LLM quyết định `needs_retrieval`.

    Returns:
        dict với các trường: site, tags, date_from, date_to, semantic_query, needs_retrieval.
    """
    today = datetime.now().strftime("%Y-%m-%d")

    # Phần hướng dẫn về needs_retrieval — chỉ thêm khi có context trước đó
    context_hint = ""
    if conversation_context:
        context_hint = (
            f"\n\nNGỮ CẢNH HỘI THOẠI TRƯỚC ĐÓ:\n{conversation_context}\n\n"
            "Dựa vào ngữ cảnh hội thoại trên, hãy xem xét:\n"
            "- Nếu câu hỏi mới có thể trả lời hoàn toàn dựa trên các bài báo đã tìm kiếm trước đó "
            "(ví dụ: câu hỏi làm rõ, tóm tắt thêm, giải thích, so sánh nội dung cũ), hãy đặt needs_retrieval = false.\n"
            "- Nếu câu hỏi mới yêu cầu tìm kiếm chủ đề khác, bài báo mới, hoặc khoảng thời gian khác, hãy đặt needs_retrieval = true.\n"
            "- Mặc định là true nếu không chắc chắn.\n\n"
        )

    system_prompt = (
        f"Hôm nay là ngày {today}. "
        "Bạn là chuyên gia phân tích truy vấn tìm kiếm ngữ nghĩa (semantic search). "
        "Nhiệm vụ: trích xuất thông tin từ câu hỏi và trả về JSON theo đúng cấu trúc bên dưới. "
        "KHÔNG thêm bất kỳ trường nào khác.\n\n"

        "QUY TẮC QUAN TRỌNG cho trường 'semantic_query':\n"
        "- Viết lại thành một MÔ TẢ NỘI DUNG súc tích, KHÔNG phải câu hỏi hay yêu cầu.\n"
        "- TUYỆT ĐỐI KHÔNG dùng các từ nhiễu: 'tin tức', 'tin mới', 'thông tin', 'cho tôi biết', "
        "'có gì', 'như thế nào', 'tình hình', 'cập nhật', 'mới nhất', 'hỏi về', 'cho tôi xem'.\n"
        "- Tập trung vào CHỦ THỂ và SỰ KIỆN cốt lõi — những từ xuất hiện trong nội dung bài báo.\n"
        "- Không bao gồm thông tin về website hay khoảng thời gian.\n\n"

        "VÍ DỤ (few-shot):\n"
        "  Input:  'Tin tức giá vàng 2 ngày nay'\n"
        "  Output semantic_query: 'giá vàng biến động'\n\n"
        "  Input:  'Cho tôi biết tin tức về thị trường chứng khoán hôm nay'\n"
        "  Output semantic_query: 'thị trường chứng khoán'\n\n"
        "  Input:  'Có tin gì về Bitcoin không?'\n"
        "  Output semantic_query: 'Bitcoin tiền mã hóa'\n\n"
        "  Input:  'Tình hình kinh tế Việt Nam tháng này'\n"
        "  Output semantic_query: 'kinh tế Việt Nam'\n\n"
        "  Input:  'Giá xăng dầu tuần này như thế nào'\n"
        "  Output semantic_query: 'giá xăng dầu'\n\n"
        "  Input:  'Tin mới nhất về chiến tranh Ukraine'\n"
        "  Output semantic_query: 'xung đột Nga Ukraine'\n\n"

        + context_hint
        + "CẤU TRÚC JSON:\n"
        "{\n"
        "  \"site\": \"tên trang web nếu người dùng có nhắc đến (ví dụ: cafef, vnexpress, dantri), "
        "để trống nếu không đề cập\",\n"
        "  \"tags\": [\"tối đa 3 chủ đề, tiếng Việt CÓ DẤU (ví dụ: 'kinh tế', 'tài chính')\"],\n"
        "  \"date_from\": \"YYYY-MM-DD nếu người dùng đề cập khoảng thời gian, để trống nếu không\",\n"
        "  \"date_to\": \"YYYY-MM-DD ngày kết thúc, thường là hôm nay nếu có date_from, để trống nếu không\",\n"
        "  \"semantic_query\": \"mô tả nội dung cốt lõi theo quy tắc trên\",\n"
        "  \"needs_retrieval\": true\n"
        "}\n"
        "Lưu ý: needs_retrieval mặc định là true nếu không có ngữ cảnh trước đó. "
        "Chỉ đặt false khi câu hỏi rõ ràng có thể trả lời từ ngữ cảnh đã có."
    )

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
                logger.info(f"Extracted structured query (Gemini): {data}")
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
        logger.info(f"Extracted structured query (Ollama): {data}")
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

    Logic có cache:
    - LLM phân tích câu hỏi và quyết định needs_retrieval dựa trên conversation_context.
    - Nếu needs_retrieval=False và đã có cached_articles → trả về cache ngay, skip Qdrant.
    - Nếu needs_retrieval=True → thực hiện truy vấn Qdrant như bình thường.

    Args:
        query:                Câu hỏi của người dùng.
        limit:                Số bài báo tối đa trả về.
        rerank:               Có dùng Cross-Encoder reranking không.
        cached_articles:      Danh sách bài báo đã retrieve từ câu hỏi trước (có thể None).
        conversation_context: Tóm tắt ngắn chủ đề/bài báo trước, dùng để LLM quyết định needs_retrieval.

    Returns:
        tuple(list[dict], bool): (danh sách bài báo, True nếu retrieve mới / False nếu dùng cache).

    Filter strategy:
    - must:   site (nếu người dùng chỉ định), date_from/date_to (nếu có)
    - should: tags (boost điểm nếu match, không bắt buộc)

    Reranking strategy:
    - Retrieve `retrieval_limit` candidates (3× of final limit) from Qdrant
    - Rerank with a CPU Cross-Encoder model in a background thread
    - Return top `limit` results
    """
    if not embedder or not qdrant_client:
        logger.warning("Embedder or Qdrant client not initialized, skipping RAG search.")
        return [], False

    try:
        # 1. Extract structured query via LLM
        #    Truyền conversation_context để LLM xác định needs_retrieval
        structured_data = await extract_structured_query(
            query, conversation_context=conversation_context
        )
        semantic_query = structured_data.get("semantic_query") or query
        site = structured_data.get("site", "").strip()
        tags = structured_data.get("tags", [])
        date_from = structured_data.get("date_from", "").strip()
        date_to = structured_data.get("date_to", "").strip()
        # needs_retrieval: True = cần query DB, False = dùng cache
        needs_retrieval: bool = bool(structured_data.get("needs_retrieval", True))

        logger.info(
            f"Structured Query Data: {structured_data} | "
            f"needs_retrieval={needs_retrieval} | "
            f"has_cache={bool(cached_articles)}"
        )

        # 2. Nếu LLM xác định không cần retrieve mới và đã có cache → dùng cache
        if not needs_retrieval and cached_articles:
            logger.info(
                f"[RAG] Skipping Qdrant — reusing {len(cached_articles)} cached articles "
                f"(needs_retrieval=False)"
            )
            return cached_articles, False

        # 3. Build Qdrant Filter
        must_conditions = []
        should_conditions = []

        # --- must: site filter (chỉ khi người dùng chỉ định rõ) ---
        if site:
            normalized_site = site.lower().strip()
            if "saigon" in normalized_site or "times" in normalized_site:
                normalized_site = "thesaigontimes"
            elif "cafef" in normalized_site:
                normalized_site = "cafef"
            elif "vneconomy" in normalized_site or "vnecon" in normalized_site:
                normalized_site = "vneconomy"
                
            must_conditions.append(
                FieldCondition(key="site", match=MatchValue(value=normalized_site))
            )

        # --- must: date range filter ---
        # published_at lưu dạng string 'YYYY-MM-DD'.
        # Qdrant Range chỉ hỗ trợ số → dùng MatchAny với danh sách ngày trong range.
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


        # --- should: tags filter với nhiều biến thể chuẩn hoá ---
        # Sinh đủ biến thể (có dấu, không dấu, slug...) để match bất kể site lưu dạng nào.
        if tags and isinstance(tags, list) and len(tags) > 0:
            all_variants: list[str] = []
            for t in tags:
                all_variants.extend(_tag_variants(t))
            unique_variants = list(dict.fromkeys(v for v in all_variants if v))
            should_conditions.append(
                FieldCondition(key="tags", match=MatchAny(any=unique_variants))
            )
            logger.info(f"Tag filter variants (first 10): {unique_variants[:10]} ...")

        # Chỉ tạo filter nếu có ít nhất 1 điều kiện
        qdrant_filter = None
        if must_conditions or should_conditions:
            qdrant_filter = Filter(
                must=must_conditions if must_conditions else None,
                should=should_conditions if should_conditions else None,
            )

        # 4. Create embedding (E5 models require 'query: ' prefix)
        query_text = f"query: {semantic_query}"
        query_vector = embedder.encode(query_text).tolist()

        # 5. Retrieve more candidates when reranking is enabled (3× the final limit)
        #    so the Cross-Encoder has a larger pool to select from.
        retrieval_limit = (limit * 3) if rerank else limit

        # 6. Search in Qdrant với API mới query_points() (search() đã bị remove)
        response = qdrant_client.query_points(
            collection_name=settings.qdrant_collection,
            query=query_vector,
            query_filter=qdrant_filter,
            limit=retrieval_limit,
            with_payload=True,
            score_threshold=0.5,  # chỉ giữ candidates có embedding similarity ≥ 0.5
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
