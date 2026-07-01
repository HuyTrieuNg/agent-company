"""Follow-up agent state definition."""
from typing import TypedDict, Any

class FollowUpState(TypedDict):
    session_id: str
    query: str
    report_content: str
    context_content: str
    answer: str
    error: str | None
    stream_queue: Any  # asyncio.Queue for streaming tokens
