import httpx
import logging
from .config import settings
from .models import ChatMessage

logger = logging.getLogger(__name__)

async def generate_ollama_content(
    model: str,
    contents: str | list[ChatMessage] | list[dict],
    system_instruction: str = None,
    json_format: bool = False,
    num_predict: int = 4096,
    num_ctx: int = 8192,
) -> str:
    """
    Generate content using local Ollama.
    num_predict: max output tokens (default 4096 to avoid mid-sentence cutoff).
    num_ctx:     context window size (default 8192 to read long article contexts).
    """
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})

    if isinstance(contents, str):
        messages.append({"role": "user", "content": contents})
    elif isinstance(contents, list):
        for msg in contents:
            if isinstance(msg, ChatMessage):
                role = msg.role
                content = msg.content
            elif isinstance(msg, dict):
                role = msg.get("role", "user")
                content = msg.get("content", "")
            else:
                continue
            
            if role == "model":
                role = "assistant"
            messages.append({"role": role, "content": content})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.0 if json_format else 0.2,
            "num_predict": num_predict,
            "num_ctx": num_ctx,
        }
    }
    if json_format:
        payload["format"] = "json"

    url = f"{settings.ollama_base_url}/api/chat"
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        logger.info(f"Querying Ollama model {model}...")
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "")


async def get_ollama_response(
    message: str, history: list[ChatMessage]
) -> str:
    """Send message to Ollama API and return the response text."""
    messages = list(history) + [ChatMessage(role="user", content=message)]
    
    return await generate_ollama_content(
        model=settings.model_name,
        contents=messages,
        system_instruction=(
            "You are a helpful, friendly, and knowledgeable AI assistant. "
            "Respond concisely and accurately. Support both Vietnamese and English."
        ),
        json_format=False
    )
