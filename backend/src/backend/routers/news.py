"""News articles API endpoints using Qdrant vector database with DI."""

import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchAny,
    MatchValue,
    PayloadSchemaType,
)

from ..schemas.market import (
    FullArticleItem,
    FullArticleRequest,
    FullArticleResponse,
    NewsArticleItem,
    NewsArticleListResponse,
    NewsCategoriesResponse,
    NewsSiteInfo,
)
from ..services.qdrant_service import (
    QdrantService,
    get_dense_embedder,
    qdrant_client,
    settings,
)
from ..services.sources_registry import (
    SourcesRegistry,
    sources_registry,
)
from .deps import get_qdrant_service, get_sources_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("/categories", response_model=NewsCategoriesResponse)
async def get_categories_and_sites(
    sources_reg: SourcesRegistry = Depends(get_sources_registry),
) -> NewsCategoriesResponse:
    """Lấy danh sách các danh mục tin tức và nguồn trang web khả dụng."""
    sources = sources_reg.sources
    sites: list[NewsSiteInfo] = [{"code": key, "name": key.upper()} for key in sources.keys()]
    if not sites:
        sites = [
            {"code": "cafef", "name": "CafeF"},
            {"code": "vneconomy", "name": "VnEconomy"},
            {"code": "thesaigontimes", "name": "Saigon Times"},
        ]
    categories = [
        "Tài chính",
        "Chứng khoán",
        "Bất động sản",
        "Kinh tế",
        "Thị trường",
        "Doanh nghiệp",
        "Vĩ mô",
        "Công nghệ",
    ]
    return {
        "sites": sites,
        "categories": categories,
    }


@router.get("/articles", response_model=NewsArticleListResponse)
async def list_news_articles(
    query: str | None = Query(None, description="Từ khóa tìm kiếm ngữ nghĩa"),
    category: str | None = Query(None, description="Lọc theo danh mục"),
    site: str | None = Query(None, description="Lọc theo nguồn tin (cafef, vneconomy...)"),
    date_from: str | None = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Số trang (từ 1)"),
    limit: int = Query(12, ge=1, le=50, description="Số bài viết trên mỗi trang"),
    qdrant_svc: QdrantService = Depends(get_qdrant_service),
) -> NewsArticleListResponse:
    """
    Duyệt danh sách các bài báo có trong Qdrant.
    Lấy điểm dữ liệu đại diện cho từng bài viết.
    """
    client = qdrant_svc.client
    if not client:
        raise HTTPException(status_code=503, detail="Vector database Qdrant chưa được khởi tạo.")

    # Đảm bảo payload indexes tồn tại cho filtering
    for field_name in ["chunk_type", "category", "site", "url_hash", "published_at"]:
        try:
            client.create_payload_index(
                collection_name=qdrant_svc.settings.qdrant_collection,
                field_name=field_name,
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception:
            pass

    must_conditions: list[Any] = [FieldCondition(key="chunk_type", match=MatchValue(value="sapo"))]

    if category:
        must_conditions.append(FieldCondition(key="category", match=MatchValue(value=category)))
    if site:
        must_conditions.append(FieldCondition(key="site", match=MatchValue(value=site)))

    if date_from and date_to:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            dt_to = datetime.strptime(date_to, "%Y-%m-%d")
            if dt_from > dt_to:
                dt_from, dt_to = dt_to, dt_from
            delta = (dt_to - dt_from).days
            date_list = [
                (dt_from + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(delta + 1)
            ]
            must_conditions.append(
                FieldCondition(key="published_at", match=MatchAny(any=date_list))
            )
        except ValueError:
            logger.warning(f"Invalid date range: {date_from}~{date_to}, skipping.")
    elif date_from:
        try:
            datetime.strptime(date_from, "%Y-%m-%d")
            must_conditions.append(
                FieldCondition(key="published_at", match=MatchValue(value=date_from))
            )
        except ValueError:
            logger.warning(f"Invalid date_from: {date_from}, skipping.")
    elif date_to:
        try:
            datetime.strptime(date_to, "%Y-%m-%d")
            must_conditions.append(
                FieldCondition(key="published_at", match=MatchValue(value=date_to))
            )
        except ValueError:
            logger.warning(f"Invalid date_to: {date_to}, skipping.")

    qdrant_filter = Filter(must=must_conditions)

    articles: list[NewsArticleItem] = []
    total = 0

    try:
        embedder = get_dense_embedder()
        collection_name = qdrant_svc.settings.qdrant_collection

        if query and query.strip() and embedder:
            prompt_query = f"query: {query.strip()}"
            query_vector = embedder.encode(prompt_query).tolist()

            try:
                search_res = client.query_points(
                    collection_name=collection_name,
                    query=query_vector,
                    using="dense",
                    query_filter=qdrant_filter,
                    limit=limit * page * 2,
                )
                points = search_res.points
            except Exception as search_err:
                logger.warning(
                    f"Filtered query failed ({search_err}), trying without chunk_type filter..."
                )
                no_chunk_filter = (
                    Filter(must=[c for c in must_conditions if c.key != "chunk_type"])
                    if len(must_conditions) > 1
                    else None
                )
                search_res = client.query_points(
                    collection_name=collection_name,
                    query=query_vector,
                    using="dense",
                    query_filter=no_chunk_filter,
                    limit=limit * page * 2,
                )
                points = search_res.points

            seen: set[str] = set()
            unique_points: list[Any] = []
            for pt in points:
                payload = dict(pt.payload or {})
                hash_key = str(payload.get("url_hash") or payload.get("article_url") or pt.id)
                if hash_key not in seen:
                    seen.add(hash_key)
                    unique_points.append(pt)

            offset_idx = (page - 1) * limit
            paginated_points = unique_points[offset_idx : offset_idx + limit]
            total = len(unique_points)

            for pt in paginated_points:
                payload: dict[str, Any] = dict(pt.payload or {})
                articles.append(
                    {
                        "id": str(pt.id),
                        "url_hash": str(payload.get("url_hash", "")),
                        "title": str(
                            payload.get("article_title", payload.get("title", "Không có tiêu đề"))
                        ),
                        "sapo": str(payload.get("text", "")),
                        "site": str(payload.get("site", "Nguồn tin")),
                        "category": str(payload.get("category", "Tin tức")),
                        "published_at": str(payload.get("published_at", "")),
                        "author": str(payload.get("author", "")),
                        "tags": list(payload.get("tags") or []),
                        "url": str(payload.get("article_url", payload.get("url", ""))),
                        "score": round(float(pt.score), 4) if hasattr(pt, "score") else None,
                    }
                )

        else:
            try:
                scroll_res = client.scroll(
                    collection_name=collection_name,
                    scroll_filter=qdrant_filter,
                    limit=limit * page * 2,
                    with_payload=True,
                    with_vectors=False,
                )
                points, _ = scroll_res
            except Exception as scroll_err:
                logger.warning(
                    f"Filtered scroll failed ({scroll_err}), trying without chunk_type filter..."
                )
                no_chunk_filter = (
                    Filter(must=[c for c in must_conditions if c.key != "chunk_type"])
                    if len(must_conditions) > 1
                    else None
                )
                scroll_res = client.scroll(
                    collection_name=collection_name,
                    scroll_filter=no_chunk_filter,
                    limit=limit * page * 2,
                    with_payload=True,
                    with_vectors=False,
                )
                points, _ = scroll_res

            seen = set()
            unique_points = []
            for pt in points:
                payload = dict(pt.payload or {})
                hash_key = str(payload.get("url_hash") or payload.get("article_url") or pt.id)
                if hash_key not in seen:
                    seen.add(hash_key)
                    unique_points.append(pt)

            total = len(unique_points)
            offset_idx = (page - 1) * limit
            paginated_points = unique_points[offset_idx : offset_idx + limit]

            for pt in paginated_points:
                payload = dict(pt.payload or {})
                articles.append(
                    {
                        "id": str(pt.id),
                        "url_hash": str(payload.get("url_hash", "")),
                        "title": str(
                            payload.get("article_title", payload.get("title", "Không có tiêu đề"))
                        ),
                        "sapo": str(payload.get("text", "")),
                        "site": str(payload.get("site", "Nguồn tin")),
                        "category": str(payload.get("category", "Tin tức")),
                        "published_at": str(payload.get("published_at", "")),
                        "author": str(payload.get("author", "")),
                        "tags": list(payload.get("tags") or []),
                        "url": str(payload.get("article_url", payload.get("url", ""))),
                    }
                )

        return {
            "page": page,
            "limit": limit,
            "total_retrieved": total,
            "articles": articles,
        }

    except Exception as e:
        logger.error(f"Error fetching news articles from Qdrant: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Lỗi khi truy vấn bài báo từ Qdrant: {str(e)}"
        ) from e


@router.post("/articles/full", response_model=FullArticleResponse)
async def get_full_articles(
    req: FullArticleRequest,
    qdrant_svc: QdrantService = Depends(get_qdrant_service),
) -> FullArticleResponse:
    """
    Tải toàn bộ nội dung (tất cả các chunks: sapo + body) của các bài báo theo url_hash hoặc article_url.
    """
    client = qdrant_svc.client
    if not client:
        raise HTTPException(status_code=503, detail="Vector database Qdrant chưa được khởi tạo.")

    if not req.url_hashes and not req.article_urls:
        return {"articles": []}

    try:
        conditions: list[Any] = []
        if req.url_hashes:
            conditions.append(FieldCondition(key="url_hash", match=MatchAny(any=req.url_hashes)))
        if req.article_urls:
            conditions.append(
                FieldCondition(key="article_url", match=MatchAny(any=req.article_urls))
            )

        scroll_res = client.scroll(
            collection_name=qdrant_svc.settings.qdrant_collection,
            scroll_filter=Filter(should=conditions)
            if len(conditions) > 1
            else Filter(must=conditions),
            limit=500,
            with_payload=True,
            with_vectors=False,
        )

        points, _ = scroll_res

        grouped: dict[str, list[dict[str, Any]]] = {}
        for pt in points:
            payload = pt.payload or {}
            key = str(payload.get("url_hash") or payload.get("article_url") or "")
            if key:
                grouped.setdefault(key, []).append(payload)

        result_articles: list[FullArticleItem] = []
        for _, payload_list in grouped.items():
            sorted_payloads = sorted(payload_list, key=lambda x: int(x.get("chunk_index", 0)))
            first = sorted_payloads[0]

            combined_text = "\n\n".join(
                str(p.get("text", "")) for p in sorted_payloads if p.get("text")
            )

            result_articles.append(
                {
                    "url_hash": str(first.get("url_hash", "")),
                    "url": str(first.get("article_url", "")),
                    "title": str(first.get("article_title", first.get("title", ""))),
                    "sapo": str(
                        next(
                            (
                                p.get("text", "")
                                for p in sorted_payloads
                                if p.get("chunk_type") == "sapo"
                            ),
                            first.get("text", ""),
                        )
                    ),
                    "content": combined_text,
                    "site": str(first.get("site", "")),
                    "category": str(first.get("category", "")),
                    "published_at": str(first.get("published_at", "")),
                    "author": str(first.get("author", "")),
                    "tags": list(first.get("tags") or []),
                    "chunk_count": len(sorted_payloads),
                }
            )

        return {"articles": result_articles}

    except Exception as e:
        logger.error(f"Error building full articles: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Lỗi khi khôi phục bài viết đầy đủ: {str(e)}"
        ) from e


__all__ = [
    "router",
    "FullArticleRequest",
    "get_dense_embedder",
    "qdrant_client",
    "settings",
    "sources_registry",
]
