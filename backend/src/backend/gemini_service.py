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

# Hard timeout cho chat response (ngrok/cloud có thể chậm hơn local)
GEMINI_CALL_TIMEOUT = 60.0
# Timeout riêng cho query rewrite (nhanh hơn, model nhỏ hơn)
GEMINI_FAST_TIMEOUT = 20.0


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
    model: str | list[str],
    contents: str | list["ChatMessage"],
    system_instruction: str | None = None,
    max_output_tokens: int = 8192,
    temperature: float = 0.2,
    history: list["ChatMessage"] | None = None,
    timeout: float | None = None,
) -> str:
    """Generate text content via Gemini API (async) with fallback support.

    Args:
        api_key:            Gemini API key.
        model:              Model name or list of model names for fallback.
        contents:           User prompt string HOẶC list ChatMessage (history + message cuối).
        system_instruction: Optional system prompt.
        max_output_tokens:  Maximum tokens in the response.
        temperature:        Sampling temperature.
        history:            (Optional) Nếu truyền riêng, sẽ dùng cùng contents (str) làm message mới.
        timeout:            Thời gian timeout (giây). Mặc định dùng GEMINI_CALL_TIMEOUT.

    Returns:
        Generated text, or an empty string on failure.

    Raises:
        asyncio.TimeoutError: If all API calls exceed timeout seconds.
        Exception: If all models in the fallback list fail.
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

    # Convert model to list of fallback models
    models_to_try = [model] if isinstance(model, str) else list(model)
    if not models_to_try:
        raise ValueError("[Gemini] Fallback model list is empty.")

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

    effective_timeout = timeout if timeout is not None else GEMINI_CALL_TIMEOUT
    last_exception = None

    for idx, current_model in enumerate(models_to_try):
        logger.info(
            f"[Gemini] Querying model '{current_model}' (attempt {idx + 1}/{len(models_to_try)}, "
            f"turns={len(gemini_contents) if isinstance(gemini_contents, list) else 1})...."
        )
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=current_model,
                    contents=gemini_contents,
                    config=config,
                ),
                timeout=effective_timeout,
            )
            return response.text or ""
        except asyncio.TimeoutError as exc:
            logger.error(
                f"[Gemini] Request to model '{current_model}' timed out after {effective_timeout}s. "
                "Trying next model if available..."
            )
            last_exception = exc
        except Exception as exc:
            err_str = str(exc)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                logger.warning(
                    f"[Gemini] Rate limit / quota exceeded on model '{current_model}'. "
                    f"Trying next model if available..."
                )
            else:
                logger.warning(
                    f"[Gemini] API error on model '{current_model}': {exc}. "
                    f"Trying next model if available..."
                )
            last_exception = exc

    # If we reached here, all models failed
    logger.error(f"[Gemini] All models failed in fallback chain. Last error: {last_exception}")
    if last_exception:
        raise last_exception
    raise Exception("[Gemini] Fallback chain failed without any last exception recorded.")
