"""Chat API router with Gemini Function Calling support."""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..gemini_service import generate_gemini_content_with_tools
from ..models import ChatMessage, ChatRequest, ChatResponse
from ..ollama_service import generate_ollama_content
from ..qdrant_service import search_articles
from ..services.stock_service import (
    get_financial_report,
    get_stock_news,
    get_stock_overview,
    get_stock_technicals,
    get_stock_trading_history,
)
from ..sources_registry import sources_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _build_conversation_context(
    history: list[ChatMessage],
    cached_articles: list[dict] | None = None,
    max_turns: int = 3
) -> str:
    """Tạo tóm tắt ngắn về các chủ đề và nguồn trang web đã được trích dẫn trong các lượt trước."""
    lines = []
    if cached_articles:
        cited_sites = set(art.get("site") for art in cached_articles if art.get("site"))
        if cited_sites:
            lines.append(f"Các nguồn trang web đã trích dẫn ở lượt trước: {', '.join(cited_sites)}")

    if history:
        recent = history[-(max_turns * 2):]
        user_messages = [msg.content for msg in recent if msg.role == "user"]
        if user_messages:
            lines.append("Các câu hỏi trước của người dùng:")
            lines.extend(f"- {msg}" for msg in user_messages)

    return "\n".join(lines)


def _format_relative_date(pub_date_str: str) -> str:
    """Format string ngày YYYY-MM-DD thành mô tả thời gian tương đối."""
    if not pub_date_str:
        return ""
    try:
        dt = datetime.strptime(str(pub_date_str)[:10], "%Y-%m-%d")
        days = (datetime.now() - dt).days
        if days == 0:
            return "Hôm nay"
        elif days == 1:
            return "Hôm qua"
        elif days > 1:
            return f"{days} ngày trước"
    except Exception:
        pass
    return str(pub_date_str)


# ---------------------------------------------------------------------------
# Gemini Tool Declarations
# ---------------------------------------------------------------------------

TOOL_DECLARATIONS = [
    {
        "name": "get_stock_overview",
        "description": "Lấy thông tin tổng quan về một mã cổ phiếu (tên công ty, ngành, giá hiện tại, P/E, P/B, EPS, vốn hóa, v.v.)",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Mã chứng khoán, ví dụ: VNM, VIC, HPG"},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_stock_trading_history",
        "description": "Lấy lịch sử giá giao dịch (OHLCV) của một mã chứng khoán.",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Mã chứng khoán"},
                "start_date": {"type": "string", "description": "Ngày bắt đầu YYYY-MM-DD, mặc định 2024-01-01"},
                "end_date": {"type": "string", "description": "Ngày kết thúc YYYY-MM-DD, mặc định hôm nay"},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_financial_report",
        "description": "Lấy báo cáo tài chính của doanh nghiệp (KQKD, CĐKT, LCTT, hoặc chỉ số tài chính).",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Mã chứng khoán"},
                "report_type": {
                    "type": "string",
                    "enum": ["income_statement", "balance_sheet", "cash_flow", "ratios"],
                    "description": "Loại báo cáo: income_statement (KQKD), balance_sheet (CĐKT), cash_flow (LCTT), ratios (chỉ số)",
                },
                "period": {
                    "type": "string",
                    "enum": ["quarter", "annual"],
                    "description": "Chu kỳ báo cáo: quarter (quý) hoặc annual (năm)",
                },
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_stock_news",
        "description": "Lấy tin tức mới nhất về một doanh nghiệp niêm yết trên sàn chứng khoán.",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Mã chứng khoán"},
                "limit": {"type": "integer", "description": "Số tin tức tối đa (mặc định 5)", "default": 5},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_stock_technicals",
        "description": "Tính toán các chỉ số kỹ thuật: SMA, RSI, MACD, Bollinger Bands của một mã cổ phiếu.",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Mã chứng khoán"},
                "timeframe": {
                    "type": "string",
                    "enum": ["1M", "3M", "6M", "1Y", "2Y"],
                    "description": "Khung thời gian phân tích kỹ thuật",
                },
            },
            "required": ["symbol"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def execute_tool(name: str, args: dict) -> str:
    """Thực thi tool và trả về kết quả dạng JSON string."""
    try:
        if name == "get_stock_overview":
            result = await get_stock_overview(args["symbol"])
            return json.dumps(result, ensure_ascii=False, default=str)

        elif name == "get_stock_trading_history":
            result = await get_stock_trading_history(
                symbol=args["symbol"],
                start_date=args.get("start_date", "2024-01-01"),
                end_date=args.get("end_date"),
            )
            # Chỉ trả về 30 điểm gần nhất để tránh token quá lớn
            return json.dumps({"history": result[-30:], "total": len(result)}, ensure_ascii=False, default=str)

        elif name == "get_financial_report":
            result = await get_financial_report(
                symbol=args["symbol"],
                report_type=args.get("report_type", "income_statement"),
                period=args.get("period", "quarter"),
            )
            return json.dumps({"report": result[:8]}, ensure_ascii=False, default=str)

        elif name == "get_stock_news":
            result = await get_stock_news(
                symbol=args["symbol"],
                limit=args.get("limit", 5),
            )
            return json.dumps({"news": result}, ensure_ascii=False, default=str)

        elif name == "get_stock_technicals":
            result = await get_stock_technicals(
                symbol=args["symbol"],
                timeframe=args.get("timeframe", "1Y"),
            )
            return json.dumps(result, ensure_ascii=False, default=str)

        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as exc:
        logger.exception(f"[Tool] Error executing '{name}': {exc}")
        return json.dumps({"error": str(exc)})


# ---------------------------------------------------------------------------
# Chat Endpoint
# ---------------------------------------------------------------------------

@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Chat endpoint with Gemini Function Calling (Tool Use).
    AI tự quyết định khi nào cần gọi tools để tra cứu dữ liệu.
    """
    try:
        # 1. RAG cho tin tức
        conversation_context = _build_conversation_context(
            request.history,
            cached_articles=request.cached_articles if request.cached_articles else None
        )

        logger.info(f"Searching context for query: {request.message} | has_cache={bool(request.cached_articles)}")
        chunks, is_fallback = await search_articles(
            query=request.message,
            limit=5,
            cached_articles=request.cached_articles if request.cached_articles else None,
            conversation_context=conversation_context,
        )

        context_str = ""
        if chunks:
            context_pieces = []
            for i, chunk in enumerate(chunks, 1):
                title = chunk.get("article_title", chunk.get("title", ""))
                site = chunk.get("site", "Không rõ")
                url = chunk.get("article_url", "")
                text = chunk.get("text", "")
                pub_date = chunk.get("published_at", "")
                rel_time = _format_relative_date(pub_date)
                time_str = f" | Ngày đăng: {pub_date}" + (f" ({rel_time})" if rel_time else "")

                context_pieces.append(
                    f"[Tài liệu {i}]\nTiêu đề: {title}\nNguồn: {site}{time_str}\nNội dung: {text}\nURL: {url}"
                )
            context_str = "\n---\n".join(context_pieces)

        sources_info = sources_registry.get_sources_prompt_summary()

        if is_fallback:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh phân tích tin tức và chứng khoán.\n"
                f"{sources_info}\n\n"
                "Câu hỏi của người dùng KHÔNG tìm được kết quả chính xác nào trong cơ sở dữ liệu tin tức (do bộ lọc quá gắt). "
                "Thay vào đó, hệ thống đã tìm được một số bài viết CÓ THỂ LIÊN QUAN (gợi ý):\n"
                "NGUỒN GỢI Ý:\n" + context_str + "\n\n"
                "Nhiệm vụ của bạn:\n"
                "1. THÔNG BÁO rõ ràng cho người dùng rằng KHÔNG tìm được kết quả chính xác từ các nguồn yêu cầu.\n"
                "2. GỢI Ý 2-3 bài viết từ danh sách trên có thể liên quan, kèm tiêu đề và URL.\n"
                "3. Dùng các tools chứng khoán (get_stock_overview, v.v.) khi người dùng hỏi về dữ liệu cổ phiếu, báo cáo tài chính.\n"
                "4. TUYỆT ĐỐI KHÔNG tự suy diễn hay của mình đưa ra thông tin không có trong nguồn gợi ý trên."
            )
        else:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh chuyên phân tích tin tức và dữ liệu chứng khoán Việt Nam.\n"
                f"{sources_info}\n\n"
                "HƯỚNG DẪN TRẢ LỜI:\n"
                "1. Trả lời câu hỏi dựa trên các tài liệu trong NGỮ CẢNH bên dưới.\n"
                "2. Dùng các tools chứng khoán (get_stock_overview, v.v.) khi người dùng hỏi về dữ liệu cổ phiếu, phân tích kỹ thuật, báo cáo tài chính.\n"
                "3. Trích dẫn nguồn rõ ràng cho mọi thông tin (tiêu đề, URL).\n"
                f"Ngày hiện tại: {datetime.now().strftime('%d/%m/%Y')}\n\n"
                "NGỮ CẢNH:\n" + (context_str if context_str else "Không tìm thấy dữ liệu liên quan.")
            )

        reply = ""
        if settings.gemini_api_key:
            logger.info(f"Using Gemini with Function Tools (history turns: {len(request.history)}).")
            reply = await generate_gemini_content_with_tools(
                api_key=settings.gemini_api_key,
                model=settings.gemini_model_chat,
                message=request.message,
                history=request.history,
                system_instruction=system_instruction,
                tool_declarations=TOOL_DECLARATIONS,
                tool_executor=execute_tool,
            )
        else:
            # Fallback to Ollama (no tool support)
            logger.info("Using Ollama for chat generation.")
            messages = list(request.history) + [ChatMessage(role="user", content=request.message)]
            reply = await generate_ollama_content(
                model=settings.model_name,
                contents=messages,
                system_instruction=system_instruction,
                json_format=False,
            )
    except Exception as exc:
        logger.exception(f"Error in chat endpoint: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    updated_history = [
        *request.history,
        ChatMessage(role="user", content=request.message),
        ChatMessage(role="model", content=reply),
    ]

    return ChatResponse(
        reply=reply,
        history=updated_history,
        cached_articles=chunks,
    )
