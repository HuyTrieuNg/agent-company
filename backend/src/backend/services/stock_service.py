"""Stock Data Service using vnstock library with DI and TTLCache."""

import asyncio
import datetime
import logging
import math
import sys
import urllib.parse
from collections.abc import Callable
from typing import Any, cast
from unittest.mock import MagicMock

# --- Workaround: Prevent vnstock from crashing due to missing charting library ---
sys.modules.setdefault("vnstock_ezchart", MagicMock())
sys.modules.setdefault("vnstock_ezchart.mplot", MagicMock())
# ---------------------------------------------------------------------------------

from ..db.cache import TTLCache, ttl_cache
from ..schemas.market import (
    StockIndicators,
    StockOverview,
    StockPricePoint,
    StockSearchResultItem,
    StockTechnicalsResponse,
)

logger = logging.getLogger(__name__)


async def _execute_with_fallback(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Thực thi hàm API vnstock, có fallback chế độ khách nếu dùng API Key bị lỗi."""
    import os

    try:
        return await asyncio.to_thread(func, *args, **kwargs)
    except Exception as e:
        if "VNSTOCK_API_KEY" in os.environ:
            logger.warning(
                f"[StockService] Lỗi với VNSTOCK_API_KEY, chuyển sang chế độ khách. Error: {e}"
            )
            original_key = os.environ.pop("VNSTOCK_API_KEY")
            try:
                return await asyncio.to_thread(func, *args, **kwargs)
            finally:
                os.environ["VNSTOCK_API_KEY"] = original_key
        raise


class StockService:
    """Class-based service for interacting with vnstock data and financial metrics."""

    def __init__(self, cache: TTLCache[object] | None = None) -> None:
        self.cache = cache or ttl_cache

    async def get_stock_overview(self, symbol: str) -> StockOverview:
        """Lấy thông tin tổng quan doanh nghiệp."""
        symbol = symbol.upper().strip()
        cache_key = f"overview_{symbol}"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, dict):
            return cached  # type: ignore[return-value]

        try:
            from vnstock.api.company import Company
            from vnstock.api.financial import Finance
            from vnstock.api.trading import Trading

            company = Company(source="VCI", symbol=symbol)
            trading = Trading(source="VCI", symbol=symbol)
            finance_kbs = Finance(source="KBS", symbol=symbol)

            # Lấy thông tin công ty
            company_info = await _execute_with_fallback(company.overview)
            price_info = await _execute_with_fallback(trading.price_board, [symbol])

            overview: StockOverview = {
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
                row: dict[str, Any] = cast(
                    dict[str, Any],
                    company_info.iloc[0].to_dict() if hasattr(company_info, "iloc") else {},
                )
                overview.update(
                    {
                        "company_name": str(
                            row.get("organ_name")
                            or row.get("company_name")
                            or row.get("short_name")
                            or ""
                        ),
                        "exchange": str(row.get("com_group_code") or row.get("exchange") or ""),
                        "industry": str(
                            row.get("sector") or row.get("industry") or row.get("icb_name4") or ""
                        ),
                        "market_cap": row.get("market_cap"),
                        "pe_ratio": row.get("pe") or row.get("p_e"),
                        "pb_ratio": row.get("pb") or row.get("p_b"),
                        "ps_ratio": row.get("ps") or row.get("p_s"),
                        "eps": row.get("eps"),
                        "beta": row.get("beta"),
                        "avg_volume": row.get("average_match_volume1_month")
                        or row.get("avg_volume"),
                        "week_52_high": row.get("highest_price1_year") or row.get("week_52_high"),
                        "week_52_low": row.get("lowest_price1_year") or row.get("week_52_low"),
                        "description": str(
                            row.get("company_profile") or row.get("description") or ""
                        ),
                    }
                )

            if price_info is not None and not price_info.empty:
                raw_row2: dict[Any, Any] = cast(
                    dict[Any, Any],
                    price_info.iloc[0].to_dict() if hasattr(price_info, "iloc") else {},
                )
                flat: dict[str, Any] = {}
                for k, v in raw_row2.items():
                    if isinstance(k, tuple):
                        k_tuple = cast(tuple[Any, ...], k)
                        flat[str(k_tuple[-1]).lower()] = v
                    else:
                        flat[str(k).lower()] = v

                current_price = (
                    flat.get("match_price")
                    or flat.get("last_price")
                    or flat.get("close")
                    or overview.get("current_price")
                )
                ref_price = flat.get("ref_price") or flat.get("reference_price")
                price_change = flat.get("price_change") or flat.get("change")
                price_change_pct = flat.get("pct_change") or flat.get("price_change_pct")

                if price_change is None and current_price is not None and ref_price is not None:
                    try:
                        price_change = float(current_price) - float(ref_price)
                    except (ValueError, TypeError):
                        pass

                if price_change_pct is None and current_price is not None and ref_price:
                    try:
                        price_change_pct = round(
                            ((float(current_price) - float(ref_price)) / float(ref_price)) * 100, 2
                        )
                    except (ValueError, TypeError, ZeroDivisionError):
                        pass

                overview.update(
                    {
                        "current_price": current_price,
                        "price_change": price_change,
                        "price_change_pct": price_change_pct,
                        "volume": flat.get("accumulated_volume")
                        or flat.get("total_volume")
                        or flat.get("volume")
                        or overview.get("volume"),
                        "week_52_high": overview.get("week_52_high")
                        or flat.get("highest_price1_year")
                        or flat.get("week_52_high"),
                        "week_52_low": overview.get("week_52_low")
                        or flat.get("lowest_price1_year")
                        or flat.get("week_52_low"),
                    }
                )

            # Bổ sung chỉ số tài chính từ KBS nếu VCI còn thiếu
            missing_ratios = any(
                overview.get(f) is None for f in ("pe_ratio", "pb_ratio", "ps_ratio", "eps", "beta")
            )
            if missing_ratios:
                try:
                    fr = await _execute_with_fallback(finance_kbs.ratio, period="quarter")
                    if fr is not None and not fr.empty and "item_id" in fr.columns:
                        val_cols = [
                            c for c in fr.columns if c not in ("item", "item_id", "item_en")
                        ]
                        latest_col = val_cols[0] if val_cols else None
                        if latest_col:
                            ratio_dict = dict(zip(fr["item_id"], fr[latest_col], strict=False))
                            if overview.get("pe_ratio") is None:
                                overview["pe_ratio"] = ratio_dict.get("p_e")
                            if overview.get("pb_ratio") is None:
                                overview["pb_ratio"] = ratio_dict.get("p_b")
                            if overview.get("ps_ratio") is None:
                                overview["ps_ratio"] = ratio_dict.get("p_s")
                            if overview.get("eps") is None:
                                overview["eps"] = ratio_dict.get("trailing_eps")
                            if overview.get("beta") is None:
                                overview["beta"] = ratio_dict.get("beta")
                except Exception as ratio_err:
                    logger.debug(
                        f"[StockService] Không thể lấy chỉ số định giá KBS cho {symbol}: {ratio_err}"
                    )

            self.cache.set(cache_key, overview)
            return overview
        except Exception as e:
            logger.exception(f"[StockService] Error fetching overview for {symbol}: {e}")
            return {"symbol": symbol, "error": str(e)}

    async def get_stock_trading_history(
        self,
        symbol: str,
        start_date: str = "2024-01-01",
        end_date: str | None = None,
        interval: str = "1D",
    ) -> list[dict[str, object]]:
        """Lấy lịch sử giá giao dịch."""
        symbol = symbol.upper().strip()
        if not end_date:
            end_date = datetime.date.today().strftime("%Y-%m-%d")

        cache_key = f"trading_{symbol}_{start_date}_{end_date}_{interval}"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, list):
            return cached  # type: ignore[return-value]

        try:
            from vnstock.api.quote import Quote

            quote = Quote(source="VCI", symbol=symbol)
            df = await _execute_with_fallback(
                quote.history,
                start=start_date,
                end=end_date,
                interval=interval,
            )

            if df is None or df.empty:
                return []

            result: list[dict[str, object]] = []
            for _, row in df.iterrows():
                record: dict[str, object] = {}
                for col in df.columns:
                    val = row[col]
                    if hasattr(val, "item"):
                        try:
                            val = val.item()
                        except ValueError:
                            val = val.iloc[-1] if hasattr(val, "iloc") else val[-1]
                            if hasattr(val, "item"):
                                val = val.item()
                    elif hasattr(val, "isoformat"):
                        val = str(val)
                    record[str(col).lower()] = val
                result.append(record)

            self.cache.set(cache_key, result)
            return result
        except Exception as e:
            logger.exception(f"[StockService] Error fetching trading history for {symbol}: {e}")
            return []

    async def get_financial_report(
        self,
        symbol: str,
        report_type: str = "income_statement",
        period: str = "quarter",
    ) -> list[dict[str, object]]:
        """Lấy báo cáo tài chính."""
        symbol = symbol.upper().strip()
        cache_key = f"financial_{symbol}_{report_type}_{period}"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, list):
            return cached  # type: ignore[return-value]

        try:
            from vnstock.api.financial import Finance

            finance = Finance(source="VCI", symbol=symbol)

            report_map = {
                "income_statement": finance.income_statement,
                "balance_sheet": finance.balance_sheet,
                "cash_flow": finance.cash_flow,
                "ratios": finance.ratio,
            }

            fetch_fn = report_map.get(report_type, finance.income_statement)
            df = await _execute_with_fallback(fetch_fn, period=period, lang="vi")

            if df is None or df.empty:
                return []

            result: list[dict[str, object]] = []
            for _, row in df.iterrows():
                record: dict[str, object] = {}
                for col in df.columns:
                    val = row[col]
                    if hasattr(val, "item"):
                        try:
                            val = val.item()
                        except ValueError:
                            val = val.iloc[-1] if hasattr(val, "iloc") else val[-1]
                            if hasattr(val, "item"):
                                val = val.item()
                    elif hasattr(val, "isoformat"):
                        val = str(val)
                    record[str(col)] = val
                result.append(record)

            self.cache.set(cache_key, result)
            return result
        except Exception as e:
            logger.exception(f"[StockService] Error fetching financial report for {symbol}: {e}")
            return []

    async def get_stock_news(self, symbol: str, limit: int = 10) -> list[dict[str, object]]:
        """Lấy tin tức doanh nghiệp."""
        symbol = symbol.upper().strip()
        cache_key = f"news_{symbol}_{limit}"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, list):
            return cached  # type: ignore[return-value]

        try:
            from vnstock.api.company import Company

            company = Company(source="VCI", symbol=symbol)
            df = await _execute_with_fallback(company.news)

            if df is None or df.empty:
                return []

            result: list[dict[str, object]] = []
            for _, row in df.head(limit).iterrows():
                record: dict[str, Any] = {}
                for col in df.columns:
                    val = row[col]
                    if hasattr(val, "item"):
                        try:
                            val = val.item()
                        except ValueError:
                            val = val.iloc[-1] if hasattr(val, "iloc") else val[-1]
                            if hasattr(val, "item"):
                                val = val.item()
                    elif hasattr(val, "isoformat"):
                        val = str(val)
                    record[str(col).lower()] = val

                if "title" not in record and "news_title" in record:
                    record["title"] = record["news_title"]

                if "news_source_link" in record and record["news_source_link"]:
                    record["url"] = record["news_source_link"]
                elif "news_url" in record and record["news_url"]:
                    record["url"] = record["news_url"]
                else:
                    title_text = str(record.get("title", ""))
                    if title_text:
                        record["url"] = (
                            f"https://www.google.com/search?q={urllib.parse.quote(title_text)}"
                        )

                if "head" in record and "summary" not in record:
                    record["summary"] = record["head"]
                if "publish_time" in record and "published_date" not in record:
                    record["published_date"] = record["publish_time"]
                elif "public_date" in record and "published_date" not in record:
                    record["published_date"] = record["public_date"]

                result.append(record)

            self.cache.set(cache_key, result)
            return result
        except Exception as e:
            logger.exception(f"[StockService] Error fetching news for {symbol}: {e}")
            return []

    async def get_stock_technicals(
        self, symbol: str, timeframe: str = "1Y"
    ) -> StockTechnicalsResponse:
        """Tính các chỉ số kỹ thuật: MA, RSI, MACD, Bollinger Bands."""
        symbol = symbol.upper().strip()
        cache_key = f"technicals_{symbol}_{timeframe}"
        cached = self.cache.get(cache_key)
        if cached and isinstance(cached, dict):
            return cached  # type: ignore[return-value]

        today = datetime.date.today()
        timeframe_days = {"1M": 30, "3M": 90, "6M": 180, "1Y": 365, "2Y": 730}
        days = timeframe_days.get(timeframe, 365)
        start_date = (today - datetime.timedelta(days=days)).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")

        try:
            history = await get_stock_trading_history(
                symbol, start_date=start_date, end_date=end_date
            )
            if not history:
                return {"symbol": symbol, "error": "No data available"}

            closes: list[float] = []
            for h in history:
                c = h.get("close")
                if c is not None and isinstance(c, (int, float, str)):
                    try:
                        closes.append(float(c))
                    except (ValueError, TypeError):
                        pass
            times = [str(h.get("time") or h.get("date") or "") for h in history]

            if not closes:
                return {"symbol": symbol, "error": "No close price data"}

            def sma(data: list[float], period: int) -> float | None:
                if len(data) < period:
                    return None
                return sum(data[-period:]) / period

            def rsi(data: list[float], period: int = 14) -> float | None:
                if len(data) < period + 1:
                    return None
                gains: list[float] = []
                losses: list[float] = []
                for i in range(1, len(data)):
                    diff = data[i] - data[i - 1]
                    gains.append(max(diff, 0))
                    losses.append(max(-diff, 0))
                avg_gain = sum(gains[-period:]) / period
                avg_loss = sum(losses[-period:]) / period
                if avg_loss == 0:
                    return 100.0
                rs = avg_gain / avg_loss
                return round(100.0 - (100.0 / (1.0 + rs)), 2)

            def ema(data: list[float], period: int) -> list[float]:
                if len(data) < period:
                    return []
                k = 2.0 / (period + 1)
                ema_vals = [sum(data[:period]) / period]
                for price in data[period:]:
                    ema_vals.append(price * k + ema_vals[-1] * (1.0 - k))
                return ema_vals

            ema12 = ema(closes, 12)
            ema26 = ema(closes, 26)
            macd_line: float | None = None
            signal_line: float | None = None
            if ema12 and ema26:
                min_len = min(len(ema12), len(ema26))
                macd_values = [
                    ema12[-(min_len - i)] - ema26[-(min_len - i)] for i in range(min_len)
                ]
                if macd_values:
                    macd_line = round(macd_values[-1], 4)
                    signal_ema = ema(macd_values, 9)
                    signal_line = round(signal_ema[-1], 4) if signal_ema else None

            def bollinger(
                data: list[float], period: int = 20, std_dev: float = 2.0
            ) -> tuple[float | None, float | None, float | None]:
                if len(data) < period:
                    return None, None, None
                window = data[-period:]
                mean = sum(window) / period
                variance = sum((x - mean) ** 2 for x in window) / period
                std = math.sqrt(variance)
                return (
                    round(mean + std_dev * std, 2),
                    round(mean, 2),
                    round(mean - std_dev * std, 2),
                )

            bb_upper, bb_middle, bb_lower = bollinger(closes)

            sma20_val = sma(closes, 20)
            sma50_val = sma(closes, 50)
            sma200_val = sma(closes, 200)

            indicators: StockIndicators = {
                "sma_20": round(sma20_val, 2) if sma20_val is not None else None,
                "sma_50": round(sma50_val, 2) if sma50_val is not None else None,
                "sma_200": round(sma200_val, 2) if sma200_val is not None else None,
                "rsi_14": rsi(closes, 14),
                "macd": macd_line,
                "macd_signal": signal_line,
                "macd_histogram": round(macd_line - signal_line, 4)
                if macd_line and signal_line
                else None,
                "bb_upper": bb_upper,
                "bb_middle": bb_middle,
                "bb_lower": bb_lower,
            }

            price_history: list[StockPricePoint] = [
                {"time": t, "close": c} for t, c in zip(times[-60:], closes[-60:], strict=False)
            ]

            result: StockTechnicalsResponse = {
                "symbol": symbol,
                "timeframe": timeframe,
                "last_price": closes[-1] if closes else None,
                "data_points": len(closes),
                "indicators": indicators,
                "price_history": price_history,
            }

            self.cache.set(cache_key, result)
            return result
        except Exception as e:
            logger.exception(f"[StockService] Error calculating technicals for {symbol}: {e}")
            return {"symbol": symbol, "error": str(e)}

    async def search_stocks(self, q: str) -> list[StockSearchResultItem]:
        """Tìm kiếm mã chứng khoán."""
        from vnstock.api.listing import Listing

        cache_key = "listing_all_symbols"
        listing_obj = self.cache.get(cache_key)
        if listing_obj is None:
            try:
                listing_obj = await _execute_with_fallback(Listing(source="KBS").all_symbols)
                if (
                    listing_obj is not None
                    and hasattr(listing_obj, "empty")
                    and not listing_obj.empty
                ):
                    self.cache.set(cache_key, listing_obj)
            except Exception as e:
                logger.warning(f"[StockService] Lỗi tải danh sách mã chứng khoán: {e}")
                return []

        listing_df: Any = listing_obj
        if listing_df is None or not hasattr(listing_df, "empty") or listing_df.empty:
            return []

        q_upper = q.upper().strip()
        ticker_col = "ticker" if "ticker" in listing_df.columns else "symbol"
        name_col = (
            "organ_name"
            if "organ_name" in listing_df.columns
            else "company_name"
            if "company_name" in listing_df.columns
            else "short_name"
        )

        mask = listing_df[ticker_col].str.contains(q_upper, case=False, na=False) | listing_df[
            name_col
        ].str.contains(q.strip(), case=False, na=False)

        results = listing_df[mask].head(10).to_dict("records")
        mapped_results: list[StockSearchResultItem] = []
        for r in results:
            sym = str(r.get(ticker_col, ""))
            name = str(r.get(name_col, ""))
            mapped_results.append(
                {
                    "symbol": sym,
                    "company_name": name,
                    "ticker": sym,
                    "organ_name": name,
                }
            )
        return mapped_results


# Global default service instance
_default_stock_service = StockService()
_cache = _default_stock_service.cache


def _get_cache(key: str) -> Any | None:
    return _default_stock_service.cache.get(key)


def _set_cache(key: str, value: Any) -> None:
    _default_stock_service.cache.set(key, value)


async def get_stock_overview(symbol: str) -> StockOverview:
    return await _default_stock_service.get_stock_overview(symbol)


async def get_stock_trading_history(
    symbol: str,
    start_date: str = "2024-01-01",
    end_date: str | None = None,
    interval: str = "1D",
) -> list[dict[str, object]]:
    return await _default_stock_service.get_stock_trading_history(
        symbol, start_date, end_date, interval
    )


async def get_financial_report(
    symbol: str,
    report_type: str = "income_statement",
    period: str = "quarter",
) -> list[dict[str, object]]:
    return await _default_stock_service.get_financial_report(symbol, report_type, period)


async def get_stock_news(symbol: str, limit: int = 10) -> list[dict[str, object]]:
    return await _default_stock_service.get_stock_news(symbol, limit)


async def get_stock_technicals(symbol: str, timeframe: str = "1Y") -> StockTechnicalsResponse:
    return await _default_stock_service.get_stock_technicals(symbol, timeframe)
