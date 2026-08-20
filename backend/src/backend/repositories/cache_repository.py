"""Repository for Article Cache and Research Sessions."""

import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import Settings, settings
from ..db.models import ArticleCache, ResearchSession
from .base import BaseRepository


def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


class CacheRepository(BaseRepository[ArticleCache]):
    """Data access layer for database article cache and research sessions."""

    def __init__(self, session: AsyncSession, app_settings: Settings | None = None) -> None:
        super().__init__(session)
        self.settings = app_settings or settings

    def is_expired(self, article: ArticleCache) -> bool:
        now = datetime.now(UTC)
        expires = article.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        return now > expires

    async def get_cached_article(self, url: str) -> ArticleCache | None:
        url_hash = _hash_url(url)
        result = await self.session.execute(
            select(ArticleCache).where(ArticleCache.url_hash == url_hash)
        )
        article = result.scalar_one_or_none()
        if article and not self.is_expired(article):
            return article
        return None

    async def save_article(
        self,
        url: str,
        title: str,
        content: str,
        source_id: str = "",
    ) -> ArticleCache:
        url_hash = _hash_url(url)
        expires_at = datetime.now(UTC) + timedelta(hours=self.settings.cache_ttl_hours)

        result = await self.session.execute(
            select(ArticleCache).where(ArticleCache.url_hash == url_hash)
        )
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
            self.session.add(article)

        await self.session.commit()
        await self.session.refresh(article)
        return article

    async def create_research_session(self, session_id: str, query: str) -> ResearchSession:
        rs = ResearchSession(id=session_id, query=query, status="running")
        self.session.add(rs)
        await self.session.commit()
        await self.session.refresh(rs)
        return rs

    async def get_research_session(self, session_id: str) -> ResearchSession | None:
        result = await self.session.execute(
            select(ResearchSession).where(ResearchSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def update_research_session(
        self,
        session_id: str,
        status: str,
        current_step: str = "",
        result_md: str = "",
        error_message: str = "",
    ) -> None:
        result = await self.session.execute(
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
                rs.completed_at = datetime.now(UTC)
            await self.session.commit()
