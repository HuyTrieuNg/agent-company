import pytest

from backend.services.forex_service import (
    get_forex_history,
    get_forex_news,
    get_forex_overview,
)
from backend.services.gold_service import (
    get_gold_history,
    get_gold_news,
    get_gold_overview,
)


@pytest.mark.asyncio
async def test_get_gold_overview():
    res = await get_gold_overview()
    assert "items" in res
    assert "updated_at" in res
    assert len(res["items"]) >= 5
    codes = [item["code"] for item in res["items"]]
    assert "SJC" in codes
    assert "XAU_USD" in codes


@pytest.mark.asyncio
async def test_get_gold_history():
    res = await get_gold_history(code="SJC", timeframe="1M")
    assert res["code"] == "SJC"
    assert "data" in res
    assert len(res["data"]) > 0
    first = res["data"][0]
    assert "buy" in first
    assert "sell" in first
    assert "time" in first


@pytest.mark.asyncio
async def test_get_gold_news():
    news = await get_gold_news()
    assert isinstance(news, list)
    assert len(news) > 0
    assert "title" in news[0]


@pytest.mark.asyncio
async def test_get_forex_overview():
    res = await get_forex_overview()
    assert "items" in res
    assert "bank" in res
    codes = [item["code"] for item in res["items"]]
    assert "USD" in codes
    assert "EUR" in codes


@pytest.mark.asyncio
async def test_get_forex_history():
    res = await get_forex_history(pair="USD", timeframe="1M")
    assert res["code"] == "USD"
    assert "data" in res
    assert len(res["data"]) > 0
    first = res["data"][0]
    assert "buy" in first
    assert "sell" in first


@pytest.mark.asyncio
async def test_get_forex_news():
    news = await get_forex_news()
    assert isinstance(news, list)
    assert len(news) > 0
    assert "title" in news[0]
