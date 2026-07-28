"""
Unit tests cho hai tính năng mới trong qdrant_service:
  1. _enrich_with_full_article_chunks — làm giàu context bằng toàn bộ chunks của bài báo
  2. _relaxed_fallback_search        — tìm kiếm với filter nới lỏng dần khi không có kết quả
  3. search_articles tích hợp cả hai
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock, call

from backend.qdrant_service import (
    _enrich_with_full_article_chunks,
    _relaxed_fallback_search,
    search_articles,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_point(payload: dict) -> MagicMock:
    """Tạo mock Qdrant point với payload cho sẵn."""
    pt = MagicMock()
    pt.payload = payload
    return pt


def _make_qdrant_response(payloads: list[dict]) -> MagicMock:
    """Tạo mock query_points() response."""
    resp = MagicMock()
    resp.points = [_make_point(p) for p in payloads]
    return resp


def _make_scroll_result(payloads: list[dict]):
    """Tạo mock scroll() response — trả về (list[ScoredPoint], next_offset)."""
    return [_make_point(p) for p in payloads], None


# ===========================================================================
# Tests: _enrich_with_full_article_chunks
# ===========================================================================

class TestEnrichWithFullArticleChunks:

    @pytest.mark.asyncio
    async def test_returns_input_when_qdrant_client_is_none(self):
        """Khi qdrant_client=None, hàm trả lại top_chunks nguyên vẹn."""
        top_chunks = [
            {"url_hash": "abc123", "chunk_index": 0, "text": "chunk 0"},
        ]
        with patch("backend.qdrant_service.qdrant_client", None):
            result = await _enrich_with_full_article_chunks(top_chunks)
        assert result == top_chunks

    @pytest.mark.asyncio
    async def test_returns_input_when_top_chunks_is_empty(self):
        """Không có chunks đầu vào → trả về list rỗng."""
        with patch("backend.qdrant_service.qdrant_client", MagicMock()):
            result = await _enrich_with_full_article_chunks([])
        assert result == []

    @pytest.mark.asyncio
    async def test_fetches_all_chunks_for_single_article(self):
        """Scroll được gọi với url_hash đúng và trả đủ 3 chunks."""
        top_chunks = [{"url_hash": "hash_a", "chunk_index": 1, "text": "chunk giữa"}]

        all_article_chunks = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "sapo"},
            {"url_hash": "hash_a", "chunk_index": 1, "text": "chunk giữa"},
            {"url_hash": "hash_a", "chunk_index": 2, "text": "kết bài"},
        ]

        mock_qdrant = MagicMock()
        mock_qdrant.scroll.return_value = _make_scroll_result(all_article_chunks)

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _enrich_with_full_article_chunks(top_chunks)

        assert len(result) == 3
        # Thứ tự phải theo chunk_index
        assert result[0]["chunk_index"] == 0
        assert result[1]["chunk_index"] == 1
        assert result[2]["chunk_index"] == 2

    @pytest.mark.asyncio
    async def test_fetches_multiple_articles_preserving_rank_order(self):
        """
        Với 2 bài báo (hash_a ranked cao hơn hash_b), chunks hash_a xuất hiện
        trước chunks hash_b trong kết quả.
        """
        top_chunks = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "a0"},  # bài 1
            {"url_hash": "hash_b", "chunk_index": 0, "text": "b0"},  # bài 2
        ]

        chunks_a = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "a0"},
            {"url_hash": "hash_a", "chunk_index": 1, "text": "a1"},
        ]
        chunks_b = [
            {"url_hash": "hash_b", "chunk_index": 0, "text": "b0"},
            {"url_hash": "hash_b", "chunk_index": 1, "text": "b1"},
        ]

        mock_qdrant = MagicMock()
        mock_qdrant.scroll.side_effect = [
            _make_scroll_result(chunks_a),
            _make_scroll_result(chunks_b),
        ]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _enrich_with_full_article_chunks(top_chunks, article_limit=5)

        assert len(result) == 4
        # hash_a phải đứng trước hash_b
        assert result[0]["url_hash"] == "hash_a"
        assert result[1]["url_hash"] == "hash_a"
        assert result[2]["url_hash"] == "hash_b"
        assert result[3]["url_hash"] == "hash_b"

    @pytest.mark.asyncio
    async def test_article_limit_caps_number_of_articles_enriched(self):
        """article_limit=1 → chỉ scroll cho bài đầu tiên, bài thứ hai bị bỏ qua."""
        top_chunks = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "a0"},
            {"url_hash": "hash_b", "chunk_index": 0, "text": "b0"},
        ]

        chunks_a = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "a0"},
            {"url_hash": "hash_a", "chunk_index": 1, "text": "a1"},
        ]

        mock_qdrant = MagicMock()
        mock_qdrant.scroll.return_value = _make_scroll_result(chunks_a)

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _enrich_with_full_article_chunks(top_chunks, article_limit=1)

        # Chỉ bài hash_a được enrich
        assert mock_qdrant.scroll.call_count == 1
        assert all(c["url_hash"] == "hash_a" for c in result)

    @pytest.mark.asyncio
    async def test_deduplicates_url_hashes(self):
        """Nếu nhiều chunk từ cùng bài, scroll chỉ gọi 1 lần cho bài đó."""
        top_chunks = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "a0"},
            {"url_hash": "hash_a", "chunk_index": 1, "text": "a1"},  # cùng bài
        ]

        all_chunks = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "a0"},
            {"url_hash": "hash_a", "chunk_index": 1, "text": "a1"},
        ]

        mock_qdrant = MagicMock()
        mock_qdrant.scroll.return_value = _make_scroll_result(all_chunks)

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _enrich_with_full_article_chunks(top_chunks)

        # scroll chỉ được gọi đúng 1 lần dù có 2 chunk cùng bài
        assert mock_qdrant.scroll.call_count == 1
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_fallback_to_original_chunks_on_scroll_error(self):
        """Nếu scroll lỗi cho một bài, giữ lại chunk gốc từ top_chunks."""
        top_chunks = [
            {"url_hash": "hash_err", "chunk_index": 0, "text": "original"},
        ]

        mock_qdrant = MagicMock()
        mock_qdrant.scroll.side_effect = Exception("Qdrant connection timeout")

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _enrich_with_full_article_chunks(top_chunks)

        # Phải trả về chunk gốc thay vì crash
        assert len(result) == 1
        assert result[0]["text"] == "original"

    @pytest.mark.asyncio
    async def test_chunks_without_url_hash_are_appended_last(self):
        """Chunk không có url_hash được giữ ở cuối kết quả."""
        top_chunks = [
            {"url_hash": "hash_a", "chunk_index": 0, "text": "bài A"},
            {"url_hash": "",        "chunk_index": 0, "text": "không có hash"},
        ]

        chunks_a = [{"url_hash": "hash_a", "chunk_index": 0, "text": "bài A"}]
        mock_qdrant = MagicMock()
        mock_qdrant.scroll.return_value = _make_scroll_result(chunks_a)

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _enrich_with_full_article_chunks(top_chunks)

        # Chunk không hash phải đứng sau
        assert result[-1]["text"] == "không có hash"


# ===========================================================================
# Tests: _relaxed_fallback_search
# ===========================================================================

class TestRelaxedFallbackSearch:

    @pytest.mark.asyncio
    async def test_returns_empty_when_qdrant_client_is_none(self):
        """Không có Qdrant client → trả về list rỗng."""
        with patch("backend.qdrant_service.qdrant_client", None):
            result = await _relaxed_fallback_search(
                query_vector=[0.1, 0.2],
                semantic_query="test",
                site="cafef",
                tags=["kinh tế"],
                limit=5,
                rerank=False,
            )
        assert result == []

    @pytest.mark.asyncio
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    async def test_stops_at_first_successful_strategy(self, mock_enrich):
        """
        Nếu strategy đầu tiên (site+tags, no date) đã có kết quả,
        strategy tiếp theo không được thử.
        """
        mock_payload = {"url_hash": "h1", "chunk_index": 0, "text": "kết quả"}
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.return_value = _make_qdrant_response([mock_payload])
        mock_enrich.return_value = [mock_payload]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _relaxed_fallback_search(
                query_vector=[0.1, 0.2],
                semantic_query="kinh tế",
                site="cafef",
                tags=["kinh tế"],
                limit=5,
                rerank=False,
            )

        # Chỉ gọi query_points 1 lần (strategy 1 thành công)
        assert mock_qdrant.query_points.call_count == 1
        assert len(result) > 0

    @pytest.mark.asyncio
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    async def test_tries_next_strategy_when_previous_yields_empty(self, mock_enrich):
        """
        Strategy 1 trả về rỗng → thử strategy 2.
        Strategy 2 có kết quả → dừng lại, không thử strategy 3.
        """
        mock_payload = {"url_hash": "h2", "chunk_index": 0, "text": "gợi ý"}
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.side_effect = [
            _make_qdrant_response([]),       # strategy 1: rỗng
            _make_qdrant_response([mock_payload]),  # strategy 2: có kết quả
        ]
        mock_enrich.return_value = [mock_payload]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _relaxed_fallback_search(
                query_vector=[0.1, 0.2],
                semantic_query="tài chính",
                site="cafef",
                tags=["tài chính"],
                limit=5,
                rerank=False,
            )

        assert mock_qdrant.query_points.call_count == 2
        assert len(result) > 0

    @pytest.mark.asyncio
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    async def test_falls_through_to_pure_semantic_when_all_filtered_strategies_fail(
        self, mock_enrich
    ):
        """
        Strategy 1 và 2 rỗng → strategy 3 (pure semantic, no filter) được thử.
        """
        mock_payload = {"url_hash": "h3", "chunk_index": 0, "text": "semantic"}
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.side_effect = [
            _make_qdrant_response([]),   # strategy 1
            _make_qdrant_response([]),   # strategy 2
            _make_qdrant_response([mock_payload]),  # strategy 3
        ]
        mock_enrich.return_value = [mock_payload]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _relaxed_fallback_search(
                query_vector=[0.1, 0.2],
                semantic_query="vấn đề hiếm gặp",
                site="cafef",
                tags=["hiếm"],
                limit=5,
                rerank=False,
            )

        assert mock_qdrant.query_points.call_count == 3
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_returns_empty_when_all_strategies_fail(self):
        """Tất cả strategies đều trả về rỗng → trả về list rỗng."""
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.return_value = _make_qdrant_response([])

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _relaxed_fallback_search(
                query_vector=[0.1, 0.2],
                semantic_query="không tìm thấy gì",
                site="",
                tags=[],
                limit=5,
                rerank=False,
            )

        assert result == []

    @pytest.mark.asyncio
    @patch("backend.qdrant_service.rerank_documents", new_callable=AsyncMock)
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    async def test_applies_reranking_when_enabled(self, mock_enrich, mock_rerank):
        """Khi rerank=True, rerank_documents phải được gọi."""
        payloads = [
            {"url_hash": "h1", "chunk_index": 0, "text": "a"},
            {"url_hash": "h2", "chunk_index": 0, "text": "b"},
        ]
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.return_value = _make_qdrant_response(payloads)
        mock_rerank.return_value = [payloads[0]]
        mock_enrich.return_value = [payloads[0]]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _relaxed_fallback_search(
                query_vector=[0.1, 0.2],
                semantic_query="test rerank",
                site="",
                tags=["kinh tế"],
                limit=2,
                rerank=True,
            )

        mock_rerank.assert_called_once()
        assert result is not None

    @pytest.mark.asyncio
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    async def test_skips_filtered_strategies_when_no_site_and_no_tags(self, mock_enrich):
        """
        Khi site='' và tags=[], các strategy 1 và 2 không có điều kiện filter
        nên bị skip; strategy 3 (pure semantic) được chạy trực tiếp.
        """
        mock_payload = {"url_hash": "hX", "chunk_index": 0, "text": "semantic only"}
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.return_value = _make_qdrant_response([mock_payload])
        mock_enrich.return_value = [mock_payload]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            result = await _relaxed_fallback_search(
                query_vector=[0.1],
                semantic_query="chủ đề rất chung",
                site="",
                tags=[],
                limit=3,
                rerank=False,
            )

        # Chỉ 1 lần query (pure semantic)
        assert mock_qdrant.query_points.call_count == 1
        assert len(result) > 0

    @pytest.mark.asyncio
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    async def test_uses_relaxed_score_threshold_040(self, mock_enrich):
        """query_points phải được gọi với score_threshold=0.4 (nới lỏng hơn 0.5)."""
        mock_payload = {"url_hash": "hY", "chunk_index": 0, "text": "x"}
        mock_qdrant = MagicMock()
        mock_qdrant.query_points.return_value = _make_qdrant_response([mock_payload])
        mock_enrich.return_value = [mock_payload]

        with patch("backend.qdrant_service.qdrant_client", mock_qdrant):
            await _relaxed_fallback_search(
                query_vector=[0.1],
                semantic_query="x",
                site="",
                tags=[],
                limit=5,
                rerank=False,
            )

        call_kwargs = mock_qdrant.query_points.call_args.kwargs
        assert call_kwargs.get("score_threshold") == 0.4
        assert call_kwargs.get("using") == "dense"


# ===========================================================================
# Tests: search_articles — tích hợp fallback + enrich
# ===========================================================================

class TestSearchArticlesIntegration:

    @pytest.mark.asyncio
    @patch("backend.qdrant_service.extract_structured_query", new_callable=AsyncMock)
    @patch("backend.qdrant_service.embedder")
    @patch("backend.qdrant_service._relaxed_fallback_search", new_callable=AsyncMock)
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    @patch("backend.qdrant_service.qdrant_client")
    async def test_fallback_triggered_when_strict_query_returns_empty(
        self, mock_qdrant, mock_enrich, mock_fallback, mock_embedder, mock_extract
    ):
        """
        Khi Qdrant strict query trả về 0 candidates, _relaxed_fallback_search
        phải được gọi và kết quả được đánh dấu _is_fallback=True.
        """
        mock_extract.return_value = {
            "semantic_query": "chủ đề hiếm",
            "needs_retrieval": True,
            "site": "cafef",
            "tags": ["hiếm"],
            "date_from": "2026-07-01",
            "date_to": "2026-07-10",
        }
        mock_vector = MagicMock()
        mock_vector.tolist.return_value = [0.1, 0.2]
        mock_embedder.encode.return_value = mock_vector

        # Strict query trả về rỗng
        mock_qdrant.query_points.return_value = _make_qdrant_response([])

        # Fallback tìm được kết quả
        fallback_chunk = {"url_hash": "hF", "chunk_index": 0, "text": "gợi ý"}
        mock_fallback.return_value = [fallback_chunk]

        results, did_retrieve = await search_articles(
            query="chủ đề rất hiếm gặp",
            limit=5,
        )

        mock_fallback.assert_called_once()
        assert did_retrieve is True
        assert len(results) > 0
        # Tất cả kết quả phải được đánh dấu fallback
        assert all(r.get("_is_fallback") is True for r in results)

    @pytest.mark.asyncio
    @patch("backend.qdrant_service.extract_structured_query", new_callable=AsyncMock)
    @patch("backend.qdrant_service.embedder")
    @patch("backend.qdrant_service._relaxed_fallback_search", new_callable=AsyncMock)
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    @patch("backend.qdrant_service.qdrant_client")
    async def test_returns_empty_when_both_strict_and_fallback_return_empty(
        self, mock_qdrant, mock_enrich, mock_fallback, mock_embedder, mock_extract
    ):
        """Không có kết quả từ cả strict lẫn fallback → trả về list rỗng."""
        mock_extract.return_value = {
            "semantic_query": "không tồn tại",
            "needs_retrieval": True,
            "site": "",
            "tags": [],
            "date_from": "",
            "date_to": "",
        }
        mock_vector = MagicMock()
        mock_vector.tolist.return_value = [0.1]
        mock_embedder.encode.return_value = mock_vector

        mock_qdrant.query_points.return_value = _make_qdrant_response([])
        mock_fallback.return_value = []

        results, did_retrieve = await search_articles(query="không tồn tại", limit=5)

        assert results == []
        assert did_retrieve is True

    @pytest.mark.asyncio
    @patch("backend.qdrant_service.extract_structured_query", new_callable=AsyncMock)
    @patch("backend.qdrant_service.embedder")
    @patch("backend.qdrant_service._relaxed_fallback_search", new_callable=AsyncMock)
    @patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock)
    @patch("backend.qdrant_service.rerank_documents", new_callable=AsyncMock)
    @patch("backend.qdrant_service.qdrant_client")
    async def test_enrich_called_after_rerank_on_successful_strict_query(
        self, mock_qdrant, mock_rerank, mock_enrich, mock_fallback, mock_embedder, mock_extract
    ):
        """
        Khi strict query thành công, _enrich_with_full_article_chunks phải được
        gọi sau khi rerank, và _relaxed_fallback_search không được gọi.
        """
        mock_extract.return_value = {
            "semantic_query": "chứng khoán",
            "needs_retrieval": True,
            "site": "",
            "tags": [],
            "date_from": "",
            "date_to": "",
        }
        mock_vector = MagicMock()
        mock_vector.tolist.return_value = [0.1, 0.2, 0.3]
        mock_embedder.encode.return_value = mock_vector

        chunk1 = {"url_hash": "h1", "chunk_index": 0, "text": "chứng khoán 1"}
        chunk2 = {"url_hash": "h2", "chunk_index": 0, "text": "chứng khoán 2"}
        mock_qdrant.query_points.return_value = _make_qdrant_response([chunk1, chunk2])

        reranked = [chunk1]
        mock_rerank.return_value = reranked

        enriched = [
            {"url_hash": "h1", "chunk_index": 0, "text": "chứng khoán 1"},
            {"url_hash": "h1", "chunk_index": 1, "text": "chứng khoán full"},
        ]
        mock_enrich.return_value = enriched

        results, did_retrieve = await search_articles(query="tin chứng khoán", limit=5)

        # Fallback không được gọi
        mock_fallback.assert_not_called()
        # Enrich phải được gọi với kết quả từ rerank
        mock_enrich.assert_called_once_with(top_chunks=reranked, article_limit=5)
        assert did_retrieve is True
        assert results == enriched

    @pytest.mark.asyncio
    @patch("backend.qdrant_service.extract_structured_query", new_callable=AsyncMock)
    @patch("backend.qdrant_service.embedder")
    @patch("backend.qdrant_service._relaxed_fallback_search", new_callable=AsyncMock)
    @patch("backend.qdrant_service.qdrant_client")
    async def test_fallback_not_triggered_when_strict_has_results(
        self, mock_qdrant, mock_fallback, mock_embedder, mock_extract
    ):
        """_relaxed_fallback_search không được gọi khi strict query có kết quả."""
        mock_extract.return_value = {
            "semantic_query": "kinh tế",
            "needs_retrieval": True,
            "site": "",
            "tags": [],
            "date_from": "",
            "date_to": "",
        }
        mock_vector = MagicMock()
        mock_vector.tolist.return_value = [0.1]
        mock_embedder.encode.return_value = mock_vector

        chunk = {"url_hash": "hA", "chunk_index": 0, "text": "kinh tế VN"}
        mock_qdrant.query_points.return_value = _make_qdrant_response([chunk])

        with patch("backend.qdrant_service.rerank_documents", new_callable=AsyncMock) as mock_rerank, \
             patch("backend.qdrant_service._enrich_with_full_article_chunks", new_callable=AsyncMock) as mock_enrich:
            mock_rerank.return_value = [chunk]
            mock_enrich.return_value = [chunk]

            await search_articles(query="kinh tế Việt Nam", limit=5)

        mock_fallback.assert_not_called()


# ===========================================================================
# Tests: chat endpoint — xử lý _is_fallback flag
# ===========================================================================

class TestChatEndpointFallbackHandling:
    """
    Kiểm tra rằng chat endpoint phân biệt đúng kết quả fallback vs kết quả thường
    và truyền system prompt khác nhau cho LLM.
    """

    def setup_method(self):
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.config import settings
        settings.gemini_api_key = "fake_key"
        self.client = TestClient(app)

    @patch("backend.routers.chat.search_articles", new_callable=AsyncMock)
    @patch("backend.routers.chat.generate_gemini_content_with_tools", new_callable=AsyncMock)
    def test_fallback_results_produce_suggestion_reply(self, mock_gemini, mock_search):
        """
        Khi search_articles trả về chunks có _is_fallback=True,
        Gemini phải nhận system_instruction chứa 'KHÔNG tìm được kết quả chính xác'
        (chế độ gợi ý, không phải trả lời trực tiếp).
        """
        fallback_chunks = [
            {
                "article_title": "Bài về vàng",
                "site": "cafef",
                "text": "Nội dung bài vàng",
                "article_url": "https://cafef.vn/vang",
                "_is_fallback": True,
            }
        ]
        mock_search.return_value = (fallback_chunks, True)
        mock_gemini.return_value = "Không tìm thấy chính xác, đây là gợi ý..."

        response = self.client.post("/api/chat", json={
            "message": "Giá vàng ngày 1/1/2020?",
            "history": [],
            "cached_articles": [],
        })

        assert response.status_code == 200

        # Kiểm tra Gemini nhận được system prompt đúng chế độ fallback
        call_kwargs = mock_gemini.call_args.kwargs
        system_instr = call_kwargs.get("system_instruction", "")
        assert "KHÔNG tìm được kết quả chính xác" in system_instr
        assert "GỢI Ý" in system_instr
        assert "TUYỆT ĐỐI KHÔNG tự suy diễn" in system_instr

    @patch("backend.routers.chat.search_articles", new_callable=AsyncMock)
    @patch("backend.routers.chat.generate_gemini_content_with_tools", new_callable=AsyncMock)
    def test_normal_results_produce_standard_context_prompt(self, mock_gemini, mock_search):
        """
        Khi chunks không có _is_fallback, system_instruction là chế độ RAG bình thường.
        """
        normal_chunks = [
            {
                "article_title": "Tin vàng hôm nay",
                "site": "cafef",
                "text": "Giá vàng tăng mạnh...",
                "article_url": "https://cafef.vn/tin-vang",
            }
        ]
        mock_search.return_value = (normal_chunks, False)
        mock_gemini.return_value = "Giá vàng hôm nay tăng 5%."

        response = self.client.post("/api/chat", json={
            "message": "Giá vàng hôm nay?",
            "history": [],
            "cached_articles": [],
        })

        assert response.status_code == 200

        call_kwargs = mock_gemini.call_args.kwargs
        system_instr = call_kwargs.get("system_instruction", "")
        assert "NGỮ CẢNH" in system_instr
        # Không phải chế độ fallback
        assert "KHÔNG tìm được kết quả chính xác" not in system_instr

    @patch("backend.routers.chat.search_articles", new_callable=AsyncMock)
    @patch("backend.routers.chat.generate_gemini_content_with_tools", new_callable=AsyncMock)
    def test_fallback_articles_are_cached_for_next_turn(self, mock_gemini, mock_search):
        """
        Chunks fallback phải được trả về trong cached_articles để lượt sau
        không mất ngữ cảnh.
        """
        fallback_chunks = [
            {
                "article_title": "Bài gợi ý",
                "site": "vnexpress",
                "text": "...",
                "article_url": "https://vnexpress.net/goi-y",
                "_is_fallback": True,
            }
        ]
        mock_search.return_value = (fallback_chunks, True)
        mock_gemini.return_value = "Đây là gợi ý cho bạn."

        response = self.client.post("/api/chat", json={
            "message": "Câu hỏi hiếm",
            "history": [],
            "cached_articles": [],
        })

        assert response.status_code == 200
        data = response.json()
        assert len(data["cached_articles"]) == 1
        assert data["cached_articles"][0]["article_title"] == "Bài gợi ý"
