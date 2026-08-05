"""Forex rates API endpoints."""
import logging
from fastapi import APIRouter, HTTPException, Query

from ..services.forex_service import (
    get_forex_history,
    get_forex_news,
    get_forex_overview,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/forex", tags=["forex"])


@router.get("/overview")
async def forex_overview():
    """Lấy bảng tỷ giá ngoại tệ mới nhất."""
    try:
        return await get_forex_overview()
    except Exception as exc:
        logger.exception("Error in /api/forex/overview")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/history")
async def forex_history(
    pair: str = Query(default="USD", description="Mã ngoại tệ (USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY)"),
    timeframe: str = Query(default="1M", description="Khoảng thời gian (1D, 1W, 1M, 1Y)"),
):
    """Lấy lịch sử tỷ giá theo cặp ngoại tệ."""
    try:
        return await get_forex_history(pair=pair, timeframe=timeframe)
    except Exception as exc:
        logger.exception(f"Error in /api/forex/history for pair={pair}, timeframe={timeframe}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/news")
async def forex_news():
    """Lấy tin tức tỷ giá ngoại tệ & thị trường tài chính."""
    try:
        return await get_forex_news()
    except Exception as exc:
        logger.exception("Error in /api/forex/news")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
