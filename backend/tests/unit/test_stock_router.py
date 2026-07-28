"""Unit tests for backend.routers.stock (FastAPI endpoints).

All stock_service calls are mocked so tests are fully offline.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from backend.main import app

client = TestClient(app)

MOCK_OVERVIEW = {
    "symbol": "VNM",
    "company_name": "Vietnam Dairy Products JSC",
    "exchange": "HOSE",
    "industry": "Hàng tiêu dùng",
    "market_cap": 1_500_000_000_000,
    "pe_ratio": 15.2,
    "pb_ratio": 3.5,
    "ps_ratio": None,
    "eps": 5000.0,
    "beta": 0.85,
    "current_price": 72000,
    "price_change": 500,
    "price_change_pct": 0.7,
    "week_52_high": 85000,
    "week_52_low": 60000,
    "volume": 2_500_000,
    "avg_volume": None,
    "description": "",
}

MOCK_HISTORY = [
    {"time": "2024-01-01", "open": 70000, "high": 72000, "low": 69000, "close": 71500, "volume": 1_000_000},
    {"time": "2024-01-02", "open": 71500, "high": 73000, "low": 71000, "close": 72500, "volume": 1_200_000},
]

MOCK_TECHNICALS = {
    "symbol": "VNM",
    "timeframe": "1Y",
    "last_price": 72000,
    "data_points": 250,
    "indicators": {
        "sma_20": 71000,
        "sma_50": 70500,
        "sma_200": 68000,
        "rsi_14": 55.3,
        "macd": 120.5,
        "macd_signal": 105.2,
        "macd_histogram": 15.3,
        "bb_upper": 75000,
        "bb_middle": 71000,
        "bb_lower": 67000,
    },
    "price_history": [{"time": "2024-01-01", "close": 72000}],
}

MOCK_FINANCIALS = [
    {"yearReport": 2024, "lengthReport": 1, "revenue": 14_000_000_000, "net_income": 2_000_000_000},
    {"yearReport": 2023, "lengthReport": 4, "revenue": 13_500_000_000, "net_income": 1_900_000_000},
]

MOCK_NEWS = [
    {"title": "Vinamilk tăng trưởng mạnh Q1 2024", "source": "cafef", "url": "https://cafef.vn/1", "published_date": "2024-01-15"},
    {"title": "VNM đạt mức lợi nhuận kỷ lục", "source": "vnexpress", "url": "https://vnexpress.net/2", "published_date": "2024-01-10"},
]


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/{symbol}/overview
# ──────────────────────────────────────────────────────────────────────────────

@patch("backend.routers.stock.get_stock_overview", new_callable=AsyncMock)
def test_stock_overview_200(mock_fn):
    """Returns 200 with correct overview fields."""
    mock_fn.return_value = MOCK_OVERVIEW
    res = client.get("/api/stock/VNM/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "VNM"
    assert data["company_name"] == "Vietnam Dairy Products JSC"
    assert data["pe_ratio"] == 15.2
    assert data["current_price"] == 72000


@patch("backend.routers.stock.get_stock_overview", new_callable=AsyncMock)
def test_stock_overview_symbol_case_insensitive(mock_fn):
    """Lowercase symbol in URL still works — service normalises it."""
    mock_fn.return_value = {**MOCK_OVERVIEW, "symbol": "VNM"}
    res = client.get("/api/stock/vnm/overview")
    assert res.status_code == 200


@patch("backend.routers.stock.get_stock_overview", new_callable=AsyncMock)
def test_stock_overview_502_on_error_from_service(mock_fn):
    """When service returns 'error' key, endpoint returns 502."""
    mock_fn.return_value = {"symbol": "INVALID", "error": "Symbol not found"}
    res = client.get("/api/stock/INVALID/overview")
    assert res.status_code == 502
    assert "Symbol not found" in res.json()["detail"]


@patch("backend.routers.stock.get_stock_overview", new_callable=AsyncMock)
def test_stock_overview_500_on_exception(mock_fn):
    """Unhandled exception from service results in 500."""
    mock_fn.side_effect = Exception("Unexpected crash")
    res = client.get("/api/stock/VNM/overview")
    assert res.status_code == 500
    assert "detail" in res.json()


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/{symbol}/trading
# ──────────────────────────────────────────────────────────────────────────────

@patch("backend.routers.stock.get_stock_trading_history", new_callable=AsyncMock)
def test_stock_trading_200_returns_data_and_count(mock_fn):
    """Returns 200 with 'symbol', 'data', and 'count' fields."""
    mock_fn.return_value = MOCK_HISTORY
    res = client.get("/api/stock/VNM/trading")
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "VNM"
    assert isinstance(data["data"], list)
    assert data["count"] == 2


@patch("backend.routers.stock.get_stock_trading_history", new_callable=AsyncMock)
def test_stock_trading_with_custom_dates(mock_fn):
    """Query params start_date, end_date, interval are forwarded correctly."""
    mock_fn.return_value = MOCK_HISTORY
    res = client.get("/api/stock/VNM/trading?start_date=2023-01-01&end_date=2023-12-31&interval=1W")
    assert res.status_code == 200
    args, kwargs = mock_fn.call_args
    # FastAPI passes Query params positionally
    all_args = list(args) + list(kwargs.values())
    assert "2023-01-01" in all_args
    assert "2023-12-31" in all_args
    assert "1W" in all_args


@patch("backend.routers.stock.get_stock_trading_history", new_callable=AsyncMock)
def test_stock_trading_empty_returns_zero_count(mock_fn):
    """Empty history list → count=0, data=[]."""
    mock_fn.return_value = []
    res = client.get("/api/stock/VNM/trading")
    assert res.status_code == 200
    assert res.json()["count"] == 0
    assert res.json()["data"] == []


@patch("backend.routers.stock.get_stock_trading_history", new_callable=AsyncMock)
def test_stock_trading_500_on_exception(mock_fn):
    mock_fn.side_effect = Exception("DB error")
    res = client.get("/api/stock/VNM/trading")
    assert res.status_code == 500


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/{symbol}/technicals
# ──────────────────────────────────────────────────────────────────────────────

@patch("backend.routers.stock.get_stock_technicals", new_callable=AsyncMock)
def test_stock_technicals_200_indicators_present(mock_fn):
    mock_fn.return_value = MOCK_TECHNICALS
    res = client.get("/api/stock/VNM/technicals")
    assert res.status_code == 200
    data = res.json()
    assert "indicators" in data
    assert data["indicators"]["sma_20"] == 71000
    assert data["indicators"]["rsi_14"] == 55.3


@patch("backend.routers.stock.get_stock_technicals", new_callable=AsyncMock)
def test_stock_technicals_timeframe_forwarded(mock_fn):
    """timeframe query param is forwarded to the service."""
    mock_fn.return_value = MOCK_TECHNICALS
    res = client.get("/api/stock/VNM/technicals?timeframe=3M")
    assert res.status_code == 200
    args, kwargs = mock_fn.call_args
    all_args = list(args) + list(kwargs.values())
    assert "3M" in all_args


@patch("backend.routers.stock.get_stock_technicals", new_callable=AsyncMock)
def test_stock_technicals_502_on_service_error_key(mock_fn):
    mock_fn.return_value = {"symbol": "VNM", "error": "No data available"}
    res = client.get("/api/stock/VNM/technicals")
    assert res.status_code == 502


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/{symbol}/financials
# ──────────────────────────────────────────────────────────────────────────────

@patch("backend.routers.stock.get_financial_report", new_callable=AsyncMock)
def test_stock_financials_200_default_params(mock_fn):
    mock_fn.return_value = MOCK_FINANCIALS
    res = client.get("/api/stock/VNM/financials")
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "VNM"
    assert data["report_type"] == "income_statement"
    assert data["period"] == "quarter"
    assert isinstance(data["data"], list)
    assert len(data["data"]) == 2


@patch("backend.routers.stock.get_financial_report", new_callable=AsyncMock)
def test_stock_financials_balance_sheet_annual(mock_fn):
    """report_type and period query params are forwarded correctly."""
    mock_fn.return_value = []
    res = client.get("/api/stock/VNM/financials?report_type=balance_sheet&period=annual")
    assert res.status_code == 200
    args, kwargs = mock_fn.call_args
    all_args = list(args) + list(kwargs.values())
    assert "balance_sheet" in all_args
    assert "annual" in all_args


@patch("backend.routers.stock.get_financial_report", new_callable=AsyncMock)
def test_stock_financials_empty_data_returns_200(mock_fn):
    """Empty financial data still returns 200 (not 404/502)."""
    mock_fn.return_value = []
    res = client.get("/api/stock/VNM/financials")
    assert res.status_code == 200
    assert res.json()["data"] == []


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/{symbol}/news
# ──────────────────────────────────────────────────────────────────────────────

@patch("backend.routers.stock.get_stock_news", new_callable=AsyncMock)
def test_stock_news_200_returns_data_and_count(mock_fn):
    mock_fn.return_value = MOCK_NEWS
    res = client.get("/api/stock/VNM/news")
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "VNM"
    assert data["count"] == 2
    assert data["data"][0]["title"] == "Vinamilk tăng trưởng mạnh Q1 2024"


@patch("backend.routers.stock.get_stock_news", new_callable=AsyncMock)
def test_stock_news_limit_param_forwarded(mock_fn):
    mock_fn.return_value = MOCK_NEWS
    res = client.get("/api/stock/VNM/news?limit=3")
    assert res.status_code == 200
    args, kwargs = mock_fn.call_args
    all_args = list(args) + list(kwargs.values())
    assert 3 in all_args


@patch("backend.routers.stock.get_stock_news", new_callable=AsyncMock)
def test_stock_news_limit_out_of_range_returns_422(mock_fn):
    """limit must be between 1 and 50 — out-of-range triggers 422."""
    res = client.get("/api/stock/VNM/news?limit=0")
    assert res.status_code == 422


@patch("backend.routers.stock.get_stock_news", new_callable=AsyncMock)
def test_stock_news_limit_upper_bound_valid(mock_fn):
    """limit=50 is the maximum allowed value."""
    mock_fn.return_value = []
    res = client.get("/api/stock/VNM/news?limit=50")
    assert res.status_code == 200


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/search
# ──────────────────────────────────────────────────────────────────────────────

def test_stock_search_missing_q_returns_422():
    """GET /api/stock/search without 'q' query param returns 422."""
    res = client.get("/api/stock/search")
    assert res.status_code == 422


# ──────────────────────────────────────────────────────────────────────────────
# Response schema contract tests
# ──────────────────────────────────────────────────────────────────────────────

@patch("backend.routers.stock.get_stock_overview", new_callable=AsyncMock)
def test_overview_response_has_required_fields(mock_fn):
    """Overview response must include all fields that frontend expects."""
    mock_fn.return_value = MOCK_OVERVIEW
    res = client.get("/api/stock/VNM/overview")
    data = res.json()
    required = [
        "symbol", "company_name", "exchange", "industry",
        "current_price", "price_change_pct",
        "pe_ratio", "pb_ratio", "eps", "market_cap",
    ]
    for field in required:
        assert field in data, f"Missing required field: {field}"


@patch("backend.routers.stock.get_stock_technicals", new_callable=AsyncMock)
def test_technicals_response_indicators_structure(mock_fn):
    """Indicators dict must include all keys that frontend reads."""
    mock_fn.return_value = MOCK_TECHNICALS
    res = client.get("/api/stock/VNM/technicals")
    indicators = res.json()["indicators"]
    required_keys = ["sma_20", "sma_50", "sma_200", "rsi_14", "macd", "macd_signal", "bb_upper", "bb_lower"]
    for key in required_keys:
        assert key in indicators, f"Missing indicator: {key}"
