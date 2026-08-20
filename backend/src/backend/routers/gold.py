"""Gold price API endpoints with DI."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from ..schemas.market import (
    GoldHistoryResponse,
    GoldNewsItem,
    GoldOverview,
)
from ..services.gold_service import (
    GoldService,
    get_gold_history,
    get_gold_news,
    get_gold_overview,
)
from .deps import get_gold_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gold", tags=["gold"])


@router.get("/overview", response_model=GoldOverview)
async def gold_overview(
    service: GoldService = Depends(get_gold_service),
) -> GoldOverview:
    """Lấy danh sách bảng giá vàng tổng quan mới nhất."""
    try:
        return await service.get_gold_overview()
    except Exception as exc:
        logger.exception("Error in /api/gold/overview")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/history", response_model=GoldHistoryResponse)
async def gold_history(
    code: str = Query(
        default="SJC", description="Mã loại vàng (SJC, RING_SJC, PNJ, DOJI, XAU_USD)"
    ),
    timeframe: str = Query(default="1M", description="Khoảng thời gian (1D, 1W, 1M, 1Y)"),
    service: GoldService = Depends(get_gold_service),
) -> GoldHistoryResponse:
    """Lấy lịch sử biến động giá vàng."""
    try:
        return await service.get_gold_history(code=code, timeframe=timeframe)
    except Exception as exc:
        logger.exception(f"Error in /api/gold/history for code={code}, timeframe={timeframe}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/news", response_model=list[GoldNewsItem])
async def gold_news(
    service: GoldService = Depends(get_gold_service),
) -> list[GoldNewsItem]:
    """Lấy tin tức thị trường giá vàng."""
    try:
        return await service.get_gold_news()
    except Exception as exc:
        logger.exception("Error in /api/gold/news")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


__all__ = ["router", "get_gold_overview", "get_gold_history", "get_gold_news"]
