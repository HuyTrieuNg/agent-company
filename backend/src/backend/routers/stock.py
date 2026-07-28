"""Stock data API endpoints."""
import logging

from fastapi import APIRouter, HTTPException, Query

from ..services.stock_service import (
    get_financial_report,
    get_stock_news,
    get_stock_overview,
    get_stock_technicals,
    get_stock_trading_history,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("/{symbol}/overview")
async def stock_overview(symbol: str):
    """Lấy thông tin tổng quan doanh nghiệp."""
    try:
        data = await get_stock_overview(symbol)
        if "error" in data:
            raise HTTPException(status_code=502, detail=data["error"])
        return data
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error in /overview for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/trading")
async def stock_trading(
    symbol: str,
    start_date: str = Query(default="2024-01-01"),
    end_date: str | None = Query(default=None),
    interval: str = Query(default="1D"),
):
    """Lấy lịch sử giá giao dịch."""
    try:
        data = await get_stock_trading_history(symbol, start_date, end_date, interval)
        return {"symbol": symbol.upper(), "data": data, "count": len(data)}
    except Exception as exc:
        logger.exception(f"Error in /trading for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/technicals")
async def stock_technicals(
    symbol: str,
    timeframe: str = Query(default="1Y"),
):
    """Lấy chỉ số kỹ thuật (MA, RSI, MACD, Bollinger Bands)."""
    try:
        data = await get_stock_technicals(symbol, timeframe)
        if "error" in data:
            raise HTTPException(status_code=502, detail=data["error"])
        return data
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error in /technicals for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/financials")
async def stock_financials(
    symbol: str,
    report_type: str = Query(default="income_statement"),
    period: str = Query(default="quarter"),
):
    """Lấy báo cáo tài chính.
    report_type: income_statement | balance_sheet | cash_flow | ratios
    period: quarter | annual
    """
    try:
        data = await get_financial_report(symbol, report_type, period)
        return {"symbol": symbol.upper(), "report_type": report_type, "period": period, "data": data}
    except Exception as exc:
        logger.exception(f"Error in /financials for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{symbol}/news")
async def stock_news(
    symbol: str,
    limit: int = Query(default=10, ge=1, le=50),
):
    """Lấy tin tức doanh nghiệp."""
    try:
        data = await get_stock_news(symbol, limit)
        return {"symbol": symbol.upper(), "data": data, "count": len(data)}
    except Exception as exc:
        logger.exception(f"Error in /news for {symbol}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/search")
async def search_stocks(
    q: str = Query(..., description="Tên hoặc mã chứng khoán"),
):
    """Tìm kiếm mã chứng khoán."""
    try:
        from vnstock.api.listing import Listing
        import asyncio
        listing = await asyncio.to_thread(Listing(source='KBS').all_symbols)
        if listing is None or listing.empty:
            return {"results": []}
        q_upper = q.upper()
        # VCI / TCBS / KBS columns may vary. KBS uses 'ticker' and 'organ_name' usually, but let's be safe:
        ticker_col = 'ticker' if 'ticker' in listing.columns else 'symbol'
        name_col = 'organ_name' if 'organ_name' in listing.columns else 'company_name' if 'company_name' in listing.columns else 'short_name'
        
        mask = (
            listing[ticker_col].str.contains(q_upper, case=False, na=False) |
            listing[name_col].str.contains(q, case=False, na=False)
        )
        
        results = listing[mask].head(10).to_dict("records")
        # Normalize to standard dict format
        mapped_results = []
        for r in results:
            mapped_results.append({
                "symbol": r.get(ticker_col, ""),
                "company_name": r.get(name_col, "")
            })
        return {"results": mapped_results}
    except Exception as exc:
        logger.exception(f"Error in stock search for '{q}'")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
