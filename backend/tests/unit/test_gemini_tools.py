"""Unit tests for generate_gemini_content_with_tools (Function Calling loop).

Tests the tool calling state machine:
  1. Model returns function_call → tools executed → model gets results → final reply
  2. Model returns text directly → no tool calls
  3. Multiple tool calls in one iteration
  4. Max iterations guard
  5. Model fallback on error (429/timeout)
  6. Tool executor error is surfaced in result
  7. chat endpoint uses generate_gemini_content_with_tools (smoke test)
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.gemini_service import generate_gemini_content_with_tools

# ─────────────────────────────────────────────────────────────
# Helpers to build Gemini-like mock responses
# ─────────────────────────────────────────────────────────────


def _make_fc_part(name: str, args: dict):
    """Create a MagicMock that looks like a Gemini Part with a function_call."""
    fc = MagicMock()
    fc.name = name
    fc.args = args
    part = MagicMock()
    part.function_call = fc
    return part


def _make_text_response(text: str) -> MagicMock:
    """Response with no function calls — model just returns text."""
    resp = MagicMock()
    resp.text = text
    candidate = MagicMock()
    candidate.content.parts = []  # no function_call parts
    resp.candidates = [candidate]
    return resp


def _make_fc_response(name: str, args: dict) -> MagicMock:
    """Response containing ONE function call, no text yet."""
    resp = MagicMock()
    resp.text = None
    fc_part = _make_fc_part(name, args)
    candidate = MagicMock()
    candidate.content.parts = [fc_part]
    resp.candidates = [candidate]
    return resp


def _make_multi_fc_response(calls: list[tuple]) -> MagicMock:
    """Response containing MULTIPLE function calls."""
    resp = MagicMock()
    resp.text = None
    parts = [_make_fc_part(n, a) for n, a in calls]
    candidate = MagicMock()
    candidate.content.parts = parts
    resp.candidates = [candidate]
    return resp


# ─────────────────────────────────────────────────────────────
# Core tool-calling loop tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_no_tool_calls_returns_text_directly(mock_get_client):
    """When model doesn't call any tools, text is returned immediately."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    text_resp = _make_text_response("Xin chào!")
    mock_client.aio.models.generate_content = AsyncMock(return_value=text_resp)

    tool_executor = AsyncMock()

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model="gemini-flash",
        message="Hello",
        tool_executor=tool_executor,
    )

    assert result == "Xin chào!"
    tool_executor.assert_not_called()
    assert mock_client.aio.models.generate_content.call_count == 1


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_single_tool_call_then_text(mock_get_client):
    """
    Iteration 1: model calls get_stock_overview(VNM)
    Iteration 2: model receives tool result, returns final text
    """
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    fc_resp = _make_fc_response("get_stock_overview", {"symbol": "VNM"})
    text_resp = _make_text_response("VNM đang ở 72,000 VND")

    mock_client.aio.models.generate_content = AsyncMock(side_effect=[fc_resp, text_resp])

    tool_result = json.dumps({"symbol": "VNM", "current_price": 72000})
    tool_executor = AsyncMock(return_value=tool_result)

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model="gemini-flash",
        message="VNM giá bao nhiêu?",
        tool_executor=tool_executor,
    )

    assert result == "VNM đang ở 72,000 VND"
    # Tool executor was called once with the right function name
    tool_executor.assert_called_once_with("get_stock_overview", {"symbol": "VNM"})
    # generate_content called twice: fc + final
    assert mock_client.aio.models.generate_content.call_count == 2


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_multiple_tool_calls_in_one_iteration(mock_get_client):
    """
    Model requests TWO function calls in a single iteration.
    Both must be executed before the next generate_content call.
    """
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    multi_fc_resp = _make_multi_fc_response(
        [
            ("get_stock_overview", {"symbol": "VNM"}),
            ("get_stock_news", {"symbol": "VNM", "limit": 3}),
        ]
    )
    text_resp = _make_text_response("Đây là tổng hợp thông tin VNM.")

    mock_client.aio.models.generate_content = AsyncMock(side_effect=[multi_fc_resp, text_resp])

    tool_executor = AsyncMock(
        side_effect=[
            json.dumps({"symbol": "VNM", "current_price": 72000}),
            json.dumps({"news": [{"title": "Vinamilk Q1 tăng trưởng"}]}),
        ]
    )

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model="gemini-flash",
        message="Cho tôi thông tin về VNM",
        tool_executor=tool_executor,
    )

    assert result == "Đây là tổng hợp thông tin VNM."
    assert tool_executor.call_count == 2
    # Verify both tools were called correctly
    calls_made = [c.args for c in tool_executor.call_args_list]
    assert ("get_stock_overview", {"symbol": "VNM"}) in calls_made
    assert ("get_stock_news", {"symbol": "VNM", "limit": 3}) in calls_made


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_chained_tool_calls_two_iterations(mock_get_client):
    """
    Model makes one tool call in iter 1, then another in iter 2, then returns text.
    Tests that the conversation context grows correctly across iterations.
    """
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    fc_resp1 = _make_fc_response("get_stock_overview", {"symbol": "VNM"})
    fc_resp2 = _make_fc_response("get_stock_technicals", {"symbol": "VNM", "timeframe": "1Y"})
    text_resp = _make_text_response("Phân tích hoàn chỉnh VNM.")

    mock_client.aio.models.generate_content = AsyncMock(side_effect=[fc_resp1, fc_resp2, text_resp])
    tool_executor = AsyncMock(return_value=json.dumps({"ok": True}))

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model="gemini-flash",
        message="Phân tích kỹ thuật VNM",
        tool_executor=tool_executor,
    )

    assert result == "Phân tích hoàn chỉnh VNM."
    assert tool_executor.call_count == 2
    assert mock_client.aio.models.generate_content.call_count == 3


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_max_iterations_guard_stops_infinite_loop(mock_get_client):
    """If model keeps calling tools beyond max_iterations, loop stops gracefully."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    # Always return a function call — never text
    always_fc = _make_fc_response("get_stock_overview", {"symbol": "VNM"})
    always_fc.text = "partial text"  # so fallback returns something

    mock_client.aio.models.generate_content = AsyncMock(return_value=always_fc)
    tool_executor = AsyncMock(return_value=json.dumps({"ok": True}))

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model="gemini-flash",
        message="test",
        tool_executor=tool_executor,
        max_iterations=3,
    )

    # Should not raise — returns last available text or ""
    assert isinstance(result, str)
    # generate_content called at most max_iterations times
    assert mock_client.aio.models.generate_content.call_count <= 3


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_model_fallback_on_rate_limit(mock_get_client):
    """First model hits 429 → second model succeeds."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    text_resp = _make_text_response("Câu trả lời từ model backup")
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=[
            Exception("429 RESOURCE_EXHAUSTED"),
            text_resp,
        ]
    )

    tool_executor = AsyncMock()

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model=["model-primary", "model-backup"],
        message="test",
        tool_executor=tool_executor,
    )

    assert result == "Câu trả lời từ model backup"
    assert mock_client.aio.models.generate_content.call_count == 2


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_all_models_fail_raises_exception(mock_get_client):
    """When all models fail, exception is propagated."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("Service unavailable")
    )
    tool_executor = AsyncMock()

    with pytest.raises(Exception, match="Service unavailable"):
        await generate_gemini_content_with_tools(
            api_key="key",
            model=["model-a", "model-b"],
            message="test",
            tool_executor=tool_executor,
        )


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_timeout_raises_timeout_error(mock_get_client):
    """asyncio.TimeoutError is propagated when model is too slow."""
    import asyncio

    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    async def slow(*args, **kwargs):
        await asyncio.sleep(10)

    mock_client.aio.models.generate_content = slow

    with pytest.raises(asyncio.TimeoutError):
        await generate_gemini_content_with_tools(
            api_key="key",
            model="slow-model",
            message="test",
            tool_executor=AsyncMock(),
            timeout=0.01,
        )


@pytest.mark.asyncio
@patch("backend.gemini_service.get_gemini_client")
async def test_tool_executor_error_result_sent_to_model(mock_get_client):
    """
    If tool_executor returns an error JSON string, it is sent to the model
    as tool result. The model should still receive it and continue.
    """
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    fc_resp = _make_fc_response("get_stock_overview", {"symbol": "INVALID"})
    text_resp = _make_text_response("Không tìm thấy mã chứng khoán INVALID.")

    mock_client.aio.models.generate_content = AsyncMock(side_effect=[fc_resp, text_resp])
    # Tool executor returns error JSON (not raises — service-level graceful handling)
    tool_executor = AsyncMock(return_value=json.dumps({"error": "Symbol not found"}))

    result = await generate_gemini_content_with_tools(
        api_key="key",
        model="gemini-flash",
        message="INVALID giá bao nhiêu?",
        tool_executor=tool_executor,
    )

    assert result == "Không tìm thấy mã chứng khoán INVALID."
    tool_executor.assert_called_once_with("get_stock_overview", {"symbol": "INVALID"})


# ─────────────────────────────────────────────────────────────
# Chat endpoint uses generate_gemini_content_with_tools
# ─────────────────────────────────────────────────────────────


@patch("backend.routers.chat.generate_gemini_content_with_tools", new_callable=AsyncMock)
def test_chat_endpoint_uses_function_calling(mock_tools_fn):
    """POST /api/chat calls generate_gemini_content_with_tools (not old generate_gemini_content)."""
    from fastapi.testclient import TestClient

    from backend.main import app

    mock_tools_fn.return_value = "VNM đang giao dịch ở 72,000 VND."
    client = TestClient(app)

    res = client.post(
        "/api/chat",
        json={
            "message": "Giá VNM hôm nay?",
            "history": [],
            "cached_articles": [],
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == "VNM đang giao dịch ở 72,000 VND."
    mock_tools_fn.assert_called_once()


@patch("backend.routers.chat.generate_gemini_content_with_tools", new_callable=AsyncMock)
def test_chat_endpoint_tool_declarations_passed(mock_tools_fn):
    """tool_declarations must be passed from chat router to Gemini service."""
    from fastapi.testclient import TestClient

    from backend.main import app

    mock_tools_fn.return_value = "Xong"
    client = TestClient(app)

    client.post(
        "/api/chat",
        json={
            "message": "test",
            "history": [],
            "cached_articles": [],
        },
    )

    _, kwargs = mock_tools_fn.call_args
    assert "tool_declarations" in kwargs
    tool_names = [t["name"] for t in kwargs["tool_declarations"]]
    # All 5 stock tools must be declared
    assert "get_stock_overview" in tool_names
    assert "get_stock_trading_history" in tool_names
    assert "get_financial_report" in tool_names
    assert "get_stock_news" in tool_names
    assert "get_stock_technicals" in tool_names


@patch("backend.routers.chat.generate_gemini_content_with_tools", new_callable=AsyncMock)
def test_chat_history_grows_correctly_with_tools_flow(mock_tools_fn):
    """Response history contains exactly user message + model reply appended."""
    from fastapi.testclient import TestClient

    from backend.main import app

    mock_tools_fn.return_value = "Đây là câu trả lời"
    client = TestClient(app)

    existing_history = [
        {"role": "user", "content": "Xin chào"},
        {"role": "model", "content": "Chào bạn!"},
    ]

    res = client.post(
        "/api/chat",
        json={
            "message": "VNM thế nào?",
            "history": existing_history,
            "cached_articles": [],
        },
    )

    assert res.status_code == 200
    history = res.json()["history"]
    # 2 old + user msg + model reply = 4
    assert len(history) == 4
    assert history[-2]["role"] == "user"
    assert history[-2]["content"] == "VNM thế nào?"
    assert history[-1]["role"] == "model"
    assert history[-1]["content"] == "Đây là câu trả lời"
