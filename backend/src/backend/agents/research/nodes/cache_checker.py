"""Cache checker node: separate sources into cached vs needs-fetch."""
import logging

from ....db.database import AsyncSessionLocal
from ....db.cache import get_cached_article
from ..state import ResearchState, ArticleData

logger = logging.getLogger(__name__)


async def cache_checker_node(state: ResearchState) -> dict:
    """For each selected source, check if we have fresh cached content."""
    selected_sources = state.get("selected_sources", [])
    cached_articles: list[ArticleData] = []
    sources_to_fetch: list[dict] = []

    async with AsyncSessionLocal() as session:
        for source in selected_sources:
            cached = await get_cached_article(session, source["base_url"])
            if cached:
                logger.info(f"[CacheChecker] HIT: {source['name']}")
                cached_articles.append(ArticleData(
                    url=cached.url,
                    title=cached.title or "",
                    content=cached.content or "",
                    source_id=cached.source_id or source["id"],
                    relevance_score=0.0,
                ))
            else:
                logger.info(f"[CacheChecker] MISS: {source['name']}")
                sources_to_fetch.append(source)

    cache_hit_names = [s["name"] for s in selected_sources if s not in sources_to_fetch]
    msg = f"⚡ Cache: {len(cached_articles)} nguồn có sẵn, {len(sources_to_fetch)} cần tải mới"

    return {
        "cached_articles": cached_articles,
        "sources_to_fetch": sources_to_fetch,
        "progress_step": msg,
    }
