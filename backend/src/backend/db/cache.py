"""CRUD operations for article cache and research sessions."""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from .models import ArticleCache, ResearchSession


# ── Article Cache ─────────────────────────────────────────────────────────────

def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


async def get_cached_article(session: AsyncSession, url: str) -> Optional[ArticleCache]:
    """Return a non-expired cached article, or None."""
    url_hash = _hash_url(url)
    result = await session.execute(
        select(ArticleCache).where(ArticleCache.url_hash == url_hash)
    )
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
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.cache_ttl_hours)

    # Try to update existing
    result = await session.execute(
        select(ArticleCache).where(ArticleCache.url_hash == url_hash)
    )
    article = result.scalar_one_or_none()

    if article:
        article.title = title
        article.content = content
        article.source_id = source_id
        article.fetched_at = datetime.now(timezone.utc)
        article.expires_at = expires_at
    else:
        article = ArticleCache(
            url_hash=url_hash,
            url=url,
            title=title,
            content=content,
            source_id=source_id,
            fetched_at=datetime.now(timezone.utc),
            expires_at=expires_at,
        )
        session.add(article)

    await session.commit()
    await session.refresh(article)
    return article


def is_expired(article: ArticleCache) -> bool:
    """Check if a cached article has passed its TTL."""
    now = datetime.now(timezone.utc)
    expires = article.expires_at
    # Handle both naive and aware datetimes
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return now > expires


# ── Research Session ───────────────────────────────────────────────────────────

async def create_research_session(
    session: AsyncSession, session_id: str, query: str
) -> ResearchSession:
    """Create a new research session with 'running' status."""
    rs = ResearchSession(id=session_id, query=query, status="running")
    session.add(rs)
    await session.commit()
    await session.refresh(rs)
    return rs


async def get_research_session(
    session: AsyncSession, session_id: str
) -> Optional[ResearchSession]:
    result = await session.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
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
    result = await session.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
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
            rs.completed_at = datetime.now(timezone.utc)
        await session.commit()
