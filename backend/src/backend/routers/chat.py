from fastapi import APIRouter, HTTPException
from ..models import ChatMessage, ChatRequest, ChatResponse
from ..gemini_service import get_gemini_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a message to Gemini and receive a reply.
    The client passes the conversation history to maintain context.
    """
    try:
        reply = await get_gemini_response(request.message, request.history)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Build updated history to return to the client
    updated_history = [
        *request.history,
        ChatMessage(role="user", content=request.message),
        ChatMessage(role="model", content=reply),
    ]

    return ChatResponse(reply=reply, history=updated_history)
