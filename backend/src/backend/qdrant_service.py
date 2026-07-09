import logging
import json
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny, PayloadSchemaType

from .config import settings
from .gemini_service import generate_gemini_content
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


async def extract_structured_query(user_input: str) -> dict:
    today = datetime.now().strftime("%Y-%m-%d")


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

        "CẤU TRÚC JSON:\n"
        "{\n"
        "  \"site\": \"tên trang web nếu người dùng có nhắc đến (ví dụ: cafef, vnexpress, dantri), "
        "để trống nếu không đề cập\",\n"
        "  \"tags\": [\"tối đa 3 từ khóa/chủ đề cốt lõi, dùng tiếng Việt không dấu hoặc tiếng Anh\"],\n"
        "  \"date_from\": \"YYYY-MM-DD nếu người dùng đề cập khoảng thời gian, để trống nếu không\",\n"
        "  \"date_to\": \"YYYY-MM-DD ngày kết thúc, thường là hôm nay nếu có date_from, để trống nếu không\",\n"
        "  \"semantic_query\": \"mô tả nội dung cốt lõi theo quy tắc trên\"\n"
        "}"
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
        return {"semantic_query": user_input}



async def search_articles(query: str, limit: int = 5, rerank: bool = True) -> list[dict]:
    """
    Generate an embedding for the structured query and search Qdrant for relevant articles with filters.
    Optionally applies Cross-Encoder reranking to improve result quality.

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
        return []

    try:
        # 1. Extract structured query via LLM
        structured_data = await extract_structured_query(query)
        semantic_query = structured_data.get("semantic_query") or query
        site = structured_data.get("site", "").strip()
        tags = structured_data.get("tags", [])
        date_from = structured_data.get("date_from", "").strip()
        date_to = structured_data.get("date_to", "").strip()

        logger.info(f"Structured Query Data: {structured_data}")

        # 2. Build Qdrant Filter
        must_conditions = []
        should_conditions = []

        # --- must: site filter (chỉ khi người dùng chỉ định rõ) ---
        if site:
            must_conditions.append(
                FieldCondition(key="site", match=MatchValue(value=site.lower()))
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


        # --- should: tags filter (boost điểm, không bắt buộc) ---
        # Tags lưu có dấu tiếng Việt → KHÔNG lowercase để match đúng.
        # Thử cả dạng gốc và lowercase để tăng recall.
        if tags and isinstance(tags, list) and len(tags) > 0:
            tag_variants = list({t for raw in tags for t in (raw, raw.lower())})
            should_conditions.append(
                FieldCondition(key="tags", match=MatchAny(any=tag_variants))
            )

        # Chỉ tạo filter nếu có ít nhất 1 điều kiện
        qdrant_filter = None
        if must_conditions or should_conditions:
            qdrant_filter = Filter(
                must=must_conditions if must_conditions else None,
                should=should_conditions if should_conditions else None,
            )

        # 3. Create embedding (E5 models require 'query: ' prefix)
        query_text = f"query: {semantic_query}"
        query_vector = embedder.encode(query_text).tolist()

        # 4. Retrieve more candidates when reranking is enabled (3× the final limit)
        #    so the Cross-Encoder has a larger pool to select from.
        retrieval_limit = (limit * 3) if rerank else limit

        # 5. Search in Qdrant với API mới query_points() (search() đã bị remove)
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

        # 6. Rerank candidates with Cross-Encoder (runs on CPU in background thread)
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

        return results

    except Exception as e:
        logger.error(f"Error during Qdrant search: {e}", exc_info=True)
        return []
