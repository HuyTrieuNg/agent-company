"""Generic in-memory TTL Cache and DB cache operations."""

import hashlib
import time
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from .models import ArticleCache, ResearchSession


class TTLCache[V]:
    """Thread-safe in-memory cache with Time-To-Live expiration."""

    def __init__(self, default_ttl: float = 300.0) -> None:
        self.default_ttl = default_ttl
        self._store: dict[str, tuple[V, float]] = {}

    def get(self, key: str) -> V | None:
        """Get an item if it exists and has not expired."""
        if key in self._store:
            value, exp = self._store[key]
            if time.time() < exp:
                return value
            del self._store[key]
        return None

    def set(self, key: str, value: V, ttl: float | None = None) -> None:
        """Store an item with given or default TTL in seconds."""
        duration = ttl if ttl is not None else self.default_ttl
        self._store[key] = (value, time.time() + duration)

    def delete(self, key: str) -> bool:
        """Delete an item from cache. Returns True if existed."""
        if key in self._store:
            del self._store[key]
            return True
        return False

    def clear(self) -> None:
        """Clear all items."""
        self._store.clear()

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __setitem__(self, key: str, value: Any) -> None:
        """Allow dict-like assignment: cache[key] = (val, expiry_time) or cache[key] = val."""
        if isinstance(value, tuple):
            t = cast(tuple[object, ...], value)
            if len(t) == 2:
                val = cast(V, t[0])
                exp = float(cast(float | int | str, t[1]))
                self._store[key] = (val, exp)
                return
        self.set(key, cast(V, value))

    def __getitem__(self, key: str) -> V:
        val = self.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed items."""
        now = time.time()
        expired_keys = [k for k, (_, exp) in self._store.items() if now >= exp]
        for k in expired_keys:
            del self._store[k]
        return len(expired_keys)


# Global default cache instance
ttl_cache: TTLCache[object] = TTLCache()


# ── Database Article Cache CRUD ───────────────────────────────────────────────


def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


def is_expired(article: ArticleCache) -> bool:
    """Check if a cached article has passed its TTL."""
    now = datetime.now(UTC)
    expires = article.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return now > expires


async def get_cached_article(session: AsyncSession, url: str) -> ArticleCache | None:
    """Return a non-expired cached article, or None."""
    url_hash = _hash_url(url)
    result = await session.execute(select(ArticleCache).where(ArticleCache.url_hash == url_hash))
    article = result.scalar_one_or_none()
    if article and not is_expired(article):
        return article
    return None


async def save_article(
    session: AsyncSession,
    url: str,
    title: str,
    content: str,
    source_id: str = "",
) -> ArticleCache:
    """Insert or update an article in the cache."""
    url_hash = _hash_url(url)
    expires_at = datetime.now(UTC) + timedelta(hours=settings.cache_ttl_hours)

    result = await session.execute(select(ArticleCache).where(ArticleCache.url_hash == url_hash))
    article = result.scalar_one_or_none()

    if article:
        article.title = title
        article.content = content
        article.source_id = source_id
        article.fetched_at = datetime.now(UTC)
        article.expires_at = expires_at
    else:
        article = ArticleCache(
            url_hash=url_hash,
            url=url,
            title=title,
            content=content,
            source_id=source_id,
            fetched_at=datetime.now(UTC),
            expires_at=expires_at,
        )
        session.add(article)

    await session.commit()
    await session.refresh(article)
    return article


# ── Research Session CRUD ─────────────────────────────────────────────────────


async def create_research_session(
    session: AsyncSession, session_id: str, query: str
) -> ResearchSession:
    """Create a new research session with 'running' status."""
    rs = ResearchSession(id=session_id, query=query, status="running")
    session.add(rs)
    await session.commit()
    await session.refresh(rs)
    return rs


async def get_research_session(session: AsyncSession, session_id: str) -> ResearchSession | None:
    result = await session.execute(select(ResearchSession).where(ResearchSession.id == session_id))
    return result.scalar_one_or_none()


async def update_research_session(
    session: AsyncSession,
    session_id: str,
    status: str,
    current_step: str = "",
    result_md: str = "",
    error_message: str = "",
) -> None:
    """Update status, progress step, and result of a research session."""
    result = await session.execute(select(ResearchSession).where(ResearchSession.id == session_id))
    rs = result.scalar_one_or_none()
    if rs:
        rs.status = status
        if current_step:
            rs.current_step = current_step
        if result_md:
            rs.result_md = result_md
        if error_message:
            rs.error_message = error_message
        if status in ("done", "error"):
            rs.completed_at = datetime.now(UTC)
        await session.commit()
