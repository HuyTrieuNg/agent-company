"""Unit tests for backend.services.stock_service.

Strategy:
- vnstock is lazy-imported inside each service function using `from vnstock import Vnstock`.
  On Python 3.14, the real vnstock fails to import due to a bs4 TypeAlias compatibility issue.
  We mock the entire 'vnstock' entry in sys.modules BEFORE importing the service so that
  any `from vnstock import Vnstock` gets our mock instead of the real library.
- asyncio.to_thread is patched at the service-module level so async calls return our test data.
- Tests verify: data transformation, TTL cache, graceful error handling,
  and pure-Python technical indicator math (SMA/RSI/MACD/Bollinger).
"""

import sys
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
import pytest

# ── Block real vnstock import (Python 3.14 / bs4 incompatibility) ────────────
_mock_vnstock_module = MagicMock()
_mock_vnstock_module.__path__ = []
sys.modules["vnstock"] = _mock_vnstock_module

_mock_vnstock_api = MagicMock()
_mock_vnstock_api.__path__ = []
sys.modules["vnstock.api"] = _mock_vnstock_api

sys.modules["vnstock.api.company"] = MagicMock()
sys.modules["vnstock.api.quote"] = MagicMock()
sys.modules["vnstock.api.financial"] = MagicMock()
sys.modules["vnstock.api.trading"] = MagicMock()
sys.modules["vnstock.api.listing"] = MagicMock()
sys.modules["bs4"] = MagicMock()
# ─────────────────────────────────────────────────────────────────────────────

import backend.services.stock_service as ss

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _make_price_df(n: int = 60):
    """Return a minimal OHLCV DataFrame for n periods."""
    import datetime

    dates = [(datetime.date(2024, 1, 1) + datetime.timedelta(days=i)).isoformat() for i in range(n)]
    closes = [float(50_000 + i * 100) for i in range(n)]
    return pd.DataFrame(
        {
            "time": dates,
            "open": closes,
            "high": [c + 500 for c in closes],
            "low": [c - 500 for c in closes],
            "close": closes,
            "volume": [1_000_000] * n,
        }
    )


def _make_company_df():
    return pd.DataFrame(
        [
            {
                "company_name": "Vietnam Dairy Products JSC",
                "short_name": "Vinamilk",
                "exchange": "HOSE",
                "icb_name4": "Hàng tiêu dùng",
                "market_cap": 1_500_000_000_000,
                "pe": 15.2,
                "pb": 3.5,
                "eps": 5000.0,
                "beta": 0.85,
            }
        ]
    )


def _make_price_board_df():
    return pd.DataFrame(
        [
            {
                "match_price": 72000,
                "price_change": 500,
                "pct_change": 0.7,
                "total_volume": 2_500_000,
            }
        ]
    )


# ──────────────────────────────────────────────────────────────────────────────
# Cache helpers
# ──────────────────────────────────────────────────────────────────────────────


def test_cache_set_and_get_returns_value():
    """_set_cache / _get_cache round-trip works correctly."""
    ss._cache.clear()
    ss._set_cache("test_key", {"data": 42})
    result = ss._get_cache("test_key")
    assert result == {"data": 42}


def test_cache_miss_returns_none():
    """_get_cache returns None for unknown key."""
    ss._cache.clear()
    assert ss._get_cache("missing_key") is None


def test_cache_expires_after_ttl():
    """Expired cache entries are evicted and None is returned."""
    ss._cache.clear()
    # Manually plant an already-expired entry
    ss._cache["expired_key"] = ({"value": 99}, time.time() - 1)
    assert ss._get_cache("expired_key") is None
    assert "expired_key" not in ss._cache


def test_cache_not_expired_before_ttl():
    """Cache entry within TTL is still returned."""
    ss._cache.clear()
    ss._cache["fresh_key"] = ({"value": 7}, time.time() + 100)
    assert ss._get_cache("fresh_key") == {"value": 7}


# ──────────────────────────────────────────────────────────────────────────────
# get_stock_overview
# ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_overview_success(mock_to_thread):
    """Returns a correctly structured overview dict when vnstock succeeds."""
    ss._cache.clear()

    company_df = _make_company_df()
    price_df = _make_price_board_df()

    # to_thread calls: first → company.overview, second → trading.price_board
    mock_to_thread.side_effect = [company_df, price_df]

    result = await ss.get_stock_overview("vnm")

    assert result["symbol"] == "VNM"
    assert result["company_name"] == "Vietnam Dairy Products JSC"
    assert result["exchange"] == "HOSE"
    assert result["pe_ratio"] == 15.2
    assert result["pb_ratio"] == 3.5
    assert result["current_price"] == 72000
    assert "error" not in result


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_overview_vnstock_error_returns_error_dict(mock_to_thread):
    """When vnstock raises, overview returns {'symbol': ..., 'error': ...}."""
    ss._cache.clear()
    mock_to_thread.side_effect = RuntimeError("Connection refused")

    result = await ss.get_stock_overview("BAD")
    assert result["symbol"] == "BAD"
    assert "error" in result
    assert isinstance(result["error"], str)


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_overview_uses_cache_on_second_call(mock_to_thread):
    """Second call for the same symbol must use in-memory cache (no vnstock call)."""
    ss._cache.clear()

    company_df = _make_company_df()
    price_df = _make_price_board_df()
    mock_to_thread.side_effect = [company_df, price_df]

    await ss.get_stock_overview("VNM")
    assert mock_to_thread.call_count == 2  # should be 2 (company + price)

    # Second call should hit cache — to_thread count must NOT increase
    result = await ss.get_stock_overview("VNM")
    assert result["symbol"] == "VNM"
    assert mock_to_thread.call_count == 2  # only the first call's 2 to_thread invocations


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_overview_symbol_normalized_to_uppercase(mock_to_thread):
    """Symbol is uppercased regardless of input casing."""
    ss._cache.clear()
    mock_to_thread.side_effect = [_make_company_df(), _make_price_board_df()]

    result = await ss.get_stock_overview("vnm")
    assert result["symbol"] == "VNM"


# ──────────────────────────────────────────────────────────────────────────────
# get_stock_trading_history
# ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_trading_history_returns_list_of_dicts(mock_to_thread):
    """Returns a list of dicts with string keys (lowercased column names)."""
    ss._cache.clear()
    price_df = _make_price_df(30)
    mock_to_thread.return_value = price_df

    result = await ss.get_stock_trading_history("VNM", "2024-01-01", "2024-01-31")

    assert isinstance(result, list)
    assert len(result) == 30
    assert "close" in result[0]
    assert "open" in result[0]
    assert "volume" in result[0]


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_trading_history_empty_df_returns_empty_list(mock_to_thread):
    """Empty DataFrame from vnstock returns empty list (not exception)."""
    ss._cache.clear()
    mock_to_thread.return_value = pd.DataFrame()

    result = await ss.get_stock_trading_history("VNM")
    assert result == []


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_trading_history_error_returns_empty_list(mock_to_thread):
    """vnstock exception → gracefully return empty list."""
    ss._cache.clear()
    mock_to_thread.side_effect = Exception("API error")

    result = await ss.get_stock_trading_history("ERR")
    assert result == []


# ──────────────────────────────────────────────────────────────────────────────
# get_financial_report
# ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_financial_report_income_statement_returns_records(mock_to_thread):
    """income_statement returns list of dicts with column names as keys."""
    ss._cache.clear()
    df = pd.DataFrame(
        [
            {
                "yearReport": 2024,
                "lengthReport": 1,
                "revenue": 14_000_000_000,
                "net_income": 2_000_000_000,
            },
            {
                "yearReport": 2023,
                "lengthReport": 4,
                "revenue": 13_500_000_000,
                "net_income": 1_900_000_000,
            },
        ]
    )
    mock_to_thread.return_value = df

    result = await ss.get_financial_report("VNM", "income_statement", "quarter")

    assert isinstance(result, list)
    assert len(result) == 2
    assert "yearReport" in result[0]
    assert result[0]["yearReport"] == 2024


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_financial_report_error_returns_empty_list(mock_to_thread):
    """Error in finance report fetch → empty list."""
    ss._cache.clear()
    mock_to_thread.side_effect = Exception("Timeout")

    result = await ss.get_financial_report("BAD", "balance_sheet", "annual")
    assert result == []


# ──────────────────────────────────────────────────────────────────────────────
# get_stock_news
# ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_news_returns_limited_list(mock_to_thread):
    """Returns at most `limit` news items."""
    ss._cache.clear()
    df = pd.DataFrame(
        [
            {"title": f"Tin {i}", "url": f"https://example.com/{i}", "published_date": "2024-01-01"}
            for i in range(20)
        ]
    )
    mock_to_thread.return_value = df

    result = await ss.get_stock_news("VNM", limit=5)
    assert len(result) == 5


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_news_empty_returns_empty_list(mock_to_thread):
    ss._cache.clear()
    mock_to_thread.return_value = pd.DataFrame()

    result = await ss.get_stock_news("VNM")
    assert result == []


@pytest.mark.asyncio
@patch("backend.services.stock_service.asyncio.to_thread", new_callable=AsyncMock)
async def test_get_stock_news_error_returns_empty_list(mock_to_thread):
    ss._cache.clear()
    mock_to_thread.side_effect = Exception("News API down")

    result = await ss.get_stock_news("ERR")
    assert result == []


# ──────────────────────────────────────────────────────────────────────────────
# get_stock_technicals — pure calculation logic
# ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_correct_sma20(mock_history):
    """SMA-20 equals the arithmetic mean of the last 20 close prices."""
    ss._cache.clear()
    # 60 closes: 1000, 1001, ..., 1059
    closes = list(range(1000, 1060))
    mock_history.return_value = [
        {"time": f"2024-01-{i + 1:02d}", "close": c, "volume": 1_000_000}
        for i, c in enumerate(closes)
    ]

    result = await ss.get_stock_technicals("VNM", "1Y")

    expected_sma20 = round(sum(closes[-20:]) / 20, 2)
    assert result["indicators"]["sma_20"] == expected_sma20


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_rsi_overbought(mock_history):
    """RSI should be > 70 when prices only rise (all gains, no losses)."""
    ss._cache.clear()
    closes = [float(1000 + i * 50) for i in range(30)]
    mock_history.return_value = [
        {"time": f"2024-01-{i + 1:02d}", "close": c, "volume": 1_000_000}
        for i, c in enumerate(closes)
    ]

    result = await ss.get_stock_technicals("VNM", "1Y")
    rsi = result["indicators"]["rsi_14"]
    assert rsi is not None
    assert rsi > 70, f"Expected RSI > 70 for rising prices, got {rsi}"


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_rsi_oversold(mock_history):
    """RSI should be < 30 when prices only fall (all losses, no gains)."""
    ss._cache.clear()
    closes = [float(2000 - i * 50) for i in range(30)]
    mock_history.return_value = [
        {"time": f"2024-01-{i + 1:02d}", "close": c, "volume": 1_000_000}
        for i, c in enumerate(closes)
    ]

    result = await ss.get_stock_technicals("VNM", "1Y")
    rsi = result["indicators"]["rsi_14"]
    assert rsi is not None
    assert rsi < 30, f"Expected RSI < 30 for falling prices, got {rsi}"


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_bollinger_bands_upper_above_lower(mock_history):
    """Bollinger upper band must always be >= middle >= lower."""
    ss._cache.clear()
    closes = [float(50_000 + (i % 10) * 200) for i in range(60)]
    mock_history.return_value = [
        {"time": f"2024-01-{i + 1:02d}", "close": c} for i, c in enumerate(closes)
    ]

    result = await ss.get_stock_technicals("VNM", "1Y")
    inds = result["indicators"]
    assert inds["bb_upper"] is not None
    assert inds["bb_middle"] is not None
    assert inds["bb_lower"] is not None
    assert inds["bb_upper"] >= inds["bb_middle"] >= inds["bb_lower"]


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_insufficient_data_returns_none_sma200(mock_history):
    """SMA-200 returns None when there are fewer than 200 data points."""
    ss._cache.clear()
    closes = [float(50_000 + i * 100) for i in range(30)]  # only 30 points
    mock_history.return_value = [
        {"time": f"2024-01-{i + 1:02d}", "close": c} for i, c in enumerate(closes)
    ]

    result = await ss.get_stock_technicals("VNM", "1Y")
    assert result["indicators"]["sma_200"] is None


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_empty_data_returns_error(mock_history):
    """Empty history → returns dict with 'error' key."""
    ss._cache.clear()
    mock_history.return_value = []

    result = await ss.get_stock_technicals("VNM", "1Y")
    assert "error" in result


@pytest.mark.asyncio
@patch("backend.services.stock_service.get_stock_trading_history", new_callable=AsyncMock)
async def test_get_stock_technicals_price_history_returns_last_60(mock_history):
    """price_history in result contains at most the last 60 data points."""
    ss._cache.clear()
    n = 100
    closes = [float(50_000 + i * 100) for i in range(n)]
    mock_history.return_value = [
        {"time": f"2024-01-{i + 1:02d}", "close": c} for i, c in enumerate(closes)
    ]

    result = await ss.get_stock_technicals("VNM", "1Y")
    assert len(result["price_history"]) <= 60
