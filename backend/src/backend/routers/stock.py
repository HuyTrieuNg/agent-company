"""Stock data API endpoints with DI and test patch support."""

import logging
import sys

from fastapi import APIRouter, Depends, HTTPException, Query

from ..schemas.market import (
    StockFinancialResponse,
    StockNewsResponse,
    StockOverview,
    StockSearchResponse,
    StockTechnicalsResponse,
    StockTradingResponse,
)
from ..services.stock_service import (
    StockService,
    get_financial_report,
    get_stock_news,
    get_stock_overview,
    get_stock_technicals,
    get_stock_trading_history,
)
from .deps import get_stock_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("/{symbol}/overview", response_model=StockOverview)
async def stock_overview(
    symbol: str,
    service: StockService = Depends(get_stock_service),
) -> StockOverview:
    """Lấy thông tin tổng quan doanh nghiệp."""
    try:
        fn = sys.modules[__name__].__dict__.get("get_stock_overview", service.get_stock_overview)
        data = await fn(symbol)
        if "error" in data:
            raise HTTPException(status_code=502, detail=str(data["error"]))
        return data
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error in /overview for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/trading", response_model=StockTradingResponse)
async def stock_trading(
    symbol: str,
    start_date: str = Query(default="2024-01-01"),
    end_date: str | None = Query(default=None),
    interval: str = Query(default="1D"),
    service: StockService = Depends(get_stock_service),
) -> StockTradingResponse:
    """Lấy lịch sử giá giao dịch."""
    try:
        fn = sys.modules[__name__].__dict__.get(
            "get_stock_trading_history", service.get_stock_trading_history
        )
        data = await fn(symbol, start_date=start_date, end_date=end_date, interval=interval)
        return {"symbol": symbol.upper(), "data": data, "count": len(data)}
    except Exception as exc:
        logger.exception(f"Error in /trading for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/technicals", response_model=StockTechnicalsResponse)
async def stock_technicals(
    symbol: str,
    timeframe: str = Query(default="1Y"),
    service: StockService = Depends(get_stock_service),
) -> StockTechnicalsResponse:
    """Lấy chỉ số kỹ thuật (MA, RSI, MACD, Bollinger Bands)."""
    try:
        fn = sys.modules[__name__].__dict__.get(
            "get_stock_technicals", service.get_stock_technicals
        )
        data = await fn(symbol, timeframe=timeframe)
        if "error" in data:
            raise HTTPException(status_code=502, detail=str(data["error"]))
        return data
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error in /technicals for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/financials", response_model=StockFinancialResponse)
async def stock_financials(
    symbol: str,
    report_type: str = Query(default="income_statement"),
    period: str = Query(default="quarter"),
    service: StockService = Depends(get_stock_service),
) -> StockFinancialResponse:
    """Lấy báo cáo tài chính."""
    try:
        fn = sys.modules[__name__].__dict__.get(
            "get_financial_report", service.get_financial_report
        )
        data = await fn(symbol, report_type=report_type, period=period)
        return {
            "symbol": symbol.upper(),
            "report_type": report_type,
            "period": period,
            "data": data,
        }
    except Exception as exc:
        logger.exception(f"Error in /financials for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/news", response_model=StockNewsResponse)
async def stock_news(
    symbol: str,
    limit: int = Query(default=10, ge=1, le=50),
    service: StockService = Depends(get_stock_service),
) -> StockNewsResponse:
    """Lấy tin tức doanh nghiệp."""
    try:
        fn = sys.modules[__name__].__dict__.get("get_stock_news", service.get_stock_news)
        data = await fn(symbol, limit=limit)
        return {"symbol": symbol.upper(), "data": data, "count": len(data)}
    except Exception as exc:
        logger.exception(f"Error in /news for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/search", response_model=StockSearchResponse)
async def search_stocks(
    q: str = Query(..., description="Tên hoặc mã chứng khoán"),
    service: StockService = Depends(get_stock_service),
) -> StockSearchResponse:
    """Tìm kiếm mã chứng khoán."""
    try:
        results = await service.search_stocks(q)
        return {"results": results}
    except Exception as exc:
        logger.exception(f"Error in stock search for '{q}'")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


__all__ = [
    "router",
    "get_stock_overview",
    "get_stock_trading_history",
    "get_stock_technicals",
    "get_financial_report",
    "get_stock_news",
]
