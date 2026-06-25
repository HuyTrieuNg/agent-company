"""Relevance filter node: score articles and keep only relevant ones."""
import json
import logging
from ....config import settings
from ....ollama_service import generate_ollama_content
from ..state import ResearchState, ArticleData

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """Bạn là bộ lọc nội dung tin tức chuyên về kinh tế.
Với mỗi bài báo được cung cấp, đánh giá mức độ liên quan đến chủ đề/từ khóa (0.0 đến 1.0).
Trả về JSON array với định dạng:
[{"url": "...", "score": 0.85}, ...]
Chỉ trả về JSON array thuần túy."""

RELEVANCE_THRESHOLD = 0.4


async def relevance_filter_node(state: ResearchState) -> dict:
    """Score all articles and filter out irrelevant ones."""
    raw_articles = state.get("raw_articles", [])
    cached_articles = state.get("cached_articles", [])
    all_articles = raw_articles + cached_articles
    intent = state.get("intent", {})

    if not all_articles:
        return {
            "relevant_articles": [],
            "progress_step": "⚠️ Không tìm thấy bài viết nào",
        }

    # If article count is small (<= 3), skip LLM filtering to save API quota
    if len(all_articles) <= 3:
        logger.info(f"[RelevanceFilter] Only {len(all_articles)} articles found. Skipping LLM filtering to save quota.")
        relevant = []
        for a in all_articles:
            art_dict = dict(a)
            art_dict["relevance_score"] = 1.0
            relevant.append(ArticleData(**art_dict))
        return {
            "relevant_articles": relevant,
            "progress_step": f"✅ Giữ lại {len(relevant)} bài viết (bỏ qua lọc LLM do số lượng ít)",
        }


    # Build scoring prompt
    articles_summary = "\n".join(
        f"URL: {a['url']}\nTiêu đề: {a['title']}\nNội dung (tóm tắt): {a['content'][:300]}\n---"
        for a in all_articles
    )
    prompt = (
        f"Chủ đề: {intent.get('topic', state['query'])}\n"
        f"Từ khóa: {', '.join(intent.get('keywords', []))}\n\n"
        f"Danh sách bài báo:\n{articles_summary}"
    )

    try:
        raw = await generate_ollama_content(
            model=settings.research_model_name,
            contents=prompt,
            system_instruction=SYSTEM_PROMPT,
            json_format=True,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        scores: list[dict] = json.loads(raw)
        score_map = {item["url"]: float(item.get("score", 0)) for item in scores}
    except Exception as e:
        logger.warning(f"[RelevanceFilter] Scoring failed, keeping all: {e}")
        score_map = {a["url"]: 1.0 for a in all_articles}

    # Apply scores and filter
    relevant: list[ArticleData] = []
    for article in all_articles:
        score = score_map.get(article["url"], 0.0)
        if score >= RELEVANCE_THRESHOLD:
            article = dict(article)
            article["relevance_score"] = score
            relevant.append(ArticleData(**article))

    # Sort by relevance descending
    relevant.sort(key=lambda a: a["relevance_score"], reverse=True)

    logger.info(f"[RelevanceFilter] {len(relevant)}/{len(all_articles)} articles passed filter")

    return {
        "relevant_articles": relevant,
        "progress_step": f"✅ Lọc được {len(relevant)} bài liên quan từ {len(all_articles)} bài",
    }
