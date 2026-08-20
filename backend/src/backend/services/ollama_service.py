"""Ollama API service for local LLM generation."""

import logging
from typing import Any, cast

import httpx

from ..core.config import settings
from ..schemas.chat import ChatMessage

logger = logging.getLogger(__name__)


class OllamaService:
    """Class-based service for Ollama local LLM interactions."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        default_model: str = "gemma3:4b",
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url
        self.default_model = default_model
        self._client = http_client

    async def generate_content(
        self,
        model: str | None = None,
        contents: Any = None,
        system_instruction: str | None = None,
        json_format: bool = False,
        num_predict: int = 4096,
        num_ctx: int = 8192,
    ) -> str:
        """Generate content using local Ollama instance."""
        target_model = model or self.default_model
        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})

        if isinstance(contents, str):
            messages.append({"role": "user", "content": contents})
        elif isinstance(contents, list):
            for raw_msg in cast(list[Any], contents):
                msg: Any = raw_msg
                if isinstance(msg, ChatMessage):
                    role = msg.role
                    content = msg.content
                elif isinstance(msg, dict):
                    msg_dict: dict[str, Any] = cast(dict[str, Any], msg)
                    role = str(msg_dict.get("role", "user"))
                    content = str(msg_dict.get("content", ""))
                else:
                    continue

                if role == "model":
                    role = "assistant"
                messages.append({"role": role, "content": content})

        payload: dict[str, Any] = {
            "model": target_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.0 if json_format else 0.2,
                "num_predict": num_predict,
                "num_ctx": num_ctx,
            },
        }
        if json_format:
            payload["format"] = "json"

        url = f"{self.base_url}/api/chat"

        if self._client:
            logger.info(f"Querying Ollama model {target_model}...")
            response = await self._client.post(url, json=payload, timeout=600.0)
            response.raise_for_status()
            data = response.json()
            return str(data.get("message", {}).get("content", ""))
        else:
            async with httpx.AsyncClient(timeout=600.0) as client:
                logger.info(f"Querying Ollama model {target_model}...")
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return str(data.get("message", {}).get("content", ""))

    async def get_ollama_response(self, message: str, history: list[ChatMessage]) -> str:
        """Send message to Ollama API and return the response text."""
        messages = list(history) + [ChatMessage(role="user", content=message)]
        return await self.generate_content(
            model=self.default_model,
            contents=messages,
            system_instruction=(
                "You are a helpful, friendly, and knowledgeable AI assistant. "
                "Respond concisely and accurately. Support both Vietnamese and English."
            ),
            json_format=False,
        )


# Global default service instance
_default_ollama_service = OllamaService(
    base_url=settings.ollama_base_url,
    default_model=settings.model_name,
)


async def generate_ollama_content(
    model: str = "",
    contents: str | list[ChatMessage] | list[dict[str, Any]] | None = None,
    system_instruction: str | None = None,
    json_format: bool = False,
    num_predict: int = 4096,
    num_ctx: int = 8192,
    prompt: str | None = None,
) -> str:
    """Module-level function for generate_ollama_content."""
    effective_contents = contents if contents is not None else prompt or ""
    return await _default_ollama_service.generate_content(
        model=model or None,
        contents=effective_contents,
        system_instruction=system_instruction,
        json_format=json_format,
        num_predict=num_predict,
        num_ctx=num_ctx,
    )


async def get_ollama_response(message: str, history: list[ChatMessage]) -> str:
    """Module-level function for get_ollama_response."""
    return await _default_ollama_service.get_ollama_response(message, history)
