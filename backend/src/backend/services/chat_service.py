"""Chat Service Orchestrator with RAG, Tool Calling and User Preferences."""

import json
import logging
import sys
from datetime import datetime
from typing import Any

from ..core.config import Settings, settings
from ..repositories.chat_repository import ChatRepository
from ..repositories.preference_repository import PreferenceRepository
from ..schemas.chat import ChatMessage, ChatRequest, ChatResponse
from .forex_service import ForexService
from .gemini_service import GeminiService, generate_gemini_content_with_tools
from .gold_service import GoldService
from .ollama_service import OllamaService
from .qdrant_service import QdrantService
from .sources_registry import SourcesRegistry
from .stock_service import StockService

logger = logging.getLogger(__name__)


def _build_conversation_context(
    history: list[ChatMessage],
    cached_articles: list[dict[str, Any]] | None = None,
    max_turns: int = 3,
) -> str:
    """Tạo tóm tắt ngắn về các chủ đề và nguồn trang web đã được trích dẫn trong các lượt trước."""
    lines: list[str] = []
    if cached_articles:
        cited_sites = set(str(art.get("site")) for art in cached_articles if art.get("site"))
        if cited_sites:
            lines.append(f"Các nguồn trang web đã trích dẫn ở lượt trước: {', '.join(cited_sites)}")

    if history:
        recent = history[-(max_turns * 2) :] if max_turns > 0 else history
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


TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "name": "get_stock_overview",
        "description": "Lấy thông tin tổng quan về một mã cổ phiếu (tên công ty, ngành, giá hiện tại, P/E, P/B, EPS, vốn hóa, v.v.)",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Mã chứng khoán, ví dụ: VNM, VIC, HPG",
                },
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
                "start_date": {
                    "type": "string",
                    "description": "Ngày bắt đầu YYYY-MM-DD, mặc định 2024-01-01",
                },
                "end_date": {
                    "type": "string",
                    "description": "Ngày kết thúc YYYY-MM-DD, mặc định hôm nay",
                },
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
                    "enum": [
                        "income_statement",
                        "balance_sheet",
                        "cash_flow",
                        "ratios",
                    ],
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
                "limit": {
                    "type": "integer",
                    "description": "Số tin tức tối đa (mặc định 5)",
                    "default": 5,
                },
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
    {
        "name": "get_gold_overview",
        "description": "Lấy thông tin bảng giá vàng trực tuyến mới nhất (SJC, Nhẫn 9999, PNJ, DOJI, Vàng thế giới XAU/USD). Trả về giá mua, giá bán, chênh lệch spread và % biến động.",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_gold_history",
        "description": "Lấy chuỗi lịch sử giá vàng theo loại vàng (SJC, RING_SJC, PNJ, DOJI, XAU_USD) và khoảng thời gian (1D, 1W, 1M, 1Y).",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Mã loại vàng: SJC, RING_SJC (nhẫn 9999), PNJ, DOJI, XAU_USD. Mặc định SJC.",
                },
                "timeframe": {
                    "type": "string",
                    "enum": ["1D", "1W", "1M", "1Y"],
                    "description": "Khung thời gian: 1D, 1W, 1M, 1Y. Mặc định 1M.",
                },
            },
        },
    },
    {
        "name": "get_forex_overview",
        "description": "Lấy bảng tỷ giá ngoại tệ ngân hàng mới nhất (USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY). Trả về tỷ giá mua tiền mặt, mua chuyển khoản, bán ra và % thay đổi.",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_forex_history",
        "description": "Lấy lịch sử tỷ giá theo cặp ngoại tệ (USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY) và khoảng thời gian (1D, 1W, 1M, 1Y).",
        "parameters": {
            "type": "object",
            "properties": {
                "pair": {
                    "type": "string",
                    "description": "Mã ngoại tệ: USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY. Mặc định USD.",
                },
                "timeframe": {
                    "type": "string",
                    "enum": ["1D", "1W", "1M", "1Y"],
                    "description": "Khung thời gian: 1D, 1W, 1M, 1Y. Mặc định 1M.",
                },
            },
        },
    },
]


class ChatService:
    """Orchestrator for chat conversations, RAG search, tools, and persistence."""

    def __init__(
        self,
        gemini_service: GeminiService,
        ollama_service: OllamaService,
        qdrant_service: QdrantService,
        stock_service: StockService,
        gold_service: GoldService,
        forex_service: ForexService,
        sources_reg: SourcesRegistry,
        app_settings: Settings | None = None,
    ) -> None:
        self.gemini_service = gemini_service
        self.ollama_service = ollama_service
        self.qdrant_service = qdrant_service
        self.stock_service = stock_service
        self.gold_service = gold_service
        self.forex_service = forex_service
        self.sources_registry = sources_reg
        self.settings = app_settings or settings

    async def execute_tool(self, name: str, args: dict[str, Any]) -> str:
        """Thực thi tool theo tên và tham số, trả về chuỗi JSON."""
        try:
            if name == "get_stock_overview":
                result = await self.stock_service.get_stock_overview(str(args["symbol"]))
                return json.dumps(result, ensure_ascii=False, default=str)

            elif name == "get_stock_trading_history":
                result = await self.stock_service.get_stock_trading_history(
                    symbol=str(args["symbol"]),
                    start_date=str(args.get("start_date", "2024-01-01")),
                    end_date=str(args.get("end_date", "")) if args.get("end_date") else None,
                )
                return json.dumps(
                    {"history": result[-30:], "total": len(result)},
                    ensure_ascii=False,
                    default=str,
                )

            elif name == "get_financial_report":
                result = await self.stock_service.get_financial_report(
                    symbol=str(args["symbol"]),
                    report_type=str(args.get("report_type", "income_statement")),
                    period=str(args.get("period", "quarter")),
                )
                return json.dumps({"report": result[:8]}, ensure_ascii=False, default=str)

            elif name == "get_stock_news":
                result = await self.stock_service.get_stock_news(
                    symbol=str(args["symbol"]),
                    limit=int(args.get("limit", 5)),
                )
                return json.dumps({"news": result}, ensure_ascii=False, default=str)

            elif name == "get_stock_technicals":
                result = await self.stock_service.get_stock_technicals(
                    symbol=str(args["symbol"]),
                    timeframe=str(args.get("timeframe", "1Y")),
                )
                return json.dumps(result, ensure_ascii=False, default=str)

            elif name == "get_gold_overview":
                result = await self.gold_service.get_gold_overview()
                return json.dumps(result, ensure_ascii=False, default=str)

            elif name == "get_gold_history":
                result = await self.gold_service.get_gold_history(
                    code=str(args.get("code", "SJC")),
                    timeframe=str(args.get("timeframe", "1M")),
                )
                return json.dumps(result, ensure_ascii=False, default=str)

            elif name == "get_forex_overview":
                result = await self.forex_service.get_forex_overview()
                return json.dumps(result, ensure_ascii=False, default=str)

            elif name == "get_forex_history":
                result = await self.forex_service.get_forex_history(
                    pair=str(args.get("pair", "USD")),
                    timeframe=str(args.get("timeframe", "1M")),
                )
                return json.dumps(result, ensure_ascii=False, default=str)

            else:
                return json.dumps({"error": f"Unknown tool: {name}"})

        except Exception as exc:
            logger.exception(f"[ChatService Tool] Error executing '{name}': {exc}")
            return json.dumps({"error": str(exc)})

    async def process_chat(
        self,
        request: ChatRequest,
        chat_repo: ChatRepository,
        pref_repo: PreferenceRepository,
    ) -> ChatResponse:
        """Main chat pipeline."""
        initial_title = request.message[:35] + ("..." if len(request.message) > 35 else "")
        session_obj, is_new = await chat_repo.get_or_create_session(
            request.session_id, initial_title=initial_title
        )
        session_id = session_obj.id

        if not is_new and session_obj.title == "Cuộc trò chuyện mới":
            await chat_repo.update_session_title(session_id, initial_title)

        # Load User Preferences
        pref = await pref_repo.get_or_create_preference()
        pref_context_lines: list[str] = []
        if pref.role_title:
            pref_context_lines.append(
                f"- Xưng hô / Vai trò mong muốn của người dùng: {pref.role_title}"
            )
        if pref.interested_topics:
            pref_context_lines.append(
                f"- Lĩnh vực / Mã chứng khoán / Chủ đề người dùng đặc biệt quan tâm: {pref.interested_topics}"
            )
        if pref.response_style == "sut_tich":
            pref_context_lines.append(
                "- Phong cách phản hồi: Ngắn gọn, súc tích, đi thẳng vào trọng tâm."
            )
        elif pref.response_style == "chi_tiet":
            pref_context_lines.append(
                "- Phong cách phản hồi: Chi tiết, giải thích rõ ràng kèm đầy đủ lập luận."
            )
        elif pref.response_style == "phan_tich":
            pref_context_lines.append(
                "- Phong cách phản hồi: Phân tích chuyên sâu, trình bày có cấu trúc kèm bảng biểu hoặc số liệu."
            )
        if pref.custom_instructions:
            pref_context_lines.append(
                f"- Yêu cầu bổ sung của người dùng: {pref.custom_instructions}"
            )

        user_pref_prompt = ""
        if pref_context_lines:
            user_pref_prompt = (
                "\n\nTHÔNG TIN NGƯỜI DÙNG & PHONG CÁCH MONG MUỐN (USER PREFERENCE CONTEXT):\n"
                + "\n".join(pref_context_lines)
                + "\n(Hãy luôn điều chỉnh giọng văn và ưu tiên thông tin theo sở thích trên của người dùng.)\n"
            )

        # Build pinned articles context string
        pinned_context_str = ""
        pinned_list = request.pinned_articles or []
        if pinned_list:
            pinned_pieces: list[str] = []
            for i, art in enumerate(pinned_list, 1):
                title = art.get("title", art.get("article_title", "Bài báo"))
                site = art.get("site", "Nguồn tin")
                content = art.get("content", art.get("text", art.get("sapo", "")))
                url = art.get("url", art.get("article_url", ""))
                pub = str(art.get("published_at", ""))
                rel_time = _format_relative_date(pub) if pub else ""
                time_info = f" ({rel_time})" if rel_time else ""
                pinned_pieces.append(
                    f"[Bài báo đã ghim {i}]\nTiêu đề: {title}\nNguồn: {site} | Ngày đăng: {pub}{time_info}\nURL: {url}\nNội dung:\n{content}"
                )
            pinned_context_str = "📌 BÀI BÁO NGƯỜI DÙNG ĐÃ GHIM VÀO CONTEXT:\n" + "\n---\n".join(
                pinned_pieces
            )

        combined_cache: list[dict[str, Any]] = (
            [dict(a) for a in request.cached_articles] if request.cached_articles else []
        ) + [dict(a) for a in pinned_list]

        # 1. RAG cho tin tức
        conversation_context = _build_conversation_context(
            request.history,
            cached_articles=combined_cache if combined_cache else None,
        )
        if pinned_context_str:
            conversation_context = (pinned_context_str + "\n\n" + conversation_context).strip()

        logger.info(
            f"Searching context for query: {request.message} | session={session_id} | "
            f"has_cache={bool(request.cached_articles)} | pinned_count={len(pinned_list)}"
        )
        chunks, is_fallback = await self.qdrant_service.search_articles(
            query=request.message,
            limit=5,
            cached_articles=combined_cache if combined_cache else None,
            conversation_context=conversation_context,
        )

        context_str = ""
        if chunks:
            context_pieces: list[str] = []
            for i, chunk in enumerate(chunks, 1):
                title = chunk.get("article_title", chunk.get("title", ""))
                site = chunk.get("site", "Không rõ")
                url = chunk.get("article_url", "")
                text = chunk.get("text", "")
                pub_date = str(chunk.get("published_at", ""))
                rel_time = _format_relative_date(pub_date)
                time_str = f" | Ngày đăng: {pub_date}" + (f" ({rel_time})" if rel_time else "")
                context_pieces.append(
                    f"[Tài liệu RAG {i}]\nTiêu đề: {title}\nNguồn: {site}{time_str}\nNội dung: {text}\nURL: {url}"
                )
            context_str = "\n---\n".join(context_pieces)

        full_context_blocks: list[str] = []
        if pinned_context_str:
            full_context_blocks.append(pinned_context_str)
        if context_str:
            full_context_blocks.append(
                "🔍 TÀI LIỆU TRA CỨU TỪ CƠ SỞ DỮ LIỆU TIN TỨC:\n" + context_str
            )

        final_context_text = (
            "\n\n====================\n\n".join(full_context_blocks)
            if full_context_blocks
            else "Không tìm thấy dữ liệu liên quan."
        )

        sources_info = self.sources_registry.get_sources_prompt_summary()

        if is_fallback:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh phân tích tin tức, chứng khoán, giá vàng và ngoại tệ.\n"
                f"{sources_info}\n\n"
                + user_pref_prompt
                + "Câu hỏi của người dùng KHÔNG tìm được kết quả chính xác nào trong cơ sở dữ liệu tin tức (do bộ lọc quá gắt). "
                "Thay vào đó, hệ thống đã tìm được một số bài viết CÓ THỂ LIÊN QUAN (gợi ý):\n"
                "NGUỒN GỢI Ý:\n" + final_context_text + "\n\n"
                "Nhiệm vụ của bạn:\n"
                "1. THÔNG BÁO rõ ràng cho người dùng rằng KHÔNG tìm được kết quả chính xác từ các nguồn yêu cầu.\n"
                "2. GỢI Ý 2-3 bài viết từ danh sách trên có thể liên quan, kèm tiêu đề và URL.\n"
                "3. Dùng các tools chứng khoán (get_stock_overview, v.v.), giá vàng (get_gold_overview, v.v.), và ngoại tệ (get_forex_overview, v.v.) khi người dùng hỏi về cổ phiếu, báo cáo tài chính, giá vàng SJC/thế giới hoặc tỷ giá ngoại tệ.\n"
                "4. TUYỆT ĐỐI KHÔNG tự suy diễn hay đưa ra thông tin không có trong nguồn gợi ý trên."
            )
        else:
            system_instruction = (
                "Bạn là trợ lý ảo thông minh chuyên phân tích tin tức, chứng khoán, giá vàng và tỷ giá ngoại tệ Việt Nam.\n"
                f"{sources_info}\n\n" + user_pref_prompt + "HƯỚNG DẪN TRẢ LỜI:\n"
                "1. Trả lời câu hỏi dựa trên các bài báo đã ghim và tài liệu trong NGỮ CẢNH bên dưới. Hãy ưu tiên phân tích bài báo đã ghim trước nếu người dùng có ghim bài báo.\n"
                "2. Dùng các tools chứng khoán (get_stock_overview, v.v.), giá vàng (get_gold_overview, get_gold_history), và ngoại tệ (get_forex_overview, get_forex_history) khi người dùng hỏi về dữ liệu số cổ phiếu, giá vàng SJC/nhẫn/thế giới, hoặc tỷ giá ngoại tệ USD/EUR/JPY/GBP.\n"
                "3. Trích dẫn nguồn rõ ràng cho mọi thông tin (tiêu đề, URL).\n"
                f"Ngày hiện tại: {datetime.now().strftime('%d/%m/%Y')}\n\n"
                "NGỮ CẢNH:\n" + final_context_text
            )

        reply = ""
        # Check if generate_gemini_content_with_tools was patched in routers.chat
        router_mod = sys.modules.get("backend.routers.chat")
        fn = getattr(router_mod, "generate_gemini_content_with_tools", None) if router_mod else None

        if fn is not None and fn is not generate_gemini_content_with_tools:
            logger.info(
                f"Using patched generate_gemini_content_with_tools (history turns: {len(request.history)})."
            )
            reply = await fn(
                api_key=self.settings.gemini_api_key,
                model=self.settings.gemini_model_chat,
                message=request.message,
                history=request.history,
                system_instruction=system_instruction,
                tool_declarations=TOOL_DECLARATIONS,
                tool_executor=self.execute_tool,
            )
        elif self.settings.gemini_api_key:
            logger.info(
                f"Using Gemini with Function Tools (history turns: {len(request.history)})."
            )
            reply = await self.gemini_service.generate_content_with_tools(
                api_key=self.settings.gemini_api_key,
                model=self.settings.gemini_model_chat,
                message=request.message,
                history=request.history,
                system_instruction=system_instruction,
                tool_declarations=TOOL_DECLARATIONS,
                tool_executor=self.execute_tool,
            )
        else:
            logger.info("Using Ollama for chat generation.")
            messages = list(request.history) + [ChatMessage(role="user", content=request.message)]
            reply = await self.ollama_service.generate_content(
                model=self.settings.model_name,
                contents=messages,
                system_instruction=system_instruction,
                json_format=False,
            )

        # Lưu lịch sử qua ChatRepository
        await chat_repo.save_turn(
            session_id=session_id,
            user_content=request.message,
            model_content=reply,
        )

        updated_history = [
            *request.history,
            ChatMessage(role="user", content=request.message),
            ChatMessage(role="model", content=reply),
        ]

        return ChatResponse(
            reply=reply,
            session_id=session_id,
            history=updated_history,
            cached_articles=[dict(c) for c in chunks],
        )
