"""Source selector node: pick relevant sources from DB based on intent."""
import logging
from sqlalchemy import select

from ....config import settings
from ....db.database import AsyncSessionLocal
from ....db.models import SourceProfile
from ..state import ResearchState


logger = logging.getLogger(__name__)


async def source_selector_node(state: ResearchState) -> dict:
    """Query DB for active sources matching the intent category."""
    intent = state.get("intent", {})
    category = intent.get("category", "economics")
    max_sources = min(
        intent.get("max_sources", 3),
        settings.max_sources_per_query
    )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SourceProfile)
            .where(SourceProfile.is_active == True)  # noqa: E712
            .order_by(SourceProfile.priority.asc())
            .limit(max_sources)
        )

        sources = result.scalars().all()

    selected = [s.to_dict() for s in sources]
    logger.info(f"[SourceSelector] Selected {len(selected)} sources for category={category}")

    return {
        "selected_sources": selected,
        "progress_step": f"🔍 Tìm kiếm trên {len(selected)} nguồn: {', '.join(s['name'] for s in selected)}",
    }
