import logging
import json
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny, Range

from .config import settings
from .gemini_service import generate_gemini_content
from .ollama_service import generate_ollama_content

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


async def extract_structured_query(user_input: str) -> dict:
    today = datetime.now().strftime("%Y-%m-%d")

    system_prompt = (
        f"Hôm nay là ngày {today}. "
        "Bạn là một chuyên gia phân tích truy vấn tìm kiếm. "
        "Hãy trích xuất thông tin từ câu hỏi của người dùng và trả về JSON theo đúng cấu trúc sau, "
        "KHÔNG thêm bất kỳ trường nào khác ngoài các trường đã định nghĩa:\n"
        "{\n"
        "  \"site\": \"tên trang web nếu người dùng có nhắc đến (ví dụ: cafef, vnexpress, dantri), "
        "để trống (empty string) nếu không đề cập\",\n"
        "  \"tags\": [\"danh sách tối đa 3 từ khóa/chủ đề quan trọng nhất, "
        "dùng tiếng Việt không dấu hoặc tiếng Anh, để mảng rỗng nếu không có\"],\n"
        "  \"date_from\": \"ngày bắt đầu lọc theo định dạng YYYY-MM-DD nếu người dùng đề cập khoảng thời gian "
        "(ví dụ: 'hôm nay', 'tuần này', '3 ngày gần đây', 'tháng này'), để trống nếu không đề cập\",\n"
        "  \"date_to\": \"ngày kết thúc lọc theo định dạng YYYY-MM-DD, thường là hôm nay nếu có date_from, "
        "để trống nếu không đề cập\",\n"
        "  \"semantic_query\": \"câu hỏi được viết lại một cách rõ ràng, chi tiết, đầy đủ ngữ nghĩa "
        "để tối ưu cho hệ thống tìm kiếm vector (semantic search), không bao gồm thông tin về website hay thời gian\"\n"
        "}"
    )

    try:
        if settings.gemini_api_key:
            # Dùng Gemini nếu có API key (nhanh hơn Ollama ~5-10x)
            raw = await generate_gemini_content(
                api_key=settings.gemini_api_key,
                model="gemini-2.0-flash",
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
        else:
            # Fallback sang Ollama nếu không có Gemini key
            raw = await generate_ollama_content(
                model=settings.model_name,
                contents=user_input,
                system_instruction=system_prompt,
                json_format=True
            )
            data = json.loads(raw)
        logger.info(f"Extracted structured query: {data}")
        return data
    except Exception as e:
        logger.error(f"Error extracting structured query: {e}")
        return {"semantic_query": user_input}


async def search_articles(query: str, limit: int = 5) -> list[dict]:
    """
    Generate an embedding for the structured query and search Qdrant for relevant articles with filters.

    Filter strategy:
    - must:   site (nếu người dùng chỉ định), date_from/date_to (nếu có)
    - should: tags (boost điểm nếu match, không bắt buộc)
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
        date_range_kwargs = {}
        if date_from:
            try:
                datetime.strptime(date_from, "%Y-%m-%d")  # validate format
                date_range_kwargs["gte"] = date_from
            except ValueError:
                logger.warning(f"Invalid date_from format: {date_from}, skipping date filter.")

        if date_to:
            try:
                datetime.strptime(date_to, "%Y-%m-%d")  # validate format
                date_range_kwargs["lte"] = date_to
            except ValueError:
                logger.warning(f"Invalid date_to format: {date_to}, skipping date_to.")

        if date_range_kwargs:
            must_conditions.append(
                FieldCondition(key="published_at", range=Range(**date_range_kwargs))
            )

        # --- should: tags filter (boost điểm, không bắt buộc) ---
        if tags and isinstance(tags, list) and len(tags) > 0:
            should_conditions.append(
                FieldCondition(key="tags", match=MatchAny(any=[t.lower() for t in tags]))
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

        # 4. Search in Qdrant với API mới query_points() (search() đã bị remove)
        response = qdrant_client.query_points(
            collection_name=settings.qdrant_collection,
            query=query_vector,
            query_filter=qdrant_filter,
            limit=limit,
            with_payload=True,
            score_threshold=0.3,  # loại bỏ kết quả quá ít liên quan
        )

        results = [pt.payload for pt in response.points if pt.payload]
        logger.info(
            f"Qdrant search returned {len(results)} results "
            f"(filter: site='{site}', date={date_from}~{date_to}, tags={tags})"
        )
        return results

    except Exception as e:
        logger.error(f"Error during Qdrant search: {e}", exc_info=True)
        return []
