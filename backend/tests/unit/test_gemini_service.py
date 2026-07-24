import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from backend.gemini_service import generate_gemini_content, _build_contents
from backend.models import ChatMessage

@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_fallback_success(mock_get_client):
    # Setup mock client
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    
    # Use AsyncMock for the generate_content method to make it awaitable
    mock_generate = AsyncMock()
    mock_client.aio.models.generate_content = mock_generate
    
    # Simulate first model failing with 429, second model succeeding
    mock_response = MagicMock()
    mock_response.text = "Hello from fallback model!"
    
    mock_generate.side_effect = [
        Exception("429 RESOURCE_EXHAUSTED"),
        mock_response
    ]
    
    models = ["gemini-3.1-pro-preview", "gemini-2.5-flash"]
    
    result = await generate_gemini_content(
        api_key="mock-key",
        model=models,
        contents="Hi",
    )
    
    assert result == "Hello from fallback model!"
    # Verify both models were queried in order
    assert mock_generate.call_count == 2
    
    # 1st call args
    args1, kwargs1 = mock_generate.call_args_list[0]
    assert kwargs1["model"] == "gemini-3.1-pro-preview"
    
    # 2nd call args
    args2, kwargs2 = mock_generate.call_args_list[1]
    assert kwargs2["model"] == "gemini-2.5-flash"


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_all_fail(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    
    mock_generate = AsyncMock()
    mock_client.aio.models.generate_content = mock_generate
    
    # All models fail
    mock_generate.side_effect = [
        Exception("429 First model limit"),
        Exception("500 Second model error")
    ]
    
    models = ["model-1", "model-2"]
    
    with pytest.raises(Exception, match="500 Second model error"):
        await generate_gemini_content(
            api_key="mock-key",
            model=models,
            contents="Hi",
        )
        
    assert mock_generate.call_count == 2

@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_single_model_success(mock_get_client):
    """Single model string (not a list) succeeds on first attempt."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_generate = AsyncMock()
    mock_client.aio.models.generate_content = mock_generate
    mock_response = MagicMock()
    mock_response.text = "Single model reply"
    mock_generate.return_value = mock_response

    result = await generate_gemini_content(
        api_key="mock-key",
        model="gemini-2.5-flash",
        contents="Hello",
    )

    assert result == "Single model reply"
    assert mock_generate.call_count == 1
    _, kwargs = mock_generate.call_args
    assert kwargs["model"] == "gemini-2.5-flash"


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_empty_text_response(mock_get_client):
    """If model returns None text, result should be empty string (not None)."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_generate = AsyncMock()
    mock_client.aio.models.generate_content = mock_generate
    mock_response = MagicMock()
    mock_response.text = None
    mock_generate.return_value = mock_response

    result = await generate_gemini_content(
        api_key="mock-key",
        model="gemini-2.5-flash",
        contents="prompt",
    )

    assert result == ""


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_empty_model_list_raises(mock_get_client):
    """Empty model list should raise ValueError immediately."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    with pytest.raises(ValueError, match="Fallback model list is empty"):
        await generate_gemini_content(
            api_key="mock-key",
            model=[],
            contents="Hi",
        )


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_with_history(mock_get_client):
    """When history + string contents are provided, _build_contents is used (multi-turn)."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_generate = AsyncMock()
    mock_client.aio.models.generate_content = mock_generate
    mock_response = MagicMock()
    mock_response.text = "Multi-turn reply"
    mock_generate.return_value = mock_response

    history = [
        ChatMessage(role="user", content="Xin chào"),
        ChatMessage(role="model", content="Chào bạn!"),
    ]

    result = await generate_gemini_content(
        api_key="mock-key",
        model="gemini-2.5-flash",
        contents="Hôm nay bạn thế nào?",
        history=history,
    )

    assert result == "Multi-turn reply"
    _, kwargs = mock_generate.call_args
    # contents should be a list (multi-turn format), not a plain string
    assert isinstance(kwargs["contents"], list)
    # 2 history turns + 1 new user message = 3 Content objects
    assert len(kwargs["contents"]) == 3


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_generate_gemini_content_timeout_raises(mock_get_client):
    """TimeoutError on all models should propagate as the last exception."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    async def slow_generate(**kwargs):
        await asyncio.sleep(10)  # never actually reached — wait_for interrupts

    mock_client.aio.models.generate_content = slow_generate

    with pytest.raises(asyncio.TimeoutError):
        await generate_gemini_content(
            api_key="mock-key",
            model=["fast-model"],
            contents="Hi",
            timeout=0.01,  # effectively instant timeout
        )


# ──────────────────────────────────────────────────────────
# Unit tests for _build_contents helper
# ──────────────────────────────────────────────────────────

def test_build_contents_no_history():
    """No history → single Content with role=user."""
    result = _build_contents(history=None, message="Hello")
    assert len(result) == 1
    assert result[0].role == "user"


def test_build_contents_with_history():
    """History items are prepended before the new user message."""
    history = [
        ChatMessage(role="user", content="Câu hỏi 1"),
        ChatMessage(role="model", content="Câu trả lời 1"),
    ]
    result = _build_contents(history=history, message="Câu hỏi 2")
    assert len(result) == 3
    assert result[0].role == "user"
    assert result[1].role == "model"
    assert result[2].role == "user"
    # Verify the last message content
    assert result[2].parts[0].text == "Câu hỏi 2"


def test_build_contents_role_mapping():
    """Any non-'model' role in history should be mapped to 'user'."""
    history = [
        ChatMessage(role="system", content="System message"),
    ]
    result = _build_contents(history=history, message="Hi")
    assert result[0].role == "user"   # 'system' → 'user'
