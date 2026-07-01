"""Nodes for the follow-up LangGraph."""
import os
import json
import logging
from ....config import settings
from ....db.database import AsyncSessionLocal
from ....db.cache import get_research_session
from .followup_state import FollowUpState

logger = logging.getLogger(__name__)

async def load_context_node(state: FollowUpState) -> dict:
    """Load the previous report and context articles from DB/disk."""
    session_id = state["session_id"]
    
    async with AsyncSessionLocal() as db_session:
        rs = await get_research_session(db_session, session_id)
        
    if not rs or rs.status != "done" or not rs.result_md:
        return {"error": "Session not found or not ready"}
        
    context_path = os.path.join(settings.context_dir, session_id, "articles.md")
    context_content = ""
    if os.path.exists(context_path):
        try:
            with open(context_path, "r", encoding="utf-8") as f:
                context_content = f.read()
        except Exception as e:
            logger.warning(f"[Followup] Could not read context file: {e}")
            pass
            
    return {
        "report_content": rs.result_md,
        "context_content": context_content
    }


async def answer_node(state: FollowUpState) -> dict:
    """Generate follow-up answer using Gemini or Ollama and stream tokens to the queue."""
    if state.get("error"):
        return {}

    system_prompt = (
        "Bạn là chuyên gia phân tích kinh tế. Dựa trên báo cáo nghiên cứu và bài báo đã thu thập, "
        "hãy trả lời câu hỏi của người dùng một cách chính xác, súc tích bằng tiếng Việt. "
        "Chỉ sử dụng thông tin từ ngữ cảnh được cung cấp. Nếu không có thông tin, hãy nói rõ."
    )
    user_prompt = (
        f"=== BÁO CÁO NGHIÊN CỨU ===\n{state.get('report_content', '')}\n\n"
        + (f"=== BÀI BÁO GỐC ===\n{state.get('context_content', '')[:6000]}\n\n" if state.get('context_content') else "")
        + f"=== CÂU HỎI ===\n{state['query']}"
    )

    use_gemini = bool(settings.gemini_api_key)
    queue = state.get("stream_queue")
    full_answer = ""

    try:
        if use_gemini:
            from ....gemini_service import get_gemini_client
            from google.genai import types

            client = get_gemini_client(settings.gemini_api_key)
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=2048,
                temperature=0.2,
            )
            logger.info(f"[Followup] Streaming via Gemini model={settings.gemini_summarizer_model}")
            
            async for chunk in await client.aio.models.generate_content_stream(
                model=settings.gemini_summarizer_model,
                contents=user_prompt,
                config=config,
            ):
                token = chunk.text or ""
                if token:
                    full_answer += token
                    if queue:
                        await queue.put({"token": token})
                        
        else:
            import httpx
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
            payload = {
                "model": settings.research_model_name,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 2048,
                    "num_ctx": 8192,
                },
            }
            url = f"{settings.ollama_base_url}/api/chat"
            logger.info(f"[Followup] Streaming via Ollama model={settings.research_model_name}")
            
            async with httpx.AsyncClient(timeout=600.0) as client:
                async with client.stream("POST", url, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        token = data.get("message", {}).get("content", "")
                        if token:
                            full_answer += token
                            if queue:
                                await queue.put({"token": token})
                        if data.get("done"):
                            break
                            
        if queue:
            await queue.put({"done": True})

    except Exception as e:
        logger.error(f"[Followup] Error generating answer: {e}")
        if queue:
            await queue.put({"error": str(e)})
        return {"error": str(e)}

    return {"answer": full_answer}
