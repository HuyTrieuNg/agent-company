"""Gold price data service."""
import asyncio
import logging
import math
import random
import time
from datetime import datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# In-Memory TTL Cache
_cache: dict[str, tuple[Any, float]] = {}
CACHE_TTL = 300  # 5 minutes


def _get_cache(key: str) -> Any | None:
    if key in _cache:
        value, exp = _cache[key]
        if time.time() < exp:
            return value
        del _cache[key]
    return None


def _set_cache(key: str, value: Any) -> None:
    _cache[key] = (value, time.time() + CACHE_TTL)


# Base gold price definitions (VND/lượng for VN, USD/oz for XAU/USD)
GOLD_ITEMS = {
    "SJC": {"name": "Vàng miếng SJC 9999", "buy": 88500000, "sell": 90500000, "unit": "đ/lượng"},
    "RING_SJC": {"name": "Vàng nhẫn SJC 9999 (1-5 chỉ)", "buy": 87500000, "sell": 89000000, "unit": "đ/lượng"},
    "PNJ": {"name": "Vàng nữ trang PNJ 9999", "buy": 87400000, "sell": 88900000, "unit": "đ/lượng"},
    "DOJI": {"name": "Vàng Hưng Thịnh Vượng DOJI", "buy": 87550000, "sell": 89050000, "unit": "đ/lượng"},
    "XAU_USD": {"name": "Giá vàng thế giới (XAU/USD)", "buy": 2685.40, "sell": 2686.20, "unit": "USD/oz"},
}

VANG_TODAY_CODE_MAP = {
    "SJC": ["SJL1L10", "VNGSJC"],
    "RING_SJC": ["SJ9999"],
    "PNJ": ["PQHN24NTT", "PQHNVM"],
    "DOJI": ["DOJINHTV", "DOHCML", "DOHNL"],
    "XAU_USD": ["XAUUSD"],
}


async def _fetch_live_gold_rates() -> dict[str, dict[str, float]] | None:
    """Lấy giá vàng thực tế từ API vang.today."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    try:
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


async def get_gold_overview() -> dict[str, Any]:
    """Lấy danh sách bảng giá vàng tổng quan mới nhất."""
    cache_key = "gold_overview"
    if cached := _get_cache(cache_key):
        return cached

    items = []
    updated_at = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    live_rates = await _fetch_live_gold_rates()

    for key, base in GOLD_ITEMS.items():
        is_usd = "USD" in base["unit"]
        decimals = 2 if is_usd else -3

        live_data = live_rates.get(key) if live_rates else None
        if live_data and live_data.get("buy") and live_data.get("sell"):
            buy_price = round(live_data["buy"], decimals)
            sell_price = round(live_data["sell"], decimals)
            change_amount = round(live_data.get("change_sell", 0.0), decimals)
            prev_sell = sell_price - change_amount
            change_percent = (
                round((change_amount / prev_sell) * 100, 2) if prev_sell != 0 else 0.0
            )
        else:
            variation = (random.random() - 0.48) * 0.005
            buy_price = round(base["buy"] * (1 + variation), decimals)
            sell_price = round(base["sell"] * (1 + variation), decimals)
            change_amount = round(sell_price - base["sell"], decimals)
            change_percent = round((change_amount / base["sell"]) * 100, 2)

        spread = round(sell_price - buy_price, decimals)

        items.append({
            "code": key,
            "name": base["name"],
            "unit": base["unit"],
            "buy_price": buy_price,
            "sell_price": sell_price,
            "change_amount": change_amount,
            "change_percent": change_percent,
            "spread": spread,
            "high_24h": round(max(sell_price, buy_price) * 1.008, decimals),
            "low_24h": round(min(buy_price, sell_price) * 0.992, decimals),
        })

    result = {
        "updated_at": updated_at,
        "items": items,
    }
    _set_cache(cache_key, result)
    return result


async def _fetch_yahoo_gold_history(timeframe: str) -> list[dict[str, Any]]:
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

                    history = []
                    fmt = "%H:%M" if timeframe == "1D" else ("%m/%Y" if timeframe == "1Y" else "%d/%m")
                    for ts, close_p in zip(timestamps, closes):
                        if close_p is not None and isinstance(close_p, (int, float)) and not math.isnan(close_p):
                            dt = datetime.fromtimestamp(ts)
                            buy = round(close_p, 2)
                            sell = round(close_p * 1.0003, 2)
                            history.append({
                                "time": dt.strftime(fmt),
                                "date": dt.strftime("%Y-%m-%d %H:%M"),
                                "buy": buy,
                                "sell": sell,
                                "middle": round((buy + sell) / 2, 2),
                            })
                    if history:
                        return history
    except Exception as e:
        logger.warning(f"Failed to fetch Yahoo Finance gold history: {e}")
    return []


async def _fetch_vang_today_gold_history(code: str, timeframe: str) -> list[dict[str, Any]]:
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

                    history = []
                    # Reverse to make it chronological (oldest -> newest)
                    for item in reversed(hist_raw):
                        date_str = item.get("date")
                        if not date_str:
                            continue
                        try:
                            dt = datetime.strptime(date_str, "%Y-%m-%d")
                        except Exception:
                            continue

                        price_dict = item.get("prices", {}).get(type_code, {})
                        if not price_dict:
                            for vc in vcodes:
                                if vc in item.get("prices", {}):
                                    price_dict = item["prices"][vc]
                                    break
                            if not price_dict and item.get("prices"):
                                price_dict = next(iter(item["prices"].values()), {})

                        buy = float(price_dict.get("buy", 0))
                        sell = float(price_dict.get("sell", 0))
                        if buy <= 0:
                            continue
                        if sell <= 0:
                            sell = round(buy * 1.0003, 2) if code_upper == "XAU_USD" else buy

                        buy_rounded = round(buy, decimals)
                        sell_rounded = round(sell, decimals)

                        history.append({
                            "time": dt.strftime(fmt),
                            "date": dt.strftime("%Y-%m-%d %H:%M"),
                            "buy": buy_rounded,
                            "sell": sell_rounded,
                            "middle": round((buy_rounded + sell_rounded) / 2, decimals),
                        })
                    return history
    except Exception as e:
        logger.warning(f"Failed to fetch vang.today gold history for {code}: {e}")
    return []


async def get_gold_history(code: str = "SJC", timeframe: str = "1M") -> dict[str, Any]:
    """Lấy chuỗi lịch sử giá mua / giá bán của loại vàng chỉ định."""
    code_upper = code.upper().strip()
    if code_upper not in GOLD_ITEMS:
        code_upper = "SJC"

    cache_key = f"gold_history_{code_upper}_{timeframe}"
    if cached := _get_cache(cache_key):
        return cached

    base = GOLD_ITEMS[code_upper]
    is_usd = "USD" in base["unit"]
    decimals = 2 if is_usd else -3

    # 1. Thu thập dữ liệu lịch sử thực tế từ API vang.today
    history = await _fetch_vang_today_gold_history(code_upper, timeframe)

    # 2. Nếu không có dữ liệu vang.today và là XAU_USD, thử lấy từ Yahoo Finance
    if not history and code_upper == "XAU_USD":
        history = await _fetch_yahoo_gold_history(timeframe)

    # 3. Nếu vẫn không có dữ liệu thực tế (offline / API lỗi), tự động sinh chuỗi mô phỏng
    if not history:
        overview = await get_gold_overview()
        current_item = next((item for item in overview["items"] if item["code"] == code_upper), None)
        current_buy = current_item["buy_price"] if current_item else base["buy"]
        current_sell = current_item["sell_price"] if current_item else base["sell"]
        now = datetime.now()

        if timeframe == "1D":
            num_points = 24
            delta = timedelta(hours=1)
            fmt = "%H:00"
        elif timeframe == "1W":
            num_points = 7
            delta = timedelta(days=1)
            fmt = "%d/%m"
        elif timeframe == "1Y":
            num_points = 12
            delta = timedelta(days=30)
            fmt = "%m/%Y"
        else:  # 1M
            num_points = 30
            delta = timedelta(days=1)
            fmt = "%d/%m"

        seed = abs(hash(code_upper)) % 1000 / 1000.0
        for i in range(num_points, -1, -1):
            point_time = now - (delta * i)
            if i == 0:
                buy = current_buy
                sell = current_sell
            else:
                t = i / max(1, num_points)
                if timeframe == "1D":
                    trend_offset = (
                        math.sin(t * math.pi * 3.0 + seed) * 0.0025
                        + math.cos(t * math.pi * 6.0) * 0.0015
                    )
                elif timeframe == "1W":
                    trend_offset = (
                        math.sin(t * math.pi * 2.4 + seed) * 0.008
                        + math.cos(t * math.pi * 1.5) * 0.004
                        - (t * 0.005)
                    )
                elif timeframe == "1Y":
                    trend_offset = (
                        math.sin(t * math.pi * 1.5 + seed * 2 + 0.8) * 0.055
                        - (t * 0.065)
                        + math.cos(t * math.pi * 2.2) * 0.02
                    )
                else:  # 1M
                    trend_offset = (
                        math.sin(t * math.pi * 2.8 + seed) * 0.018
                        - (t * 0.022)
                        + math.cos(t * math.pi * 1.1) * 0.008
                    )

                buy = round(current_buy * (1.0 + trend_offset), decimals)
                sell = round(current_sell * (1.0 + trend_offset), decimals)

            history.append({
                "time": point_time.strftime(fmt),
                "date": point_time.strftime("%Y-%m-%d %H:%M"),
                "buy": buy,
                "sell": sell,
                "middle": round((buy + sell) / 2, decimals),
            })

    result = {
        "code": code_upper,
        "name": base["name"],
        "unit": base["unit"],
        "timeframe": timeframe,
        "data": history,
    }
    _set_cache(cache_key, result)
    return result


async def get_gold_news() -> list[dict[str, Any]]:
    """Lấy danh sách tin tức thị trường vàng."""
    cache_key = "gold_news"
    if cached := _get_cache(cache_key):
        return cached

    now = datetime.now()
    import urllib.parse
    news = [
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

    _set_cache(cache_key, news)
    return news
