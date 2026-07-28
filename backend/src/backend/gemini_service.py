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


async def generate_gemini_content_with_tools(
    api_key: str,
    model: str | list[str],
    message: str,
    history: list["ChatMessage"] | None = None,
    system_instruction: str | None = None,
    tool_declarations: list[dict] | None = None,
    tool_executor=None,
    max_iterations: int = 5,
    timeout: float | None = None,
) -> str:
    """Generate content with Gemini Function Calling support.
    
    Thực hiện vòng lặp tool calling cho đến khi model không cần gọi thêm tool nào.
    """
    from google.genai.types import (
        Content, FunctionDeclaration, FunctionResponse, GenerateContentConfig,
        Part, Schema, Tool,
    )
    
    client = get_gemini_client(api_key)
    models_to_try = [model] if isinstance(model, str) else list(model)
    effective_timeout = timeout if timeout is not None else GEMINI_CALL_TIMEOUT
    
    # Build Gemini tools
    gemini_tools = None
    if tool_declarations:
        fn_declarations = []
        for td in tool_declarations:
            params = td.get("parameters", {})
            properties = {}
            for prop_name, prop_info in params.get("properties", {}).items():
                schema_kwargs = {"description": prop_info.get("description", "")}
                ptype = prop_info.get("type", "string").upper()
                if ptype == "INTEGER":
                    schema_kwargs["type"] = "INTEGER"
                elif ptype == "BOOLEAN":
                    schema_kwargs["type"] = "BOOLEAN"
                else:
                    schema_kwargs["type"] = "STRING"
                if "enum" in prop_info:
                    schema_kwargs["enum"] = prop_info["enum"]
                properties[prop_name] = Schema(**schema_kwargs)
            
            fn_declarations.append(FunctionDeclaration(
                name=td["name"],
                description=td["description"],
                parameters=Schema(
                    type="OBJECT",
                    properties=properties,
                    required=params.get("required", []),
                ),
            ))
        gemini_tools = [Tool(function_declarations=fn_declarations)]
    
    # Build initial contents
    contents = _build_contents(history, message)
    
    config = GenerateContentConfig(
        system_instruction=system_instruction,
        max_output_tokens=8192,
        temperature=0.2,
        tools=gemini_tools,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    
    last_exception = None
    
    for iteration in range(max_iterations):
        # Try each model in fallback chain
        response = None
        for idx, current_model in enumerate(models_to_try):
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
                break  # Success
            except asyncio.TimeoutError as exc:
                logger.error(f"[Gemini Tools] Timeout on model '{current_model}'")
                last_exception = exc
            except Exception as exc:
                logger.warning(f"[Gemini Tools] Error on model '{current_model}': {exc}")
                last_exception = exc
        
        if response is None:
            if last_exception:
                raise last_exception
            raise Exception("[Gemini Tools] All models failed.")
        
        # Check for function calls
        function_calls = []
        if response.candidates:
            for candidate in response.candidates:
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'function_call') and part.function_call:
                            function_calls.append(part.function_call)
        
        if not function_calls:
            # No more function calls — return text
            return response.text or ""
        
        # Execute all function calls
        logger.info(f"[Gemini Tools] Executing {len(function_calls)} function call(s)")
        
        # Add model's response (with function calls) to contents
        contents.append(response.candidates[0].content)
        
        # Execute tools and add results
        tool_results = []
        for fc in function_calls:
            fn_name = fc.name
            fn_args = dict(fc.args) if fc.args else {}
            logger.info(f"[Gemini Tools] Calling tool '{fn_name}' with args: {fn_args}")
            
            result_str = await tool_executor(fn_name, fn_args)
            tool_results.append(
                Part(function_response=FunctionResponse(
                    name=fn_name,
                    response={"result": result_str},
                ))
            )
        
        contents.append(Content(role="user", parts=tool_results))
    
    # Max iterations reached — return last text if available
    logger.warning("[Gemini Tools] Max iterations reached.")
    return response.text or "" if response else ""
