import os
import sys
import pytest
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Ensure the src folder is in the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

# Globally mock startup functions to prevent loading real DB, embedding weights or calling external services
init_db_mock = patch("backend.db.database.init_db", new_callable=AsyncMock)
ensure_indexes_mock = patch("backend.qdrant_service.ensure_payload_indexes", new_callable=AsyncMock)
warmup_reranker_mock = patch("backend.reranker_service.warmup_reranker", new_callable=AsyncMock)

init_db_mock.start()
ensure_indexes_mock.start()
warmup_reranker_mock.start()

from sqlalchemy.pool import StaticPool
from backend.db.database import Base, get_session
from backend.main import app

test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestAsyncSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


import asyncio

@pytest.fixture(scope="session", autouse=True)
def prepare_test_db():
    async def _init():
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(_init())
    yield
    async def _drop():
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    asyncio.run(_drop())


async def override_get_session():
    async with TestAsyncSessionLocal() as session:
        yield session


app.dependency_overrides[get_session] = override_get_session


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    """Override settings for tests."""
    monkeypatch.setenv("GEMINI_API_KEY", "mock-gemini-key")
    monkeypatch.setenv("QDRANT_URL", "http://mock-qdrant:6333")
    monkeypatch.setenv("QDRANT_API_KEY", "mock-qdrant-key")
    monkeypatch.setenv("QDRANT_COLLECTION", "test_articles")

