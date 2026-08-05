import logging
from typing import Any, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny, PayloadSchemaType

from ..qdrant_service import qdrant_client, get_dense_embedder, settings
from ..sources_registry import sources_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/news", tags=["news"])


class FullArticleRequest(BaseModel):
    url_hashes: list[str] = []
    article_urls: list[str] = []


@router.get("/categories")
async def get_categories_and_sites():
    """Lấy danh sách các danh mục tin tức và nguồn trang web khả dụng."""
    sources = sources_registry.sources
    sites = [
        {"code": key, "name": key.upper()}
        for key in sources.keys()
    ]
    if not sites:
        sites = [
            {"code": "cafef", "name": "CafeF"},
            {"code": "vneconomy", "name": "VnEconomy"},
            {"code": "thesaigontimes", "name": "Saigon Times"},
        ]
    categories = [
        "Tài chính", "Chứng khoán", "Bất động sản", "Kinh tế",
        "Thị trường", "Doanh nghiệp", "Vĩ mô", "Công nghệ"
    ]
    return {
        "sites": sites,
        "categories": categories,
    }



@router.get("/articles")
async def list_news_articles(
    query: Optional[str] = Query(None, description="Từ khóa tìm kiếm ngữ nghĩa"),
    category: Optional[str] = Query(None, description="Lọc theo danh mục"),
    site: Optional[str] = Query(None, description="Lọc theo nguồn tin (cafef, vneconomy...)"),
    date_from: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Số trang (từ 1)"),
    limit: int = Query(12, ge=1, le=50, description="Số bài viết trên mỗi trang"),
):
    """
    Duyệt danh sách các bài báo có trong Qdrant.
    Lấy điểm dữ liệu đại diện cho từng bài viết.
    """
    if not qdrant_client:
        raise HTTPException(status_code=503, detail="Vector database Qdrant chưa được khởi tạo.")

    # Đảm bảo payload indexes tồn tại cho filtering
    for field_name in ["chunk_type", "category", "site", "url_hash", "published_at"]:
        try:
            qdrant_client.create_payload_index(
                collection_name=settings.qdrant_collection,
                field_name=field_name,
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception:
            pass

    must_conditions = []
    # Thử thêm chunk_type = sapo nếu có
    must_conditions.append(FieldCondition(key="chunk_type", match=MatchValue(value="sapo")))

    if category:
        must_conditions.append(FieldCondition(key="category", match=MatchValue(value=category)))
    if site:
        must_conditions.append(FieldCondition(key="site", match=MatchValue(value=site)))

    # --- must: date range filter ---
    if date_from and date_to:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            dt_to = datetime.strptime(date_to, "%Y-%m-%d")
            if dt_from > dt_to:
                dt_from, dt_to = dt_to, dt_from
            delta = (dt_to - dt_from).days
            date_list = [
                (dt_from + timedelta(days=i)).strftime("%Y-%m-%d")
                for i in range(delta + 1)
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

    articles = []
    total = 0

    try:
        embedder = get_dense_embedder()
        if query and query.strip() and embedder:
            # Semantic search trên sapo chunks
            prompt_query = f"query: {query.strip()}"
            query_vector = embedder.encode(prompt_query).tolist()

            try:
                search_res = qdrant_client.query_points(
                    collection_name=settings.qdrant_collection,
                    query=query_vector,
                    using="dense",
                    query_filter=qdrant_filter,
                    limit=limit * page * 2,
                )
                points = search_res.points
            except Exception as search_err:
                logger.warning(f"Filtered query failed ({search_err}), trying without chunk_type filter...")
                no_chunk_filter = Filter(
                    must=[c for c in must_conditions if c.key != "chunk_type"]
                ) if len(must_conditions) > 1 else None
                search_res = qdrant_client.query_points(
                    collection_name=settings.qdrant_collection,
                    query=query_vector,
                    using="dense",
                    query_filter=no_chunk_filter,
                    limit=limit * page * 2,
                )
                points = search_res.points

            # Deduplicate by url_hash / article_url
            seen = set()
            unique_points = []
            for pt in points:
                payload = pt.payload or {}
                hash_key = payload.get("url_hash") or payload.get("article_url", str(pt.id))
                if hash_key not in seen:
                    seen.add(hash_key)
                    unique_points.append(pt)

            offset_idx = (page - 1) * limit
            paginated_points = unique_points[offset_idx : offset_idx + limit]
            total = len(unique_points)

            for pt in paginated_points:
                payload = pt.payload or {}
                articles.append({
                    "id": str(pt.id),
                    "url_hash": payload.get("url_hash", ""),
                    "title": payload.get("article_title", payload.get("title", "Không có tiêu đề")),
                    "sapo": payload.get("text", ""),
                    "site": payload.get("site", "Nguồn tin"),
                    "category": payload.get("category", "Tin tức"),
                    "published_at": payload.get("published_at", ""),
                    "author": payload.get("author", ""),
                    "tags": payload.get("tags", []),
                    "url": payload.get("article_url", payload.get("url", "")),
                    "score": round(float(pt.score), 4) if hasattr(pt, "score") else None,
                })

        else:
            # Scroll Qdrant points
            try:
                scroll_res = qdrant_client.scroll(
                    collection_name=settings.qdrant_collection,
                    scroll_filter=qdrant_filter,
                    limit=limit * page * 2,
                    with_payload=True,
                    with_vectors=False,
                )
                points, _ = scroll_res
            except Exception as scroll_err:
                logger.warning(f"Filtered scroll failed ({scroll_err}), trying without chunk_type filter...")
                no_chunk_filter = Filter(
                    must=[c for c in must_conditions if c.key != "chunk_type"]
                ) if len(must_conditions) > 1 else None
                scroll_res = qdrant_client.scroll(
                    collection_name=settings.qdrant_collection,
                    scroll_filter=no_chunk_filter,
                    limit=limit * page * 2,
                    with_payload=True,
                    with_vectors=False,
                )
                points, _ = scroll_res

            # Deduplicate by url_hash / article_url
            seen = set()
            unique_points = []
            for pt in points:
                payload = pt.payload or {}
                hash_key = payload.get("url_hash") or payload.get("article_url", str(pt.id))
                if hash_key not in seen:
                    seen.add(hash_key)
                    unique_points.append(pt)

            total = len(unique_points)
            offset_idx = (page - 1) * limit
            paginated_points = unique_points[offset_idx : offset_idx + limit]

            for pt in paginated_points:
                payload = pt.payload or {}
                articles.append({
                    "id": str(pt.id),
                    "url_hash": payload.get("url_hash", ""),
                    "title": payload.get("article_title", payload.get("title", "Không có tiêu đề")),
                    "sapo": payload.get("text", ""),
                    "site": payload.get("site", "Nguồn tin"),
                    "category": payload.get("category", "Tin tức"),
                    "published_at": payload.get("published_at", ""),
                    "author": payload.get("author", ""),
                    "tags": payload.get("tags", []),
                    "url": payload.get("article_url", payload.get("url", "")),
                })

        return {
            "page": page,
            "limit": limit,
            "total_retrieved": total,
            "articles": articles,
        }

    except Exception as e:
        logger.error(f"Error fetching news articles from Qdrant: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi truy vấn bài báo từ Qdrant: {str(e)}")



@router.post("/articles/full")
async def get_full_articles(req: FullArticleRequest):
    """
    Tải toàn bộ nội dung (tất cả các chunks: sapo + body) của các bài báo theo url_hash hoặc article_url.
    Gộp các chunk lại theo thứ tự chunk_index để tạo nội dung hoàn chỉnh.
    """
    if not qdrant_client:
        raise HTTPException(status_code=503, detail="Vector database Qdrant chưa được khởi tạo.")

    if not req.url_hashes and not req.article_urls:
        return {"articles": []}

    try:
        from qdrant_client.models import FieldCondition, MatchAny

        conditions = []
        if req.url_hashes:
            conditions.append(FieldCondition(key="url_hash", match=MatchAny(any=req.url_hashes)))
        if req.article_urls:
            conditions.append(FieldCondition(key="article_url", match=MatchAny(any=req.article_urls)))

        # Fetch matching chunks (up to 500 chunks)
        scroll_res = qdrant_client.scroll(
            collection_name=settings.qdrant_collection,
            scroll_filter=Filter(should=conditions) if len(conditions) > 1 else Filter(must=conditions),
            limit=500,
            with_payload=True,
            with_vectors=False,
        )

        points, _ = scroll_res

        # Group chunks by url_hash / article_url
        grouped: dict[str, list[dict]] = {}
        for pt in points:
            payload = pt.payload or {}
            key = payload.get("url_hash") or payload.get("article_url", "")
            if key:
                grouped.setdefault(key, []).append(payload)

        result_articles = []
        for key, payload_list in grouped.items():
            # Sort chunks by chunk_index
            sorted_payloads = sorted(payload_list, key=lambda x: x.get("chunk_index", 0))
            first = sorted_payloads[0]
            
            # Combine content
            combined_text = "\n\n".join(p.get("text", "") for p in sorted_payloads if p.get("text"))

            result_articles.append({
                "url_hash": first.get("url_hash", ""),
                "url": first.get("article_url", ""),
                "title": first.get("article_title", first.get("title", "")),
                "sapo": next((p.get("text", "") for p in sorted_payloads if p.get("chunk_type") == "sapo"), first.get("text", "")),
                "content": combined_text,
                "site": first.get("site", ""),
                "category": first.get("category", ""),
                "published_at": first.get("published_at", ""),
                "author": first.get("author", ""),
                "tags": first.get("tags", []),
                "chunk_count": len(sorted_payloads),
            })

        return {"articles": result_articles}

    except Exception as e:
        logger.error(f"Error building full articles: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi khôi phục bài viết đầy đủ: {str(e)}")
