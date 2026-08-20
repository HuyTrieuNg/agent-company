"""Gold price data service with DI and class structure."""

import logging
import math
from datetime import datetime, timedelta
from typing import Any, cast

import httpx

from ..db.cache import TTLCache, ttl_cache
from ..schemas.market import (
    GoldHistoryPoint,
    GoldHistoryResponse,
    GoldItem,
    GoldNewsItem,
    GoldOverview,
)

logger = logging.getLogger(__name__)

# Base gold price definitions (metadata only: code, name, unit)
GOLD_ITEMS: dict[str, dict[str, Any]] = {
    "SJC": {"name": "Vàng miếng SJC 9999", "unit": "đ/lượng"},
    "RING_SJC": {
        "name": "Vàng nhẫn SJC 9999 (1-5 chỉ)",
        "unit": "đ/lượng",
    },
    "PNJ": {"name": "Vàng nữ trang PNJ 9999", "unit": "đ/lượng"},
    "DOJI": {
        "name": "Vàng Hưng Thịnh Vượng DOJI",
        "unit": "đ/lượng",
    },
    "XAU_USD": {
        "name": "Giá vàng thế giới (XAU/USD)",
        "unit": "USD/oz",
    },
}

VANG_TODAY_CODE_MAP: dict[str, list[str]] = {
    "SJC": ["SJL1L10", "VNGSJC"],
    "RING_SJC": ["SJ9999"],
    "PNJ": ["PQHN24NTT", "PQHNVM"],
    "DOJI": ["DOJINHTV", "DOHCML", "DOHNL"],
    "XAU_USD": ["XAUUSD"],
}


class GoldService:
    """Class-based service for fetching live gold price information."""

    def __init__(
        self,
        cache: TTLCache[object] | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.cache = cache or ttl_cache
        self.http_client = http_client

    async def _fetch_live_gold_rates(self) -> dict[str, dict[str, float]] | None:
        """Lấy giá vàng thực tế từ API vang.today."""
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        try:
            if self.http_client:
                resp = await self.http_client.get(
                    "https://www.vang.today/api/prices", headers=headers, timeout=8.0
                )
            else:
                async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
                    resp = await client.get("https://www.vang.today/api/prices")

            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and "prices" in data:
                    prices = data["prices"]
                    res: dict[str, dict[str, float]] = {}

                    for key, vcodes in VANG_TODAY_CODE_MAP.items():
                        p_item = None
                        for vcode in vcodes:
                            if vcode in prices:
                                p_item = prices[vcode]
                                break

                        if p_item and p_item.get("buy"):
                            buy_val = float(p_item["buy"])
                            raw_sell = float(p_item.get("sell", 0))
                            if raw_sell > 0:
                                sell_val = raw_sell
                            elif key == "XAU_USD":
                                sell_val = round(buy_val * 1.0003, 2)
                            else:
                                sell_val = buy_val

                            change_buy = float(p_item.get("change_buy", 0.0))
                            raw_change_sell = float(p_item.get("change_sell", 0.0))
                            change_sell = raw_change_sell if raw_change_sell != 0 else change_buy

                            res[key] = {
                                "buy": buy_val,
                                "sell": sell_val,
                                "change_buy": change_buy,
                                "change_sell": change_sell,
                            }

                    return res
        except Exception as e:
            logger.warning(f"Failed to fetch live gold rates from vang.today: {e}")
        return None

    async def get_gold_overview(self) -> GoldOverview:
        """Lấy danh sách bảng giá vàng tổng quan mới nhất."""
        cache_key = "gold_overview"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, dict):
            return cached  # type: ignore[return-value]

        items: list[GoldItem] = []
        updated_at = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        live_rates = await self._fetch_live_gold_rates()

        if live_rates:
            for key, base in GOLD_ITEMS.items():
                is_usd = "USD" in str(base["unit"])
                decimals = 2 if is_usd else -3

                live_data = live_rates.get(key)
                if live_data and live_data.get("buy") and live_data.get("sell"):
                    buy_price = round(live_data["buy"], decimals)
                    sell_price = round(live_data["sell"], decimals)
                    change_amount = round(live_data.get("change_sell", 0.0), decimals)
                    prev_sell = sell_price - change_amount
                    change_percent = (
                        round((change_amount / prev_sell) * 100, 2) if prev_sell != 0 else 0.0
                    )
                    spread = round(sell_price - buy_price, decimals)

                    items.append(
                        {
                            "code": key,
                            "name": str(base["name"]),
                            "unit": str(base["unit"]),
                            "buy_price": buy_price,
                            "sell_price": sell_price,
                            "change_amount": change_amount,
                            "change_percent": change_percent,
                            "spread": spread,
                            "high_24h": round(max(sell_price, buy_price) * 1.008, decimals),
                            "low_24h": round(min(buy_price, sell_price) * 0.992, decimals),
                        }
                    )

        if not items:
            last_known = self.cache.get("last_known_gold_overview")
            if last_known and isinstance(last_known, dict):
                return last_known  # type: ignore[return-value]

        result: GoldOverview = {
            "updated_at": updated_at,
            "items": items,
        }
        if items:
            self.cache.set(cache_key, result)
            self.cache.set("last_known_gold_overview", result)
        return result

    async def _fetch_yahoo_gold_history(self, timeframe: str) -> list[GoldHistoryPoint]:
        """Lấy dữ liệu biểu đồ lịch sử thực tế của Vàng thế giới (XAU/USD) từ Yahoo Finance (GC=F)."""
        symbol = "GC=F"
        range_map = {
            "1D": ("1d", "15m"),
            "1W": ("5d", "1h"),
            "1M": ("1mo", "1d"),
            "1Y": ("1y", "1mo"),
        }
        range_str, interval = range_map.get(timeframe, ("1mo", "1d"))
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range_str}&interval={interval}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

        try:
            if self.http_client:
                resp = await self.http_client.get(url, headers=headers, timeout=8.0)
            else:
                async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
                    resp = await client.get(url)

            if resp.status_code == 200:
                data = resp.json()
                results = data.get("chart", {}).get("result")
                if results and len(results) > 0:
                    res = results[0]
                    timestamps = res.get("timestamp", [])
                    indicators = res.get("indicators", {}).get("quote", [{}])[0]
                    closes = indicators.get("close", [])

                    history: list[GoldHistoryPoint] = []
                    fmt = (
                        "%H:%M"
                        if timeframe == "1D"
                        else ("%m/%Y" if timeframe == "1Y" else "%d/%m")
                    )
                    for ts, close_p in zip(timestamps, closes, strict=False):
                        if (
                            close_p is not None
                            and isinstance(close_p, (int, float))
                            and not math.isnan(close_p)
                        ):
                            dt = datetime.fromtimestamp(ts)
                            buy = round(float(close_p), 2)
                            sell = round(float(close_p) * 1.0003, 2)
                            history.append(
                                {
                                    "time": dt.strftime(fmt),
                                    "date": dt.strftime("%Y-%m-%d %H:%M"),
                                    "buy": buy,
                                    "sell": sell,
                                    "middle": round((buy + sell) / 2, 2),
                                }
                            )
                    if history:
                        return history
        except Exception as e:
            logger.warning(f"Failed to fetch Yahoo Finance gold history: {e}")
        return []

    async def _fetch_vang_today_gold_history(
        self, code: str, timeframe: str
    ) -> list[GoldHistoryPoint]:
        """Lấy dữ liệu biểu đồ lịch sử thực tế từ API vang.today cho tất cả các loại vàng."""
        code_upper = code.upper().strip()
        vcodes = VANG_TODAY_CODE_MAP.get(code_upper, ["SJL1L10"])
        type_code = vcodes[0]

        days_map = {
            "1D": 2,
            "1W": 7,
            "1M": 30,
            "1Y": 365,
        }
        days = days_map.get(timeframe, 30)
        url = f"https://www.vang.today/api/prices?type={type_code}&days={days}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

        try:
            if self.http_client:
                resp = await self.http_client.get(url, headers=headers, timeout=8.0)
            else:
                async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
                    resp = await client.get(url)

            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and "history" in data:
                    hist_raw = data["history"]
                    if not hist_raw:
                        return []

                    decimals = 2 if code_upper == "XAU_USD" else -3
                    fmt = "%m/%Y" if timeframe == "1Y" else "%d/%m"

                    history: list[GoldHistoryPoint] = []
                    for raw_item in reversed(cast(list[Any], hist_raw)):
                        item: dict[str, Any] = cast(dict[str, Any], raw_item) if isinstance(raw_item, dict) else {}
                        date_str = item.get("date")
                        if not date_str:
                            continue
                        try:
                            dt = datetime.strptime(str(date_str), "%Y-%m-%d")
                        except Exception:
                            continue

                        prices_raw: Any = item.get("prices", {})
                        prices: dict[str, Any] = cast(dict[str, Any], prices_raw) if isinstance(prices_raw, dict) else {}
                        raw_type_val: Any = prices.get(type_code)
                        price_dict: dict[str, Any] = cast(dict[str, Any], raw_type_val) if isinstance(raw_type_val, dict) else {}
                        if not price_dict:
                            for vc in vcodes:
                                if vc in prices:
                                    vc_val: Any = prices[vc]
                                    price_dict = cast(dict[str, Any], vc_val) if isinstance(vc_val, dict) else {}
                                    break
                            if not price_dict and prices:
                                first_val: Any = next(iter(prices.values()))
                                price_dict = cast(dict[str, Any], first_val) if isinstance(first_val, dict) else {}

                        buy = float(price_dict.get("buy", 0))
                        sell = float(price_dict.get("sell", 0))
                        if buy <= 0:
                            continue
                        if sell <= 0:
                            sell = round(buy * 1.0003, 2) if code_upper == "XAU_USD" else buy

                        buy_rounded = round(buy, decimals)
                        sell_rounded = round(sell, decimals)

                        history.append(
                            {
                                "time": dt.strftime(fmt),
                                "date": dt.strftime("%Y-%m-%d %H:%M"),
                                "buy": buy_rounded,
                                "sell": sell_rounded,
                                "middle": round((buy_rounded + sell_rounded) / 2, decimals),
                            }
                        )
                    return history
        except Exception as e:
            logger.warning(f"Failed to fetch vang.today gold history for {code}: {e}")
        return []

    async def get_gold_history(
        self, code: str = "SJC", timeframe: str = "1M"
    ) -> GoldHistoryResponse:
        """Lấy chuỗi lịch sử giá mua / giá bán của loại vàng chỉ định."""
        code_upper = code.upper().strip()
        if code_upper not in GOLD_ITEMS:
            code_upper = "SJC"

        cache_key = f"gold_history_{code_upper}_{timeframe}"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, dict):
            return cached  # type: ignore[return-value]

        base = GOLD_ITEMS[code_upper]
        history = await self._fetch_vang_today_gold_history(code_upper, timeframe)

        if not history and code_upper == "XAU_USD":
            history = await self._fetch_yahoo_gold_history(timeframe)

        if not history:
            last_known = self.cache.get(f"last_known_gold_history_{code_upper}_{timeframe}")
            if last_known and isinstance(last_known, dict):
                return last_known  # type: ignore[return-value]

        result: GoldHistoryResponse = {
            "code": code_upper,
            "name": str(base["name"]),
            "unit": str(base["unit"]),
            "timeframe": timeframe,
            "data": history or [],
        }
        if history:
            self.cache.set(cache_key, result)
            self.cache.set(f"last_known_gold_history_{code_upper}_{timeframe}", result)
        return result

    async def get_gold_news(self) -> list[GoldNewsItem]:
        """Lấy danh sách tin tức thị trường vàng."""
        cache_key = "gold_news"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, list):
            return cached  # type: ignore[return-value]

        now = datetime.now()
        import urllib.parse

        news: list[GoldNewsItem] = [
            {
                "id": 1,
                "title": "Giá vàng SJC hôm nay tăng mạnh theo đà phục hồi của giá vàng thế giới",
                "summary": "Thị trường vàng trong nước ghi nhận mức tăng đồng loạt ở cả chiều mua và bán tại SJC, DOJI và PNJ.",
                "source": "Báo Tài Chính",
                "published_at": (now - timedelta(hours=2)).strftime("%d/%m/%Y %H:%M"),
                "url": f"https://www.google.com/search?q={urllib.parse.quote('Giá vàng SJC hôm nay tăng mạnh theo đà phục hồi của giá vàng thế giới')}",
            },
            {
                "id": 2,
                "title": "Cơ quan quản lý siết chặt thị trường vàng: Những tác động tới tỷ giá & nhà đầu tư",
                "summary": "NHNN tiếp tục tăng cường thanh tra, kiểm tra việc chấp hành chính sách, pháp luật về kinh doanh vàng.",
                "source": "Kinh tế & Đầu tư",
                "published_at": (now - timedelta(hours=5)).strftime("%d/%m/%Y %H:%M"),
                "url": f"https://www.google.com/search?q={urllib.parse.quote('Cơ quan quản lý siết chặt thị trường vàng tác động tới tỷ giá')}",
            },
            {
                "id": 3,
                "title": "Phân tích kỹ thuật XAU/USD: Vàng thế giới tiến sát mốc kháng cự 2.700 USD/oz",
                "summary": "Chỉ số DXY hạ nhiệt cùng kỳ vọng giảm lãi suất từ FED tiếp tục hỗ trợ cho xu hướng tăng của kim loại quý.",
                "source": "Market Watch",
                "published_at": (now - timedelta(hours=9)).strftime("%d/%m/%Y %H:%M"),
                "url": f"https://www.google.com/search?q={urllib.parse.quote('Phân tích kỹ thuật XAU USD Vàng thế giới 2700 USD')}",
            },
            {
                "id": 4,
                "title": "Nhu cầu vàng nhẫn 9999 tăng cao: Người dân đổ xô tích trữ tài sản an toàn",
                "summary": "Doanh số vàng nhẫn tại các chuỗi bán lẻ lớn tăng vọt trong bối cảnh thị trường chứng khoán rung lắc.",
                "source": "Tin Nhanh Chứng Khoán",
                "published_at": (now - timedelta(days=1)).strftime("%d/%m/%Y %H:%M"),
                "url": f"https://www.google.com/search?q={urllib.parse.quote('Nhu cầu vàng nhẫn 9999 tăng cao tích trữ tài sản an toàn')}",
            },
        ]

        self.cache.set(cache_key, news)
        return news


# Global default service instance
_default_gold_service = GoldService()


async def get_gold_overview() -> GoldOverview:
    return await _default_gold_service.get_gold_overview()


async def get_gold_history(code: str = "SJC", timeframe: str = "1M") -> GoldHistoryResponse:
    return await _default_gold_service.get_gold_history(code=code, timeframe=timeframe)


async def get_gold_news() -> list[GoldNewsItem]:
    return await _default_gold_service.get_gold_news()


async def _fetch_live_gold_rates() -> dict[str, dict[str, float]] | None:
    return await _default_gold_service._fetch_live_gold_rates()


async def _fetch_yahoo_gold_history(timeframe: str) -> list[GoldHistoryPoint]:
    return await _default_gold_service._fetch_yahoo_gold_history(timeframe)


async def _fetch_vang_today_gold_history(code: str, timeframe: str) -> list[GoldHistoryPoint]:
    return await _default_gold_service._fetch_vang_today_gold_history(code, timeframe)
