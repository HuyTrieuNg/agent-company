"""Context builder node: assemble relevant articles into a Markdown file."""
import os
import logging
from datetime import datetime

from ....config import settings
from ..state import ResearchState

logger = logging.getLogger(__name__)


async def context_builder_node(state: ResearchState) -> dict:
    """Write relevant articles to a Markdown context file."""
    relevant_articles = state.get("relevant_articles", [])
    session_id = state["session_id"]
    query = state["query"]
    intent = state.get("intent", {})

    # Create session context directory
    session_dir = os.path.join(settings.context_dir, session_id)
    os.makedirs(session_dir, exist_ok=True)

    # Build sources.md
    sources_path = os.path.join(session_dir, "sources.md")
    selected_sources = state.get("selected_sources", [])
    with open(sources_path, "w", encoding="utf-8") as f:
        f.write(f"# Nguồn tin đã sử dụng\n\n")
        f.write(f"**Truy vấn:** {query}\n\n")
        f.write(f"**Thời gian:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        for src in selected_sources:
            status = "✅" if src.get("is_active") else "❌"
            f.write(f"- {status} [{src['name']}]({src['base_url']})\n")

    # Build articles.md
    articles_path = os.path.join(session_dir, "articles.md")

    # Token-aware: limit total content to ~25,000 chars (~6k tokens)
    MAX_TOTAL_CHARS = 25_000
    total_chars = 0

    with open(articles_path, "w", encoding="utf-8") as f:
        f.write(f"# Nội dung bài báo\n\n")
        f.write(f"**Chủ đề:** {intent.get('topic', query)}\n\n")
        f.write(f"**Từ khóa:** {', '.join(intent.get('keywords', []))}\n\n")
        f.write("---\n\n")

        for i, article in enumerate(relevant_articles, 1):
            if total_chars >= MAX_TOTAL_CHARS:
                f.write(f"\n> ⚠️ Đã đạt giới hạn context. {len(relevant_articles) - i + 1} bài bị bỏ qua.\n")
                break

            title = article.get("title", "Không có tiêu đề")
            url = article.get("url", "")
            content = article.get("content", "")
            score = article.get("relevance_score", 0)

            # Truncate article content if needed
            remaining = MAX_TOTAL_CHARS - total_chars
            content_snippet = content[:min(len(content), remaining - 200)]

            entry = (
                f"## {i}. {title}\n\n"
                f"**Nguồn:** [{url}]({url})  \n"
                f"**Độ liên quan:** {score:.0%}\n\n"
                f"{content_snippet}\n\n"
                f"---\n\n"
            )
            f.write(entry)
            total_chars += len(entry)

    logger.info(f"[ContextBuilder] Written {len(relevant_articles)} articles to {articles_path}")

    return {
        "context_path": articles_path,
        "progress_step": f"📄 Đã tổng hợp context từ {len(relevant_articles)} bài viết",
    }
