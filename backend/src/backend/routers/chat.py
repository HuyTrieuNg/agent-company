from fastapi import APIRouter, HTTPException
import logging
from ..models import ChatMessage, ChatRequest, ChatResponse
from ..ollama_service import generate_ollama_content
from ..gemini_service import generate_gemini_content
from ..qdrant_service import search_articles
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _build_conversation_context(history: list[ChatMessage], max_turns: int = 3) -> str:
    """
    Tạo tóm tắt ngắn về các chủ đề đã thảo luận trong các lượt hội thoại gần nhất.
    Dùng để truyền vào extract_structured_query → giúp LLM quyết định needs_retrieval.

    Chỉ lấy các tin nhắn user từ `max_turns` lượt cuối để context không quá dài.
    """
    if not history:
        return ""

    # Lấy tối đa max_turns * 2 messages cuối (user + model xen kẽ)
    recent = history[-(max_turns * 2):]
    user_messages = [msg.content for msg in recent if msg.role == "user"]
    if not user_messages:
        return ""

    return "Các câu hỏi trước của người dùng:\n" + "\n".join(
        f"- {msg}" for msg in user_messages
    )


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a message with RAG context to Gemini (or fallback to Ollama).

    Logic caching:
    - Nếu đã có cached_articles từ lượt trước, truyền vào search_articles.
    - LLM sẽ xác định needs_retrieval dựa trên conversation_context.
    - Nếu needs_retrieval=False → dùng cache, skip Qdrant.
    - Nếu needs_retrieval=True  → retrieve mới từ Qdrant.
    """
    try:
        # 1. Xây dựng conversation_context từ history để LLM quyết định needs_retrieval
        conversation_context = _build_conversation_context(request.history)

        # 2. Retrieve context từ Qdrant (hoặc dùng cache nếu LLM thấy không cần retrieve mới)
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
            # Kiểm tra xem kết quả có phải từ fallback (filter nới lỏng) không
            is_fallback = any(chunk.get("_is_fallback") for chunk in chunks)

            context_pieces = []
            for i, chunk in enumerate(chunks, 1):
                title = chunk.get("article_title", "Không rõ")
                site = chunk.get("site", "Không rõ")
                url = chunk.get("article_url", "")
                text = chunk.get("text", "")
                context_pieces.append(
                    f"[Tài liệu {i}]\nTiêu đề: {title}\nNguồn: {site}\nNội dung: {text}\nURL: {url}"
                )
            context_str = "\n---\n".join(context_pieces)

        if is_fallback:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh. "
                "Câu hỏi của người dùng KHÔNG tìm được kết quả chính xác nào trong cơ sở dữ liệu (do bộ lọc quá gắt). "
                "Thay vào đó, hệ thống đã tìm được một số bài viết CÓ THỂ LIÊN QUAN (gợi ý):\n"
                "NGUỒN GỢI Ý:\n" + context_str + "\n\n"
                "Nhiệm vụ của bạn:\n"
                "1. THÔNG BÁO rõ ràng cho người dùng rằng KHÔNG tìm được kết quả chính xác.\n"
                "2. GỢI Ý 2-3 bài viết từ danh sách trên có thể liên quan, kèm tiêu đề và URL.\n"
                "3. ĐỀ NGHỊ người dùng có thể hỏi thêm theo hướng nào.\n"
                "4. TUYỆT ĐỐI KHÔNG tự suy diễn hay của mình đưa ra thông tin không có trong nguồn gợi ý trên."
            )
        else:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh. Hãy trả lời câu hỏi của người dùng dựa vào ngữ cảnh (Context) được cung cấp dưới đây. "
                "Nếu thông tin không có trong ngữ cảnh, hãy dùng kiến thức của bạn hoặc nói không biết. "
                "Trích dẫn nguồn (tiêu đề, URL) rõ ràng nếu bạn dùng thông tin từ ngữ cảnh.\n\n"
                "NGỮ CẢNH:\n" + (context_str if context_str else "Không tìm thấy dữ liệu liên quan.")
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
