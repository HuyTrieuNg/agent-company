"""Research Agent state definition."""
from typing import TypedDict, Annotated
import operator


class ArticleData(TypedDict):
    url: str
    title: str
    content: str
    source_id: str
    relevance_score: float


class ResearchState(TypedDict):
    # Input
    query: str
    session_id: str

    # Planner output
    intent: dict                                # {topic, keywords, max_sources}

    # Source selection
    selected_sources: list[dict]                # list of SourceProfile dicts

    # Cache check results
    cached_articles: list[ArticleData]          # articles already in cache
    sources_to_fetch: list[dict]               # sources that need fresh fetch

    # Search results (article URLs found per source)
    found_urls: Annotated[list[str], operator.add]  # accumulated via parallel Send

    # Fetched & filtered articles
    raw_articles: Annotated[list[ArticleData], operator.add]
    relevant_articles: list[ArticleData]

    # Context
    context_path: str                           # path to articles.md

    # Output
    report: str

    # Control
    retry_count: int
    error: str | None
    progress_step: str                          # for SSE streaming
