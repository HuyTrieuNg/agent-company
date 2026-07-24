from fastapi import APIRouter, HTTPException
import logging
from ..models import ChatMessage, ChatRequest, ChatResponse
from ..ollama_service import generate_ollama_content
from ..gemini_service import generate_gemini_content
from ..qdrant_service import search_articles
from ..sources_registry import sources_registry
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _build_conversation_context(
    history: list[ChatMessage],
    cached_articles: list[dict] | None = None,
    max_turns: int = 3
) -> str:
    """
    Tạo tóm tắt ngắn về các chủ đề và nguồn trang web đã được trích dẫn trong các lượt trước.
    Dùng để truyền vào extract_structured_query → giúp LLM quyết định needs_retrieval, exclude_sites.
    """
    lines = []
    if cached_articles:
        cited_sites = set(art.get("site") for art in cached_articles if art.get("site"))
        if cited_sites:
            lines.append(f"Các nguồn trang web đã trích dẫn ở lượt trước: {', '.join(cited_sites)}")

    if history:
        recent = history[-(max_turns * 2):]
        user_messages = [msg.content for msg in recent if msg.role == "user"]
        if user_messages:
            lines.append("Các câu hỏi trước của người dùng:")
            lines.extend(f"- {msg}" for msg in user_messages)

    return "\n".join(lines)


def _format_relative_date(pub_date_str: str) -> str:
    """Format string ngày YYYY-MM-DD thành mô tả thời gian tương đối."""
    if not pub_date_str:
        return ""
    try:
        from datetime import datetime
        dt = datetime.strptime(str(pub_date_str)[:10], "%Y-%m-%d")
        days = (datetime.now() - dt).days
        if days == 0:
            return "Hôm nay"
        elif days == 1:
            return "Hôm qua"
        elif days > 1:
            return f"{days} ngày trước"
    except Exception:
        pass
    return str(pub_date_str)


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a message with RAG context to Gemini (or fallback to Ollama).
    """
    try:
        # 1. Xây dựng conversation_context từ history và cached_articles
        conversation_context = _build_conversation_context(
            request.history,
            cached_articles=request.cached_articles if request.cached_articles else None
        )

        # 2. Retrieve context từ Qdrant
        logger.info(
            f"Searching context for query: {request.message} | "
            f"has_cache={bool(request.cached_articles)} | "
            f"history_turns={len(request.history)}"
        )
        chunks, did_retrieve = await search_articles(
            query=request.message,
            limit=5,
            cached_articles=request.cached_articles if request.cached_articles else None,
            conversation_context=conversation_context,
        )

        if did_retrieve:
            logger.info(f"Retrieved {len(chunks)} new articles from Qdrant.")
        else:
            logger.info(f"Using {len(chunks)} cached articles (skipped Qdrant).")

        # 3. Build context string cho system prompt
        context_str = ""
        is_fallback = False
        if chunks:
            is_fallback = any(chunk.get("_is_fallback") for chunk in chunks)

            context_pieces = []
            for i, chunk in enumerate(chunks, 1):
                title = chunk.get("article_title", "Không rõ")
                site = chunk.get("site", "Không rõ")
                url = chunk.get("article_url", "")
                text = chunk.get("text", "")
                pub_date = chunk.get("published_at", "")
                rel_time = _format_relative_date(pub_date)
                time_str = f" | Ngày đăng: {pub_date}" + (f" ({rel_time})" if rel_time else "")

                context_pieces.append(
                    f"[Tài liệu {i}]\nTiêu đề: {title}\nNguồn: {site}{time_str}\nNội dung: {text}\nURL: {url}"
                )
            context_str = "\n---\n".join(context_pieces)

        sources_info = sources_registry.get_sources_prompt_summary()

        if is_fallback:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh phân tích tin tức.\n"
                f"{sources_info}\n\n"
                "Câu hỏi của người dùng KHÔNG tìm được kết quả chính xác nào trong cơ sở dữ liệu (do bộ lọc quá gắt). "
                "Thay vào đó, hệ thống đã tìm được một số bài viết CÓ THỂ LIÊN QUAN (gợi ý):\n"
                "NGUỒN GỢI Ý:\n" + context_str + "\n\n"
                "Nhiệm vụ của bạn:\n"
                "1. THÔNG BÁO rõ ràng cho người dùng rằng KHÔNG tìm được kết quả chính xác từ các nguồn yêu cầu.\n"
                "2. GỢI Ý 2-3 bài viết từ danh sách trên có thể liên quan, kèm tiêu đề và URL.\n"
                "3. ĐỀ NGHỊ người dùng có thể hỏi thêm theo hướng nào.\n"
                "4. TUYỆT ĐỐI KHÔNG tự suy diễn hay của mình đưa ra thông tin không có trong nguồn gợi ý trên."
            )
        else:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh chuyên phân tích tin tức đa nguồn.\n"
                f"{sources_info}\n\n"
                "HƯỚNG DẪN TRẢ LỜI:\n"
                "1. Trả lời câu hỏi dựa trên các tài liệu trong NGỮ CẢNH bên dưới.\n"
                "2. Khi người dùng hỏi 'Các nguồn khác thì sao?' hoặc so sánh thông tin, hãy phân biệt và tổng hợp rõ từng nguồn trang web (ví dụ CafeF vs SaigonTimes vs VnEconomy).\n"
                "3. Nếu không tìm thấy thông tin ở các nguồn khác trong CSDL, hãy chủ động thông báo rõ ràng cho người dùng.\n"
                "4. Trích dẫn nguồn (Tiêu đề, Trang web, URL) rõ ràng cho từng nội dung.\n\n"
                "NGỮ CẢNH:\n" + (context_str if context_str else "Không tìm thấy dữ liệu liên quan trong CSDL.")
            )

        reply = ""

        # 4. Call LLM
        if settings.gemini_api_key:
            # Use Gemini — truyền history đúng format multi-turn thay vì flatten text
            logger.info(f"Using Gemini for chat generation (history turns: {len(request.history)}).")
            reply = await generate_gemini_content(
                api_key=settings.gemini_api_key,
                model=settings.gemini_model_chat,
                contents=request.message,   # tin nhắn mới của user
                history=request.history,     # lịch sử hội thoại dạng list
                system_instruction=system_instruction,
            )
        else:
            # Fallback to Ollama
            logger.info("Using Ollama for chat generation.")
            messages = list(request.history) + [ChatMessage(role="user", content=request.message)]
            reply = await generate_ollama_content(
                model=settings.model_name,
                contents=messages,
                system_instruction=system_instruction,
                json_format=False
            )

    except Exception as exc:
        logger.error(f"Error in chat endpoint: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # 5. Build updated history
    updated_history = [
        *request.history,
        ChatMessage(role="user", content=request.message),
        ChatMessage(role="model", content=reply),
    ]

    # 6. Trả về cached_articles để frontend lưu lại cho lượt sau
    #    - Nếu retrieve mới → dùng articles vừa lấy
    #    - Nếu dùng cache   → giữ nguyên cached_articles cũ
    articles_to_cache = chunks if chunks else request.cached_articles

    return ChatResponse(
        reply=reply,
        history=updated_history,
        cached_articles=articles_to_cache,
    )
