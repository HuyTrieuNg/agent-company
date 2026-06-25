"""Summarizer node: generate structured research report from context.

Strategy
--------
* If ``settings.gemini_api_key`` is set → use Gemini API (faster, higher quality).
* Otherwise → fall back to local Ollama (always available).
"""
import logging
from ....config import settings
from ....ollama_service import generate_ollama_content
from ..state import ResearchState

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """Bạn là chuyên gia phân tích kinh tế với kinh nghiệm nghiên cứu thị trường Việt Nam.
Dựa trên các bài báo được cung cấp, hãy tổng hợp thành báo cáo nghiên cứu chuyên nghiệp bằng tiếng Việt.

Cấu trúc báo cáo:
# 📊 Báo cáo Nghiên cứu: [Tiêu đề]

## Tóm tắt điều hành
(2-3 câu tóm tắt ngắn gọn điểm chính)

## Phân tích chi tiết
(Phân tích sâu các thông tin từ bài báo, theo chủ điểm)

## Các điểm nổi bật
- Điểm 1
- Điểm 2
...

## Xu hướng & Nhận định
(Nhận xét về xu hướng, tác động, triển vọng)

## Nguồn tham khảo
(Liệt kê các nguồn đã dùng)

Viết chuyên nghiệp, khách quan, có dẫn chứng từ bài báo."""


async def summarizer_node(state: ResearchState) -> dict:
    """Read Markdown context and generate structured report.

    Uses Gemini API when ``GEMINI_API_KEY`` env-var is present,
    otherwise falls back to the local Ollama model.
    """
    context_path = state.get("context_path", "")
    query = state["query"]
    intent = state.get("intent", {})

    # ── Read context file ────────────────────────────────────────────────────
    context_content = ""
    if context_path:
        try:
            with open(context_path, "r", encoding="utf-8") as f:
                context_content = f.read()
        except Exception as e:
            logger.warning(f"[Summarizer] Could not read context file: {e}")

    if not context_content:
        context_content = "Không có bài báo nào được tìm thấy."

    prompt = (
        f"Câu hỏi nghiên cứu: {query}\n"
        f"Chủ đề: {intent.get('topic', query)}\n"
        f"Từ khóa: {', '.join(intent.get('keywords', []))}\n\n"
        f"--- NỘI DUNG BÀI BÁO ---\n{context_content}"
    )

    # ── Choose backend ───────────────────────────────────────────────────────
    use_gemini = bool(settings.gemini_api_key)

    try:
        if use_gemini:
            # Import here to avoid loading the SDK when not needed
            from ....gemini_service import generate_gemini_content

            logger.info(
                f"[Summarizer] Using Gemini API model={settings.gemini_summarizer_model}"
            )
            report = await generate_gemini_content(
                api_key=settings.gemini_api_key,
                model=settings.gemini_summarizer_model,
                contents=prompt,
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=8192,
                temperature=0.2,
            )
        else:
            logger.info(
                f"[Summarizer] Using Ollama model={settings.research_model_name}"
            )
            report = await generate_ollama_content(
                model=settings.research_model_name,
                contents=prompt,
                system_instruction=SYSTEM_PROMPT,
                json_format=False,
                num_predict=4096,
                num_ctx=8192,
            )

        if not report:
            report = "Không thể tổng hợp báo cáo."

    except Exception as e:
        logger.exception("[Summarizer] Error generating report")
        report = f"Lỗi khi tổng hợp: {repr(e)}"

    return {
        "report": report,
        "progress_step": "✍️ Đang viết báo cáo tổng hợp...",
    }
