from fastapi import APIRouter, HTTPException
import logging
from ..models import ChatMessage, ChatRequest, ChatResponse
from ..ollama_service import generate_ollama_content
from ..gemini_service import generate_gemini_content
from ..qdrant_service import search_articles
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a message with RAG context to Gemini (or fallback to Ollama).
    """
    try:
        # 1. Retrieve context from Qdrant
        logger.info(f"Searching context for query: {request.message}")
        chunks = await search_articles(request.message, limit=5)
        
        context_str = ""
        if chunks:
            context_pieces = []
            for i, chunk in enumerate(chunks, 1):
                title = chunk.get("article_title", "Không rõ")
                site = chunk.get("site", "Không rõ")
                url = chunk.get("article_url", "")
                text = chunk.get("text", "")
                context_pieces.append(f"[Tài liệu {i}]\nTiêu đề: {title}\nNguồn: {site}\nNội dung: {text}\nURL: {url}")
            context_str = "\n---\n".join(context_pieces)
        
        system_instruction = (
            "Bạn là trợ lý ảo thông minh. Hãy trả lời câu hỏi của người dùng dựa vào ngữ cảnh (Context) được cung cấp dưới đây. "
            "Nếu thông tin không có trong ngữ cảnh, hãy dùng kiến thức của bạn hoặc nói không biết. "
            "Trích dẫn nguồn (tiêu đề, URL) rõ ràng nếu bạn dùng thông tin từ ngữ cảnh.\n\n"
            "NGỮ CẢNH:\n" + (context_str if context_str else "Không tìm thấy dữ liệu liên quan.")
        )

        reply = ""
        
        # 2. Call LLM
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

    # Build updated history
    updated_history = [
        *request.history,
        ChatMessage(role="user", content=request.message),
        ChatMessage(role="model", content=reply),
    ]

    return ChatResponse(reply=reply, history=updated_history)

