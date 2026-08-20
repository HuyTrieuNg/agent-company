"""Forex rates API endpoints with DI."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from ..schemas.market import (
    ForexHistoryResponse,
    ForexNewsItem,
    ForexOverview,
)
from ..services.forex_service import (
    ForexService,
    get_forex_history,
    get_forex_news,
    get_forex_overview,
)
from .deps import get_forex_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/forex", tags=["forex"])


@router.get("/overview", response_model=ForexOverview)
async def forex_overview(
    service: ForexService = Depends(get_forex_service),
) -> ForexOverview:
    """Lấy bảng tỷ giá ngoại tệ mới nhất."""
    try:
        return await service.get_forex_overview()
    except Exception as exc:
        logger.exception("Error in /api/forex/overview")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/history", response_model=ForexHistoryResponse)
async def forex_history(
    pair: str = Query(
        default="USD", description="Mã ngoại tệ (USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY)"
    ),
    timeframe: str = Query(default="1M", description="Khoảng thời gian (1D, 1W, 1M, 1Y)"),
    service: ForexService = Depends(get_forex_service),
) -> ForexHistoryResponse:
    """Lấy lịch sử tỷ giá theo cặp ngoại tệ."""
    try:
        return await service.get_forex_history(pair=pair, timeframe=timeframe)
    except Exception as exc:
        logger.exception(f"Error in /api/forex/history for pair={pair}, timeframe={timeframe}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/news", response_model=list[ForexNewsItem])
async def forex_news(
    service: ForexService = Depends(get_forex_service),
) -> list[ForexNewsItem]:
    """Lấy tin tức tỷ giá ngoại tệ & thị trường tài chính."""
    try:
        return await service.get_forex_news()
    except Exception as exc:
        logger.exception("Error in /api/forex/news")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


__all__ = ["router", "get_forex_overview", "get_forex_history", "get_forex_news"]
