"""Gemini API service for content generation using google-genai SDK."""
import asyncio
import logging
from typing import TYPE_CHECKING
from google import genai
from google.genai import types

if TYPE_CHECKING:
    from .models import ChatMessage

logger = logging.getLogger(__name__)

_client: genai.Client | None = None

# Hard timeout for a single Gemini API call (seconds)
GEMINI_CALL_TIMEOUT = 30.0


def get_gemini_client(api_key: str) -> genai.Client:
    """Return a cached Gemini client for the given API key."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=api_key)
        logger.info("[Gemini] Client initialised.")
    return _client


def _build_contents(
    history: list["ChatMessage"] | None,
    message: str,
) -> list[types.Content]:
    """
    Chuyển đổi history + message mới thành list[types.Content] theo Gemini format.

    Gemini chỉ nhận role 'user' và 'model'.
    Lưu ý: turns phải xen kẽ user/model và bắt đầu bằng 'user'.
    """
    contents: list[types.Content] = []

    if history:
        for msg in history:
            role = "model" if msg.role == "model" else "user"
            contents.append(
                types.Content(role=role, parts=[types.Part(text=msg.content)])
            )

    # Thêm tin nhắn mới của user
    contents.append(
        types.Content(role="user", parts=[types.Part(text=message)])
    )
    return contents


async def generate_gemini_content(
    api_key: str,
    model: str,
    contents: str | list["ChatMessage"],
    system_instruction: str | None = None,
    max_output_tokens: int = 8192,
    temperature: float = 0.2,
    history: list["ChatMessage"] | None = None,
) -> str:
    """Generate text content via Gemini API (async).

    Args:
        api_key:            Gemini API key.
        model:              Model name, e.g. ``"gemini-2.0-flash"``.
        contents:           User prompt string HOẶC list ChatMessage (history + message cuối).
        system_instruction: Optional system prompt.
        max_output_tokens:  Maximum tokens in the response.
        temperature:        Sampling temperature.
        history:            (Optional) Nếu truyền riêng, sẽ dùng cùng contents (str) làm message mới.

    Returns:
        Generated text, or an empty string on failure.

    Raises:
        asyncio.TimeoutError: If the API call exceeds GEMINI_CALL_TIMEOUT seconds.
        Exception: On API errors (including 429 rate-limit).
    """
    client = get_gemini_client(api_key)

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        # Tắt Automatic Function Calling để tránh SDK tự retry vô hạn khi gặp 429
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            disable=True,
        ),
    )

    # Xây dựng contents đúng format multi-turn
    if history is not None and isinstance(contents, str):
        # Truyền history riêng + message mới là string — đây là path chính cho chat
        gemini_contents = _build_contents(history, contents)
    elif isinstance(contents, list) and len(contents) > 0:
        # contents là list ChatMessage — tất cả trừ phần tử cuối là history, cuối là user msg mới
        gemini_contents = _build_contents(contents[:-1], contents[-1].content)
    else:
        # contents là string thuần (không có history) — dùng cho query rewrite
        gemini_contents = contents  # type: ignore[assignment]

    logger.info(f"[Gemini] Querying model {model} (turns={len(gemini_contents) if isinstance(gemini_contents, list) else 1})...")

    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model,
                contents=gemini_contents,
                config=config,
            ),
            timeout=GEMINI_CALL_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.error(
            f"[Gemini] Request to {model} timed out after {GEMINI_CALL_TIMEOUT}s. "
            "Check network connectivity or Gemini API status."
        )
        raise
    except Exception as exc:
        # Log rõ lỗi 429 / quota exceeded để dễ debug
        err_str = str(exc)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            logger.error(
                f"[Gemini] Rate limit / quota exceeded on model '{model}'. "
                "Consider switching model or waiting before retrying. "
                f"Detail: {err_str[:300]}"
            )
        else:
            logger.error(f"[Gemini] API error on model '{model}': {exc}", exc_info=True)
        raise

    return response.text or ""
