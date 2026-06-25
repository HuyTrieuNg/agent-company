"""Report node: persist the final report to disk and DB."""
import os
import logging
from datetime import datetime

from ....config import settings
from ....db.database import AsyncSessionLocal
from ....db.cache import update_research_session
from ..state import ResearchState

logger = logging.getLogger(__name__)


async def report_node(state: ResearchState) -> dict:
    """Save report to file and update research session in DB."""
    report = state.get("report", "")
    session_id = state["session_id"]

    # Save report.md
    session_dir = os.path.join(settings.context_dir, session_id)
    os.makedirs(session_dir, exist_ok=True)
    report_path = os.path.join(session_dir, "report.md")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"<!-- Generated: {datetime.now().isoformat()} -->\n\n")
        f.write(report)

    # Update DB session to "done"
    async with AsyncSessionLocal() as db_session:
        await update_research_session(
            db_session,
            session_id=session_id,
            status="done",
            current_step="Hoàn thành",
            result_md=report,
        )

    logger.info(f"[ReportNode] Report saved to {report_path}")

    return {
        "progress_step": "🎉 Báo cáo hoàn thành!",
    }
