from google import genai
from google.genai import types
from .config import settings
from .models import ChatMessage

# Initialize Gemini client
_client = genai.Client(api_key=settings.gemini_api_key)


def _build_history(history: list[ChatMessage]) -> list[types.Content]:
    """Convert our message format to Gemini SDK Content format."""
    return [
        types.Content(
            role=msg.role,
            parts=[types.Part(text=msg.content)],
        )
        for msg in history
    ]


async def get_gemini_response(
    message: str, history: list[ChatMessage]
) -> str:
    """Send message to Gemini API and return the response text."""
    contents = [
        *_build_history(history),
        types.Content(
            role="user",
            parts=[types.Part(text=message)],
        ),
    ]

    response = await _client.aio.models.generate_content(
        model=settings.model_name,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are a helpful, friendly, and knowledgeable AI assistant. "
                "Respond concisely and accurately. Support both Vietnamese and English."
            ),
        ),
    )
    return response.text or ""
