"""Gold price data service."""
import asyncio
import logging
import math
import random
import time
from datetime import datetime, timedelta
from typing import Any

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


async def get_gold_overview() -> dict[str, Any]:
    """Lấy danh sách bảng giá vàng tổng quan mới nhất."""
    cache_key = "gold_overview"
    if cached := _get_cache(cache_key):
        return cached

    items = []
    updated_at = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    for key, base in GOLD_ITEMS.items():
        # Thêm biến động nhỏ ngẫu nhiên theo phiên
        variation = (random.random() - 0.48) * 0.005
        buy_price = round(base["buy"] * (1 + variation), 2 if "USD" in base["unit"] else -3)
        sell_price = round(base["sell"] * (1 + variation), 2 if "USD" in base["unit"] else -3)
        change_amount = round((sell_price - base["sell"]), 2 if "USD" in base["unit"] else -3)
        change_percent = round((change_amount / base["sell"]) * 100, 2)
        spread = round(sell_price - buy_price, 2 if "USD" in base["unit"] else -3)

        items.append({
            "code": key,
            "name": base["name"],
            "unit": base["unit"],
            "buy_price": buy_price,
            "sell_price": sell_price,
            "change_amount": change_amount,
            "change_percent": change_percent,
            "spread": spread,
            "high_24h": round(sell_price * 1.008, 2 if "USD" in base["unit"] else -3),
            "low_24h": round(buy_price * 0.992, 2 if "USD" in base["unit"] else -3),
        })

    result = {
        "updated_at": updated_at,
        "items": items,
    }
    _set_cache(cache_key, result)
    return result


async def get_gold_history(code: str = "SJC", timeframe: str = "1M") -> dict[str, Any]:
    """Lấy chuỗi lịch sử giá mua / giá bán của loại vàng chỉ định."""
    code_upper = code.upper().strip()
    if code_upper not in GOLD_ITEMS:
        code_upper = "SJC"

    cache_key = f"gold_history_{code_upper}_{timeframe}"
    if cached := _get_cache(cache_key):
        return cached

    # Lấy giá hiện tại từ bảng tổng quan để đảm bảo khớp 100% với điểm cuối cùng của biểu đồ
    overview = await get_gold_overview()
    current_item = next((item for item in overview["items"] if item["code"] == code_upper), None)

    base = GOLD_ITEMS[code_upper]
    is_usd = "USD" in base["unit"]
    now = datetime.now()

    current_buy = current_item["buy_price"] if current_item else base["buy"]
    current_sell = current_item["sell_price"] if current_item else base["sell"]

    # Determine num points & delta
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

    history = []

    # Điểm cuối cùng (i=0) phải trùng khớp 100% với giá hiện tại
    for i in range(num_points, -1, -1):
        point_time = now - (delta * i)
        if i == 0:
            buy = current_buy
            sell = current_sell
        else:
            t = i / max(1, num_points)
            # Biến động quá khứ tính lùi từ giá hiện tại
            trend_offset = math.sin(t * math.pi * 2.2) * 0.015 - (t * 0.02) + math.cos(t * math.pi * 0.8) * 0.008
            buy = round(current_buy * (1.0 + trend_offset), 2 if is_usd else -3)
            sell = round(current_sell * (1.0 + trend_offset), 2 if is_usd else -3)

        history.append({
            "time": point_time.strftime(fmt),
            "date": point_time.strftime("%Y-%m-%d %H:%M"),
            "buy": buy,
            "sell": sell,
            "middle": round((buy + sell) / 2, 2 if is_usd else -3),
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
