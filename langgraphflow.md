# Research Agent — LangGraph Flow

```
User Query
    │
    ▼
┌─────────────┐
│   Planner   │  Phân tích intent: topic, keywords, category, max_sources
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Source Selector  │  Đọc DB → chọn sources theo category + priority
└───────┬──────────┘
        │
        ▼
┌──────────────────┐
│  Cache Checker   │  Tách sources thành: cached ↔ cần fetch
└───────┬──────────┘
        │
        ▼
┌──────────────┐
│ Search Node  │  httpx fetch trang chủ → strip HTML → LLM extract URLs
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ Fetch Article Node   │  httpx fetch song song (semaphore=5) → parse bài
│ (concurrent, max 5)  │  → lưu cache SQLite
└──────────┬───────────┘
           │
           ▼
┌────────────────────┐
│ Relevance Filter   │  LLM chấm điểm 0-1 từng bài → giữ score ≥ 0.4
└──────────┬─────────┘
           │
     ┌─────┴──────┐
     │            │
   (đủ bài)   (quá ít bài, retry < 1)
     │            │
     │      ┌─────▼──────┐
     │      │ Search     │  retry_count += 1
     │      │ Retry Node │  ──────→ quay lại Search Node
     │      └────────────┘
     │
     ▼
┌──────────────────────┐
│  Context Builder     │  Ghi sources.md + articles.md (token-aware, ≤50k chars)
│  context/{session}/  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────┐
│   Summarizer     │  LLM đọc Markdown context → viết báo cáo cấu trúc
└──────────┬───────┘
           │
           ▼
┌──────────────────┐
│   Report Node    │  Lưu report.md + cập nhật DB session → status=done
└──────────┬───────┘
           │
           ▼
        Response
```

## State

```python
ResearchState:
  query, session_id          # input
  intent                     # từ Planner
  selected_sources           # từ SourceSelector
  cached_articles            # từ CacheChecker
  sources_to_fetch           # từ CacheChecker
  found_urls                 # từ SearchNode (Annotated, operator.add)
  raw_articles               # từ FetchArticle (Annotated, operator.add)
  relevant_articles          # từ RelevanceFilter
  context_path               # từ ContextBuilder
  report                     # từ Summarizer
  retry_count, error,        # control
  progress_step              # SSE streaming
```

## SSE Progress Events

Frontend nhận real-time updates qua `GET /api/research/{session_id}/stream`:

| Event | Ý nghĩa |
|-------|---------|
| `📋 Đã phân tích...` | Planner xong |
| `🔍 Tìm kiếm trên N nguồn` | SourceSelector xong |
| `⚡ Cache: X có sẵn, Y cần tải` | CacheChecker xong |
| `🔗 Tìm được N bài viết` | SearchNode xong |
| `📰 Đã đọc N bài viết` | FetchArticle xong |
| `✅ Lọc được N bài` | RelevanceFilter xong |
| `📄 Đã tổng hợp context` | ContextBuilder xong |
| `✍️ Đang viết báo cáo...` | Summarizer xong |
| `🎉 Báo cáo hoàn thành!` | ReportNode xong |