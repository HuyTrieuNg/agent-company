"""LangGraph StateGraph definition for Research Agent."""
import logging
from langgraph.graph import StateGraph, END

from .state import ResearchState
from .nodes import (
    planner_node,
    source_selector_node,
    cache_checker_node,
    search_node,
    fetch_article_node,
    relevance_filter_node,
    context_builder_node,
    summarizer_node,
    report_node,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 1


def should_retry_or_end(state: ResearchState) -> str:
    """
    After relevance filter:
    - If enough relevant articles → continue to context builder
    - If too few and retries remain → go back to search node
    - Otherwise → continue anyway (best effort)
    """
    relevant = state.get("relevant_articles", [])
    retry_count = state.get("retry_count", 0)

    if len(relevant) >= 1:
        return "context_builder"
    elif retry_count < MAX_RETRIES:
        logger.info("[Graph] Not enough articles, retrying search...")
        return "search_retry"
    else:
        logger.info("[Graph] No relevant articles after retry, proceeding anyway...")
        return "context_builder"


async def search_retry_node(state: ResearchState) -> dict:
    """Increment retry counter before looping back to search."""
    return {"retry_count": state.get("retry_count", 0) + 1}


def build_research_graph() -> StateGraph:
    """Build and compile the Research Agent LangGraph."""
    graph = StateGraph(ResearchState)

    # Add all nodes
    graph.add_node("planner", planner_node)
    graph.add_node("source_selector", source_selector_node)
    graph.add_node("cache_checker", cache_checker_node)
    graph.add_node("search", search_node)
    graph.add_node("fetch_article", fetch_article_node)
    graph.add_node("relevance_filter", relevance_filter_node)
    graph.add_node("search_retry", search_retry_node)
    graph.add_node("context_builder", context_builder_node)
    graph.add_node("summarizer", summarizer_node)
    graph.add_node("report", report_node)

    # Linear flow
    graph.set_entry_point("planner")
    graph.add_edge("planner", "source_selector")
    graph.add_edge("source_selector", "cache_checker")
    graph.add_edge("cache_checker", "search")
    graph.add_edge("search", "fetch_article")
    graph.add_edge("fetch_article", "relevance_filter")

    # Conditional: retry or continue
    graph.add_conditional_edges(
        "relevance_filter",
        should_retry_or_end,
        {
            "context_builder": "context_builder",
            "search_retry": "search_retry",
        },
    )
    # Retry loops back to search
    graph.add_edge("search_retry", "search")

    # Final linear steps
    graph.add_edge("context_builder", "summarizer")
    graph.add_edge("summarizer", "report")
    graph.add_edge("report", END)

    return graph.compile()


# Compiled graph singleton
research_graph = build_research_graph()
