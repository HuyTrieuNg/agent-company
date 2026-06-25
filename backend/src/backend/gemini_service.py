"""Gemini API service for content generation using google-genai SDK."""
import logging
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def get_gemini_client(api_key: str) -> genai.Client:
    """Return a cached Gemini client for the given API key."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=api_key)
        logger.info("[Gemini] Client initialised.")
    return _client


async def generate_gemini_content(
    api_key: str,
    model: str,
    contents: str,
    system_instruction: str | None = None,
    max_output_tokens: int = 8192,
    temperature: float = 0.2,
) -> str:
    """Generate text content via Gemini API (async).

    Args:
        api_key:            Gemini API key.
        model:              Model name, e.g. ``"gemini-2.0-flash"``.
        contents:           User prompt string.
        system_instruction: Optional system prompt.
        max_output_tokens:  Maximum tokens in the response.
        temperature:        Sampling temperature.

    Returns:
        Generated text, or an empty string on failure.
    """
    client = get_gemini_client(api_key)

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
    )

    logger.info(f"[Gemini] Querying model {model} ...")
    response = await client.aio.models.generate_content(
        model=model,
        contents=contents,
        config=config,
    )
    return response.text or ""
