"""Gemini API service for content generation using google-genai SDK."""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import Any, cast

from google import genai
from google.genai import types

from ..core.config import settings
from ..schemas.chat import ChatMessage

logger = logging.getLogger(__name__)

# Hard timeout cho chat response (ngrok/cloud có thể chậm hơn local)
GEMINI_CALL_TIMEOUT = 60.0
# Timeout riêng cho query rewrite (nhanh hơn, model nhỏ hơn)
GEMINI_FAST_TIMEOUT = 20.0


def _build_contents(
    history: list[ChatMessage] | None,
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
            contents.append(types.Content(role=role, parts=[types.Part(text=msg.content)]))

    # Thêm tin nhắn mới của user
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    return contents


class GeminiService:
    """Class-based service for Google Gemini API interactions."""

    def __init__(
        self,
        api_key: str = "",
        default_fast_model: str | list[str] | None = None,
        default_chat_model: str | list[str] | None = None,
        call_timeout: float = GEMINI_CALL_TIMEOUT,
        fast_timeout: float = GEMINI_FAST_TIMEOUT,
        client: genai.Client | None = None,
    ) -> None:
        self.api_key = api_key
        self.default_fast_model = default_fast_model or [
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash",
            "gemini-3-flash-preview",
            "gemini-2.5-flash",
        ]
        self.default_chat_model = default_chat_model or [
            "gemini-3.5-flash",
            "gemini-3-flash-preview",
            "gemini-3.1-flash-lite",
            "gemini-2.5-flash",
        ]
        self.call_timeout = call_timeout
        self.fast_timeout = fast_timeout
        self._client: genai.Client | None = client

    def get_client(self, api_key: str | None = None) -> genai.Client:
        """Return a cached or new Gemini client."""
        effective_key = api_key or self.api_key
        if self._client is not None and not (api_key and api_key != self.api_key):
            return self._client
        return get_gemini_client(effective_key)

    async def generate_content(
        self,
        contents: str | list[ChatMessage],
        model: str | list[str] | None = None,
        api_key: str | None = None,
        system_instruction: str | None = None,
        max_output_tokens: int = 8192,
        temperature: float = 0.2,
        history: list[ChatMessage] | None = None,
        timeout: float | None = None,
    ) -> str:
        """Generate text content via Gemini API (async) with fallback support."""
        effective_key = api_key or self.api_key
        client = self.get_client(effective_key)
        target_model = self.default_fast_model if model is None else model

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            # Tắt Automatic Function Calling để tránh SDK tự retry vô hạn khi gặp 429
            automatic_function_calling=types.AutomaticFunctionCallingConfig(
                disable=True,
            ),
        )

        models_to_try = [target_model] if isinstance(target_model, str) else list(target_model)
        if not models_to_try:
            raise ValueError("[Gemini] Fallback model list is empty.")

        gemini_contents: types.ContentListUnion
        if history is not None and isinstance(contents, str):
            gemini_contents = cast(types.ContentListUnion, _build_contents(history, contents))
        elif isinstance(contents, list) and len(contents) > 0:
            gemini_contents = cast(
                types.ContentListUnion, _build_contents(contents[:-1], contents[-1].content)
            )
        else:
            gemini_contents = contents if isinstance(contents, str) else str(contents)

        effective_timeout = timeout if timeout is not None else self.call_timeout
        last_exception: Exception | None = None

        for idx, current_model in enumerate(models_to_try):
            logger.info(
                f"[Gemini] Querying model '{current_model}' (attempt {idx + 1}/{len(models_to_try)}, "
                f"turns={len(gemini_contents) if isinstance(gemini_contents, list) else 1})....",
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
            except TimeoutError as exc:
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
                        "Trying next model if available..."
                    )
                else:
                    logger.warning(
                        f"[Gemini] API error on model '{current_model}': {exc}. "
                        "Trying next model if available..."
                    )
                last_exception = exc

        logger.error(f"[Gemini] All models failed in fallback chain. Last error: {last_exception}")
        if last_exception:
            raise last_exception
        raise Exception("[Gemini] Fallback chain failed without any last exception recorded.")

    async def generate_content_with_tools(
        self,
        message: str,
        model: str | list[str] | None = None,
        api_key: str | None = None,
        history: list[ChatMessage] | None = None,
        system_instruction: str | None = None,
        tool_declarations: list[dict[str, Any]] | None = None,
        tool_executor: Callable[[str, dict[str, Any]], Coroutine[Any, Any, str]] | None = None,
        max_iterations: int = 5,
        timeout: float | None = None,
    ) -> str:
        """Generate content with Gemini Function Calling support."""
        effective_key = api_key or self.api_key
        client = self.get_client(effective_key)
        target_model = self.default_chat_model if model is None else model
        models_to_try = [target_model] if isinstance(target_model, str) else list(target_model)
        if not models_to_try:
            raise ValueError("[Gemini] Fallback model list is empty.")
        effective_timeout = timeout if timeout is not None else self.call_timeout

        gemini_tools = None
        if tool_declarations:
            fn_declarations: list[types.FunctionDeclaration] = []
            for td in tool_declarations:
                params = td.get("parameters", {})
                properties: dict[str, types.Schema] = {}
                for prop_name, prop_info in params.get("properties", {}).items():
                    schema_kwargs: dict[str, Any] = {
                        "description": prop_info.get("description", "")
                    }
                    ptype = prop_info.get("type", "string").upper()
                    if ptype == "INTEGER":
                        schema_kwargs["type"] = types.Type.INTEGER
                    elif ptype == "BOOLEAN":
                        schema_kwargs["type"] = types.Type.BOOLEAN
                    else:
                        schema_kwargs["type"] = types.Type.STRING
                    if "enum" in prop_info:
                        schema_kwargs["enum"] = prop_info["enum"]
                    properties[prop_name] = types.Schema(**schema_kwargs)

                fn_declarations.append(
                    types.FunctionDeclaration(
                        name=td["name"],
                        description=td.get("description", ""),
                        parameters=types.Schema(
                            type=types.Type.OBJECT,
                            properties=properties,
                            required=params.get("required", []),
                        ),
                    )
                )
            gemini_tools = [types.Tool(function_declarations=fn_declarations)]

        contents: list[types.ContentUnion] = list(_build_contents(history, message))

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            max_output_tokens=8192,
            temperature=0.2,
            tools=gemini_tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

        last_exception: Exception | None = None
        response: Any = None

        for iteration in range(max_iterations):
            response = None
            for _idx, current_model in enumerate(models_to_try):
                try:
                    logger.info(
                        f"[Gemini Tools] iter={iteration} model='{current_model}' "
                        f"turns={len(contents)}"
                    )
                    response = await asyncio.wait_for(
                        client.aio.models.generate_content(
                            model=current_model,
                            contents=contents,
                            config=config,
                        ),
                        timeout=effective_timeout,
                    )
                    break
                except TimeoutError as exc:
                    logger.error(f"[Gemini Tools] Timeout on model '{current_model}'")
                    last_exception = exc
                except Exception as exc:
                    logger.warning(f"[Gemini Tools] Error on model '{current_model}': {exc}")
                    last_exception = exc

            if response is None:
                if last_exception:
                    raise last_exception
                raise Exception("[Gemini Tools] All models failed.")

            function_calls: list[types.FunctionCall] = []
            if response.candidates:
                for candidate in response.candidates:
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, "function_call") and part.function_call:
                                function_calls.append(part.function_call)

            if not function_calls:
                return response.text or ""

            logger.info(f"[Gemini Tools] Executing {len(function_calls)} function call(s)")
            if response.candidates and response.candidates[0].content:
                contents.append(response.candidates[0].content)

            tool_results: list[types.Part] = []
            for fc in function_calls:
                fn_name: str = str(fc.name or "")
                raw_args: Any = fc.args
                fn_args: dict[str, Any] = dict(raw_args) if raw_args else {}
                logger.info(f"[Gemini Tools] Calling tool '{fn_name}' with args: {fn_args}")

                result_str = await tool_executor(fn_name, fn_args) if tool_executor else "{}"
                tool_results.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fn_name,
                            response={"result": result_str},
                        )
                    )
                )

            contents.append(types.Content(role="user", parts=tool_results))

        logger.warning("[Gemini Tools] Max iterations reached.")
        return (response.text or "") if response is not None else ""


_client_cache: dict[str, genai.Client] = {}


def get_gemini_client(api_key: str | None = None) -> genai.Client:
    """Return a cached Gemini client for the given API key."""
    key = api_key or ""
    if key not in _client_cache:
        _client_cache[key] = genai.Client(api_key=key)
        logger.info("[Gemini] Client initialised.")
    return _client_cache[key]


# Global default service instance
_default_gemini_service = GeminiService(api_key=settings.gemini_api_key)


async def generate_gemini_content(
    api_key: str = "",
    model: str | list[str] | None = None,
    contents: str | list[ChatMessage] | None = None,
    system_instruction: str | None = None,
    max_output_tokens: int = 8192,
    temperature: float = 0.2,
    history: list[ChatMessage] | None = None,
    timeout: float | None = None,
) -> str:
    """Module-level function for generate_gemini_content."""
    return await _default_gemini_service.generate_content(
        contents=contents or "",
        model=model,
        api_key=api_key,
        system_instruction=system_instruction,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        history=history,
        timeout=timeout,
    )


async def generate_gemini_content_with_tools(
    api_key: str = "",
    model: str | list[str] | None = None,
    message: str = "",
    history: list[ChatMessage] | None = None,
    system_instruction: str | None = None,
    tool_declarations: list[dict[str, Any]] | None = None,
    tool_executor: Callable[[str, dict[str, Any]], Coroutine[Any, Any, str]] | None = None,
    max_iterations: int = 5,
    timeout: float | None = None,
) -> str:
    """Module-level function for generate_gemini_content_with_tools."""
    return await _default_gemini_service.generate_content_with_tools(
        message=message,
        model=model,
        api_key=api_key,
        history=history,
        system_instruction=system_instruction,
        tool_declarations=tool_declarations,
        tool_executor=tool_executor,
        max_iterations=max_iterations,
        timeout=timeout,
    )
