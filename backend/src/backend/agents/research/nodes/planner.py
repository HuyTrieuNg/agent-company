"""Planner node: analyze user query to extract intent, keywords, and topic."""
import json
import logging
from ....config import settings
from ....ollama_service import generate_ollama_content
from ..state import ResearchState

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """Bạn là Planner của Research Agent chuyên về kinh tế Việt Nam.
Phân tích câu hỏi của người dùng và trả về JSON với cấu trúc:
{
  "topic": "chủ đề chính ngắn gọn",
  "keywords": ["từ khóa 1", "từ khóa 2", ...],
  "category": "economics|finance|legal|general",
  "max_sources": 2,
  "language": "vi"
}
Chỉ trả về JSON thuần túy, không thêm markdown hay giải thích."""


async def planner_node(state: ResearchState) -> dict:
    """Analyze query and extract research intent."""
    logger.info(f"[Planner] Query: {state['query']}")
    try:
        raw = await generate_ollama_content(
            model=settings.research_model_name,
            contents=state["query"],
            system_instruction=SYSTEM_PROMPT,
            json_format=True,
        )
        raw = raw.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        intent = json.loads(raw)
    except Exception as e:
        logger.warning(f"[Planner] Failed to parse intent, using defaults: {e}")
        intent = {
            "topic": state["query"],
            "keywords": state["query"].split()[:5],
            "category": "economics",
            "max_sources": 2,
            "language": "vi",
        }


    return {
        "intent": intent,
        "progress_step": f"📋 Đã phân tích: chủ đề \"{intent.get('topic', state['query'])}\"",
    }
