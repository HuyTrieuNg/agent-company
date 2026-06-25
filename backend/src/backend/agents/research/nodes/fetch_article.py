"""Fetch Article node: download and parse individual article pages."""
import asyncio
import logging
import httpx
from bs4 import BeautifulSoup

from ....config import settings
from ....db.database import AsyncSessionLocal
from ....db.cache import get_cached_article, save_article
from ..state import ResearchState, ArticleData

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
}


async def _fetch_article(url: str, source_id: str = "") -> ArticleData | None:
    """Fetch a single article URL, extract title + content."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers=HEADERS)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract title
        title = ""
        if soup.find("h1"):
            title = soup.find("h1").get_text(strip=True)
        elif soup.title:
            title = soup.title.get_text(strip=True)

        # Remove boilerplate
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
            tag.decompose()

        # Try to get main article body
        content = ""
        for selector in ["article", ".article-body", ".content-detail", ".article__body", "main"]:
            el = soup.select_one(selector)
            if el:
                content = el.get_text(separator="\n", strip=True)
                break
        if not content:
            content = soup.get_text(separator="\n", strip=True)

        # Truncate to ~4000 chars to fit context budget
        content = content[:4000]

        return ArticleData(
            url=url,
            title=title,
            content=content,
            source_id=source_id,
            relevance_score=0.0,
        )
    except Exception as e:
        logger.warning(f"[FetchArticle] Error fetching {url}: {e}")
        return None


async def fetch_article_node(state: ResearchState) -> dict:
    """Fetch all found URLs concurrently, save to cache."""
    found_urls = state.get("found_urls", [])
    selected_sources = state.get("selected_sources", [])

    # Build URL→source_id mapping
    source_map: dict[str, str] = {}
    for src in selected_sources:
        source_map[src["base_url"].rstrip("/")] = src["id"]

    # Deduplicate URLs
    unique_urls = list(dict.fromkeys(found_urls))
    logger.info(f"[FetchArticle] Fetching {len(unique_urls)} articles")

    # Check cache first for individual article URLs
    articles: list[ArticleData] = []
    urls_to_fetch: list[str] = []

    async with AsyncSessionLocal() as session:
        for url in unique_urls:
            cached = await get_cached_article(session, url)
            if cached:
                articles.append(ArticleData(
                    url=cached.url,
                    title=cached.title or "",
                    content=cached.content or "",
                    source_id=cached.source_id or "",
                    relevance_score=0.0,
                ))
            else:
                urls_to_fetch.append(url)

    # Fetch uncached articles concurrently (max 5 at a time)
    semaphore = asyncio.Semaphore(5)

    async def fetch_with_sem(url: str) -> ArticleData | None:
        async with semaphore:
            # Guess source_id from URL domain
            sid = next(
                (v for k, v in source_map.items() if k in url),
                ""
            )
            return await _fetch_article(url, sid)

    tasks = [fetch_with_sem(u) for u in urls_to_fetch]
    results = await asyncio.gather(*tasks)

    # Save to cache and collect
    async with AsyncSessionLocal() as session:
        for article in results:
            if article:
                await save_article(
                    session,
                    url=article["url"],
                    title=article["title"],
                    content=article["content"],
                    source_id=article["source_id"],
                )
                articles.append(article)

    logger.info(f"[FetchArticle] Total articles: {len(articles)}")

    return {
        "raw_articles": articles,
        "progress_step": f"📰 Đã đọc {len(articles)} bài viết",
    }
