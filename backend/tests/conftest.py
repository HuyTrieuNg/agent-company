import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure the src folder is in the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

# Globally mock startup functions to prevent loading real DB, embedding weights or calling external services
init_db_mock = patch("backend.db.database.init_db", new_callable=AsyncMock)
ensure_indexes_mock = patch("backend.qdrant_service.ensure_payload_indexes", new_callable=AsyncMock)
warmup_reranker_mock = patch("backend.reranker_service.warmup_reranker", new_callable=AsyncMock)

init_db_mock.start()
ensure_indexes_mock.start()
warmup_reranker_mock.start()

@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    """Override settings for tests."""
    monkeypatch.setenv("GEMINI_API_KEY", "mock-gemini-key")
    monkeypatch.setenv("QDRANT_URL", "http://mock-qdrant:6333")
    monkeypatch.setenv("QDRANT_API_KEY", "mock-qdrant-key")
    monkeypatch.setenv("QDRANT_COLLECTION", "test_articles")
