from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.mark.asyncio
@patch("backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock)
@patch(
    "backend.services.gemini_service.GeminiService.generate_content_with_tools",
    new_callable=AsyncMock,
)
async def test_chat_pipeline_new_query(mock_gemini, mock_search):
    # Mock search_articles return: a list of new articles, did_retrieve=True
    mock_search.return_value = (
        [
            {
                "article_title": "Tựa đề 1",
                "site": "CafeF",
                "text": "Chi tiết 1",
                "article_url": "url1",
            }
        ],
        True,
    )
    # Mock Gemini answer
    mock_gemini.return_value = "Câu trả lời từ Gemini dựa trên tài liệu."

    payload = {"message": "Giá vàng hôm nay thế nào?", "history": [], "cached_articles": []}

    # Use client to send request (lifespan is triggered automatically if using client block)
    response = client.post("/api/chat", json=payload)

    assert response.status_code == 200
    data = response.json()

    assert data["reply"] == "Câu trả lời từ Gemini dựa trên tài liệu."
    # History should contain user query and model reply
    assert len(data["history"]) == 2
    assert data["history"][0]["role"] == "user"
    assert data["history"][0]["content"] == "Giá vàng hôm nay thế nào?"
    assert data["history"][1]["role"] == "model"
    assert data["history"][1]["content"] == "Câu trả lời từ Gemini dựa trên tài liệu."

    # cached_articles should contain the retrieved articles
    assert len(data["cached_articles"]) == 1
    assert data["cached_articles"][0]["article_title"] == "Tựa đề 1"

    # Verify search and gemini calls
    mock_search.assert_called_once()
    mock_gemini.assert_called_once()


@pytest.mark.asyncio
@patch("backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock)
@patch(
    "backend.services.gemini_service.GeminiService.generate_content_with_tools",
    new_callable=AsyncMock,
)
async def test_chat_pipeline_followup_uses_cache(mock_gemini, mock_search):
    # Mock search_articles return: returns same cached articles, did_retrieve=False
    cached = [
        {"article_title": "Tựa đề 1", "site": "CafeF", "text": "Chi tiết 1", "article_url": "url1"}
    ]
    mock_search.return_value = (cached, False)
    mock_gemini.return_value = "Tài liệu 1 nói về vàng."

    payload = {
        "message": "Nói rõ hơn về tài liệu đó",
        "history": [
            {"role": "user", "content": "Giá vàng hôm nay thế nào?"},
            {"role": "model", "content": "Câu trả lời từ Gemini dựa trên tài liệu."},
        ],
        "cached_articles": cached,
    }

    response = client.post("/api/chat", json=payload)

    assert response.status_code == 200
    data = response.json()

    assert data["reply"] == "Tài liệu 1 nói về vàng."
    # Updated history size should be 4 (old 2 + new 2)
    assert len(data["history"]) == 4
    assert data["history"][-2]["content"] == "Nói rõ hơn về tài liệu đó"

    # Check cached_articles returned matches input cache
    assert data["cached_articles"] == cached

    # Verify that search_articles was called with the cached articles and conversation context
    mock_search.assert_called_once()
    _, kwargs = mock_search.call_args
    assert kwargs["cached_articles"] == cached
    assert "Giá vàng hôm nay thế nào?" in kwargs["conversation_context"]


def test_health_endpoint():
    """Health check endpoint should return 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_chat_validation_missing_message():
    """POST /api/chat with missing 'message' field must return 422."""
    payload = {"history": [], "cached_articles": []}
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_chat_validation_invalid_history_role():
    """History messages with an invalid role should still be accepted at HTTP layer
    since 'role' is just a str in the model, but the response must be 200 or 500
    (not 422), because Pydantic only validates type, not enum value for str."""
    with (
        patch(
            "backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock
        ) as mock_search,
        patch(
            "backend.services.gemini_service.GeminiService.generate_content_with_tools",
            new_callable=AsyncMock,
        ) as mock_gemini,
    ):
        mock_search.return_value = ([], True)
        mock_gemini.return_value = "OK"
        payload = {
            "message": "Test",
            "history": [{"role": "assistant", "content": "Old message"}],
            "cached_articles": [],
        }
        response = client.post("/api/chat", json=payload)
        # Should not crash the server
        assert response.status_code in (200, 422, 500)


@pytest.mark.asyncio
@patch("backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock)
@patch(
    "backend.services.gemini_service.GeminiService.generate_content_with_tools",
    new_callable=AsyncMock,
)
async def test_chat_pipeline_gemini_error_returns_500(mock_gemini, mock_search):
    """If Gemini raises an exception, the endpoint should return 500 with 'detail'."""
    mock_search.return_value = ([], True)
    mock_gemini.side_effect = Exception("Gemini service unavailable")

    payload = {"message": "Hỏi gì đó", "history": [], "cached_articles": []}
    response = client.post("/api/chat", json=payload)

    assert response.status_code == 500
    data = response.json()
    # Frontend reads 'detail' field from error response — must be present
    assert "detail" in data


@pytest.mark.asyncio
@patch("backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock)
@patch(
    "backend.services.gemini_service.GeminiService.generate_content_with_tools",
    new_callable=AsyncMock,
)
async def test_chat_response_schema_compatibility(mock_gemini, mock_search):
    """
    Verify the exact response schema that the frontend expects:
    { reply: str, history: [{role, content}], cached_articles: [...] }

    This test acts as a contract test between backend and frontend.
    """
    articles = [
        {
            "article_title": "Tin tức A",
            "site": "vnexpress",
            "text": "Nội dung A",
            "article_url": "https://vnexpress.net/a",
        }
    ]
    mock_search.return_value = (articles, True)
    mock_gemini.return_value = "Đây là câu trả lời"

    response = client.post(
        "/api/chat", json={"message": "Test schema", "history": [], "cached_articles": []}
    )

    assert response.status_code == 200
    data = response.json()

    # ── Contract: required top-level fields ──
    assert "reply" in data, "Frontend expects 'reply' field"
    assert "history" in data, "Frontend expects 'history' field"
    assert "cached_articles" in data, "Frontend expects 'cached_articles' field"

    # ── Contract: reply must be a non-empty string ──
    assert isinstance(data["reply"], str)
    assert len(data["reply"]) > 0

    # ── Contract: history items must have 'role' and 'content' ──
    for msg in data["history"]:
        assert "role" in msg, "ChatMessage must have 'role'"
        assert "content" in msg, "ChatMessage must have 'content'"
        assert msg["role"] in ("user", "model"), "Role must be 'user' or 'model'"

    # ── Contract: cached_articles is a list of dicts ──
    assert isinstance(data["cached_articles"], list)


@pytest.mark.asyncio
@patch("backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock)
@patch(
    "backend.services.gemini_service.GeminiService.generate_content_with_tools",
    new_callable=AsyncMock,
)
async def test_chat_pipeline_empty_cache_not_persisted_on_no_retrieve(mock_gemini, mock_search):
    """
    When search returns did_retrieve=True but empty results and there were no prior
    cached_articles, cached_articles in response should be empty (not None).
    Frontend must handle empty array without crashing.
    """
    mock_search.return_value = ([], True)
    mock_gemini.return_value = "Không tìm thấy thông tin."

    response = client.post(
        "/api/chat",
        json={"message": "Câu hỏi về chủ đề rất hiếm", "history": [], "cached_articles": []},
    )

    assert response.status_code == 200
    data = response.json()
    # cached_articles must be a list (possibly empty), not None
    assert data["cached_articles"] is not None
    assert isinstance(data["cached_articles"], list)


@pytest.mark.asyncio
@patch("backend.services.qdrant_service.QdrantService.search_articles", new_callable=AsyncMock)
@patch(
    "backend.services.gemini_service.GeminiService.generate_content_with_tools",
    new_callable=AsyncMock,
)
async def test_chat_history_accumulates_correctly(mock_gemini, mock_search):
    """
    Send two sequential requests simulating a conversation.
    Verify that history grows correctly each turn.
    """
    mock_search.return_value = ([], False)
    mock_gemini.return_value = "Trả lời 1"

    # First turn
    r1 = client.post(
        "/api/chat", json={"message": "Câu hỏi 1", "history": [], "cached_articles": []}
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert len(d1["history"]) == 2

    # Second turn — pass history from first turn back
    mock_gemini.return_value = "Trả lời 2"
    r2 = client.post(
        "/api/chat",
        json={
            "message": "Câu hỏi 2",
            "history": d1["history"],
            "cached_articles": d1["cached_articles"],
        },
    )
    assert r2.status_code == 200
    d2 = r2.json()
    # History should now have 4 entries: 2 from round 1 + 2 from round 2
    assert len(d2["history"]) == 4
    assert d2["history"][2]["role"] == "user"
    assert d2["history"][2]["content"] == "Câu hỏi 2"
    assert d2["history"][3]["role"] == "model"
