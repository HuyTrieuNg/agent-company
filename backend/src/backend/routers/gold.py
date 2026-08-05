"""Gold price API endpoints."""
import logging
from fastapi import APIRouter, HTTPException, Query

from ..services.gold_service import (
    get_gold_history,
    get_gold_news,
    get_gold_overview,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gold", tags=["gold"])


@router.get("/overview")
async def gold_overview():
    """Lấy danh sách bảng giá vàng tổng quan mới nhất."""
    try:
        return await get_gold_overview()
    except Exception as exc:
        logger.exception("Error in /api/gold/overview")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/history")
async def gold_history(
    code: str = Query(default="SJC", description="Mã loại vàng (SJC, RING_SJC, PNJ, DOJI, XAU_USD)"),
    timeframe: str = Query(default="1M", description="Khoảng thời gian (1D, 1W, 1M, 1Y)"),
):
    """Lấy lịch sử biến động giá vàng."""
    try:
        return await get_gold_history(code=code, timeframe=timeframe)
    except Exception as exc:
        logger.exception(f"Error in /api/gold/history for code={code}, timeframe={timeframe}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/news")
async def gold_news():
    """Lấy tin tức thị trường giá vàng."""
    try:
        return await get_gold_news()
    except Exception as exc:
        logger.exception("Error in /api/gold/news")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
