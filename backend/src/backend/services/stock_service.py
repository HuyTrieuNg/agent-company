"""Stock Data Service using vnstock library."""
import asyncio
import logging
import time
from functools import lru_cache
from typing import Any
import sys
from unittest.mock import MagicMock

# --- Workaround: Prevent vnstock from crashing due to missing charting library in Py 3.14 ---
sys.modules['vnstock_ezchart'] = MagicMock()
sys.modules['vnstock_ezchart.mplot'] = MagicMock()
# -----------------------------------------------------------------------------------------

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


async def _execute_with_fallback(func, *args, **kwargs):
    """Thực thi hàm API vnstock, có fallback chế độ khách nếu dùng API Key bị lỗi."""
    import os
    try:
        return await asyncio.to_thread(func, *args, **kwargs)
    except Exception as e:
        if "VNSTOCK_API_KEY" in os.environ:
            logger.warning(f"[StockService] Lỗi với VNSTOCK_API_KEY, chuyển sang chế độ khách. Error: {e}")
            original_key = os.environ.pop("VNSTOCK_API_KEY")
            try:
                return await asyncio.to_thread(func, *args, **kwargs)
            finally:
                os.environ["VNSTOCK_API_KEY"] = original_key
        raise



async def get_stock_overview(symbol: str) -> dict:
    """Lấy thông tin tổng quan doanh nghiệp."""
    symbol = symbol.upper().strip()
    cache_key = f"overview_{symbol}"
    if cached := _get_cache(cache_key):
        return cached

    try:
        from vnstock.api.company import Company
        from vnstock.api.trading import Trading
        
        company = Company(source='VCI', symbol=symbol)
        trading = Trading(source='VCI', symbol=symbol)
        
        # Lấy thông tin công ty
        company_info = await _execute_with_fallback(company.overview)
        price_info = await _execute_with_fallback(trading.price_board, [symbol])
        
        overview = {
            "symbol": symbol,
            "company_name": "",
            "exchange": "",
            "industry": "",
            "market_cap": None,
            "pe_ratio": None,
            "pb_ratio": None,
            "ps_ratio": None,
            "eps": None,
            "beta": None,
            "current_price": None,
            "price_change": None,
            "price_change_pct": None,
            "week_52_high": None,
            "week_52_low": None,
            "volume": None,
            "avg_volume": None,
            "description": "",
        }
        
        if company_info is not None and not company_info.empty:
            row = company_info.iloc[0].to_dict() if hasattr(company_info, 'iloc') else {}
            overview.update({
                "company_name": str(row.get("organ_name") or row.get("company_name") or row.get("short_name") or ""),
                "exchange": str(row.get("com_group_code") or row.get("exchange") or ""),
                "industry": str(row.get("sector") or row.get("industry") or row.get("icb_name4") or ""),
                "market_cap": row.get("market_cap"),
                "pe_ratio": row.get("pe") or row.get("p_e"),
                "pb_ratio": row.get("pb") or row.get("p_b"),
                "eps": row.get("eps"),
                "beta": row.get("beta"),
            })
        
        if price_info is not None and not price_info.empty:
            row = price_info.iloc[0].to_dict() if hasattr(price_info, 'iloc') else {}
            # Flatten columns nếu là MultiIndex: tuple ('match', 'match_price') -> 'match_price'
            flat = {}
            for k, v in row.items():
                if isinstance(k, tuple):
                    flat[str(k[-1]).lower()] = v
                else:
                    flat[str(k).lower()] = v
                    
            overview.update({
                "current_price": flat.get("match_price") or flat.get("last_price") or flat.get("close"),
                "price_change": flat.get("price_change") or flat.get("change"),
                "price_change_pct": flat.get("pct_change") or flat.get("price_change_pct"),
                "volume": flat.get("accumulated_volume") or flat.get("total_volume") or flat.get("volume"),
                "week_52_high": flat.get("highest_price1_year") or flat.get("week_52_high"),
                "week_52_low": flat.get("lowest_price1_year") or flat.get("week_52_low"),
            })
        
        _set_cache(cache_key, overview)
        return overview
    except Exception as e:
        logger.exception(f"[StockService] Error fetching overview for {symbol}: {e}")
        return {"symbol": symbol, "error": str(e)}


async def get_stock_trading_history(
    symbol: str,
    start_date: str = "2024-01-01",
    end_date: str | None = None,
    interval: str = "1D"
) -> list[dict]:
    """Lấy lịch sử giá giao dịch."""
    import datetime
    symbol = symbol.upper().strip()
    if not end_date:
        end_date = datetime.date.today().strftime("%Y-%m-%d")
    
    cache_key = f"trading_{symbol}_{start_date}_{end_date}_{interval}"
    if cached := _get_cache(cache_key):
        return cached

    try:
        from vnstock.api.quote import Quote
        quote = Quote(source='VCI', symbol=symbol)
        df = await _execute_with_fallback(
            quote.history,
            start=start_date,
            end=end_date,
            interval=interval
        )
        
        if df is None or df.empty:
            return []
        
        result = []
        for _, row in df.iterrows():
            record = {}
            for col in df.columns:
                val = row[col]
                # Convert to Python native types
                if hasattr(val, 'item'):
                    try:
                        val = val.item()
                    except ValueError:
                        val = val.iloc[-1] if hasattr(val, 'iloc') else val[-1]
                        if hasattr(val, 'item'):
                            val = val.item()
                elif hasattr(val, 'isoformat'):
                    val = str(val)
                record[str(col).lower()] = val
            result.append(record)
        
        _set_cache(cache_key, result)
        return result
    except Exception as e:
        logger.exception(f"[StockService] Error fetching trading history for {symbol}: {e}")
        return []


async def get_financial_report(
    symbol: str,
    report_type: str = "income_statement",
    period: str = "quarter"
) -> list[dict]:
    """Lấy báo cáo tài chính.
    report_type: 'income_statement' | 'balance_sheet' | 'cash_flow' | 'ratios'
    period: 'quarter' | 'annual'
    """
    symbol = symbol.upper().strip()
    cache_key = f"financial_{symbol}_{report_type}_{period}"
    if cached := _get_cache(cache_key):
        return cached

    try:
        from vnstock.api.financial import Finance
        finance = Finance(source='VCI', symbol=symbol)
        
        report_map = {
            'income_statement': finance.income_statement,
            'balance_sheet': finance.balance_sheet,
            'cash_flow': finance.cash_flow,
            'ratios': finance.ratio,
        }
        
        fetch_fn = report_map.get(report_type, finance.income_statement)
        df = await _execute_with_fallback(fetch_fn, period=period, lang='vi')
        
        if df is None or df.empty:
            return []
        
        result = []
        for _, row in df.iterrows():
            record = {}
            for col in df.columns:
                val = row[col]
                if hasattr(val, 'item'):
                    try:
                        val = val.item()
                    except ValueError:
                        val = val.iloc[-1] if hasattr(val, 'iloc') else val[-1]
                        if hasattr(val, 'item'):
                            val = val.item()
                elif hasattr(val, 'isoformat'):
                    val = str(val)
                record[str(col)] = val
            result.append(record)
        
        _set_cache(cache_key, result)
        return result
    except Exception as e:
        logger.exception(f"[StockService] Error fetching financial report for {symbol}: {e}")
        return []


async def get_stock_news(symbol: str, limit: int = 10) -> list[dict]:
    """Lấy tin tức doanh nghiệp."""
    symbol = symbol.upper().strip()
    cache_key = f"news_{symbol}_{limit}"
    if cached := _get_cache(cache_key):
        return cached

    try:
        from vnstock.api.company import Company
        # Trở lại dùng VCI vì KBS chỉ trả về 1 bài
        company = Company(source='VCI', symbol=symbol)
        df = await _execute_with_fallback(company.news)
        
        if df is None or df.empty:
            return []
        
        result = []
        for _, row in df.head(limit).iterrows():
            record = {}
            for col in df.columns:
                val = row[col]
                if hasattr(val, 'item'):
                    try:
                        val = val.item()
                    except ValueError:
                        val = val.iloc[-1] if hasattr(val, 'iloc') else val[-1]
                        if hasattr(val, 'item'):
                            val = val.item()
                elif hasattr(val, 'isoformat'):
                    val = str(val)
                record[str(col).lower()] = val
                
            # Chuẩn hoá dữ liệu
            if 'title' not in record and 'news_title' in record:
                record['title'] = record['news_title']
            
            # Gán URL bài viết
            if 'news_source_link' in record and record['news_source_link']:
                record['url'] = record['news_source_link']
            elif 'news_url' in record and record['news_url']:
                record['url'] = record['news_url']
            else:
                # Nếu API VCI không trả về link, tạo link tìm kiếm Google với tiêu đề bài viết
                import urllib.parse
                title_text = record.get('title', '')
                if title_text:
                    record['url'] = f"https://www.google.com/search?q={urllib.parse.quote(title_text)}"
            
            # Chuẩn hoá thêm summary và date cho khớp với frontend
            if 'head' in record and 'summary' not in record:
                record['summary'] = record['head']
            if 'publish_time' in record and 'published_date' not in record:
                record['published_date'] = record['publish_time']
            elif 'public_date' in record and 'published_date' not in record:
                record['published_date'] = record['public_date']
                
            result.append(record)
        
        _set_cache(cache_key, result)
        return result
    except Exception as e:
        logger.exception(f"[StockService] Error fetching news for {symbol}: {e}")
        return []


async def get_stock_technicals(symbol: str, timeframe: str = "1Y") -> dict:
    """Tính các chỉ số kỹ thuật: MA, RSI, MACD, Bollinger Bands."""
    import datetime
    symbol = symbol.upper().strip()
    cache_key = f"technicals_{symbol}_{timeframe}"
    if cached := _get_cache(cache_key):
        return cached

    # Xác định start_date theo timeframe
    today = datetime.date.today()
    timeframe_days = {
        '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
    }
    days = timeframe_days.get(timeframe, 365)
    start_date = (today - datetime.timedelta(days=days)).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")

    try:
        history = await get_stock_trading_history(symbol, start_date=start_date, end_date=end_date)
        if not history:
            return {"symbol": symbol, "error": "No data available"}
        
        closes = [h.get("close") for h in history if h.get("close") is not None]
        volumes = [h.get("volume") for h in history if h.get("volume") is not None]
        times = [h.get("time") or h.get("date") for h in history]
        
        if not closes:
            return {"symbol": symbol, "error": "No close price data"}
        
        # Calculate SMA
        def sma(data, period):
            if len(data) < period:
                return None
            return sum(data[-period:]) / period
        
        # Calculate RSI
        def rsi(data, period=14):
            if len(data) < period + 1:
                return None
            gains, losses = [], []
            for i in range(1, len(data)):
                diff = data[i] - data[i-1]
                gains.append(max(diff, 0))
                losses.append(max(-diff, 0))
            avg_gain = sum(gains[-period:]) / period
            avg_loss = sum(losses[-period:]) / period
            if avg_loss == 0:
                return 100
            rs = avg_gain / avg_loss
            return round(100 - (100 / (1 + rs)), 2)
        
        # Calculate MACD
        def ema(data, period):
            if len(data) < period:
                return []
            k = 2 / (period + 1)
            ema_vals = [sum(data[:period]) / period]
            for price in data[period:]:
                ema_vals.append(price * k + ema_vals[-1] * (1 - k))
            return ema_vals
        
        ema12 = ema(closes, 12)
        ema26 = ema(closes, 26)
        macd_line = None
        signal_line = None
        if ema12 and ema26:
            min_len = min(len(ema12), len(ema26))
            macd_values = [ema12[-(min_len-i)] - ema26[-(min_len-i)] for i in range(min_len)]
            if macd_values:
                macd_line = round(macd_values[-1], 4)
                signal_ema = ema(macd_values, 9)
                signal_line = round(signal_ema[-1], 4) if signal_ema else None
        
        # Bollinger Bands
        def bollinger(data, period=20, std_dev=2):
            if len(data) < period:
                return None, None, None
            import math
            window = data[-period:]
            mean = sum(window) / period
            variance = sum((x - mean) ** 2 for x in window) / period
            std = math.sqrt(variance)
            return round(mean + std_dev * std, 2), round(mean, 2), round(mean - std_dev * std, 2)
        
        bb_upper, bb_middle, bb_lower = bollinger(closes)
        
        result = {
            "symbol": symbol,
            "timeframe": timeframe,
            "last_price": closes[-1] if closes else None,
            "data_points": len(closes),
            "indicators": {
                "sma_20": round(sma(closes, 20), 2) if sma(closes, 20) else None,
                "sma_50": round(sma(closes, 50), 2) if sma(closes, 50) else None,
                "sma_200": round(sma(closes, 200), 2) if sma(closes, 200) else None,
                "rsi_14": rsi(closes, 14),
                "macd": macd_line,
                "macd_signal": signal_line,
                "macd_histogram": round(macd_line - signal_line, 4) if macd_line and signal_line else None,
                "bb_upper": bb_upper,
                "bb_middle": bb_middle,
                "bb_lower": bb_lower,
            },
            "price_history": [
                {"time": t, "close": c}
                for t, c in zip(times[-60:], closes[-60:])
            ]
        }
        
        _set_cache(cache_key, result)
        return result
    except Exception as e:
        logger.exception(f"[StockService] Error calculating technicals for {symbol}: {e}")
        return {"symbol": symbol, "error": str(e)}
