"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChatContext } from "@/lib/ChatContext";
import {
  fetchNewsArticles,
  fetchNewsCategories,
  fetchFullArticles,
  NewsArticleItem,
  FullArticleItem,
} from "@/lib/api";

export default function NewsPage() {
  const router = useRouter();
  const { pinnedArticles, togglePinArticle, removePinnedArticle, clearPinnedArticles } =
    useChatContext();

  const [articles, setArticles] = useState<NewsArticleItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sites, setSites] = useState<{ code: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalRetrieved, setTotalRetrieved] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Full article modal state
  const [readingArticle, setReadingArticle] = useState<FullArticleItem | null>(null);
  const [loadingFull, setLoadingFull] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();

  // Load initial categories & sites
  useEffect(() => {
    fetchNewsCategories()
      .then((res) => {
        setCategories(res.categories || []);
        setSites(res.sites || []);
      })
      .catch((err) => console.error("Error loading categories:", err));
  }, []);

  // Fetch articles on filter change
  const loadArticles = async (
    queryStr = searchQuery,
    cat = selectedCategory,
    siteCode = selectedSite,
    dFrom = dateFrom,
    dTo = dateTo,
    pageNum = page
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNewsArticles({
        query: queryStr || undefined,
        category: cat || undefined,
        site: siteCode || undefined,
        date_from: dFrom || undefined,
        date_to: dTo || undefined,
        page: pageNum,
        limit: 12,
      });
      setArticles(res.articles || []);
      setTotalRetrieved(res.total_retrieved || 0);
    } catch (err: unknown) {
      setError((err as Error).message || "Không thể tải danh sách bài báo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles(searchQuery, selectedCategory, selectedSite, dateFrom, dateTo, page);
  }, [selectedCategory, selectedSite, dateFrom, dateTo, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadArticles(searchQuery, selectedCategory, selectedSite, dateFrom, dateTo, 1);
  };

  const handleReadFullArticle = async (article: NewsArticleItem) => {
    if (!article.url_hash) {
      setReadingArticle({ ...article, content: article.sapo });
      return;
    }
    setLoadingFull(true);
    try {
      const res = await fetchFullArticles([article.url_hash]);
      if (res.articles && res.articles.length > 0) {
        setReadingArticle(res.articles[0]);
      } else {
        setReadingArticle({ ...article, content: article.sapo });
      }
    } catch (err) {
      console.error("Failed to load full article:", err);
      setReadingArticle({ ...article, content: article.sapo });
    } finally {
      setLoadingFull(false);
    }
  };

  const isPinned = (art: NewsArticleItem) => {
    const key = art.url_hash || art.url;
    return pinnedArticles.some((p) => (p.url_hash || p.url) === key);
  };

  return (
    <div className="min-h-full bg-[#07070a] text-slate-100 pb-28 transition-all">

      {/* Top Banner & Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07070a]/80 backdrop-blur-xl px-4 py-4 md:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#8b5cf6]/20 text-[#a78bfa] text-xs font-bold">
                📰
              </span>
              <h1 className="text-xl font-bold tracking-tight bg-linear-to-r from-white via-slate-100 to-[#a78bfa] bg-clip-text text-transparent">
                Trang Tin Tức & Báo Chí Qdrant
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Duyệt bài báo từ Vector DB, xem nội dung chi tiết và ghim bài viết làm Context cho Chatbot AI.
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm ngữ nghĩa (Semantic search)..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-10 text-xs text-white placeholder-slate-500 focus:border-[#8b5cf6] focus:bg-white/10 focus:outline-none transition-all"
            />
            <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  loadArticles("", selectedCategory, selectedSite, dateFrom, dateTo, 1);
                }}
                className="absolute right-3 top-2 text-xs text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-6">
        {/* Category Pills & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                setSelectedCategory("");
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                selectedCategory === ""
                  ? "bg-[#8b5cf6] text-white shadow-[0_2px_10px_rgba(139,92,246,0.3)]"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              }`}
            >
              Tất cả
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-[#8b5cf6] text-white shadow-[0_2px_10px_rgba(139,92,246,0.3)]"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Filters: Site & Date Range */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Filter */}
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0e0e15] p-1 text-xs">
              <span className="px-2 text-slate-400 font-medium hidden sm:inline">📅 Ngày:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 focus:border-[#8b5cf6] focus:outline-none cursor-pointer"
                placeholder="Từ ngày"
                title="Từ ngày"
              />
              <span className="text-slate-500">-</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 focus:border-[#8b5cf6] focus:outline-none cursor-pointer"
                placeholder="Đến ngày"
                title="Đến ngày"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setPage(1);
                  }}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-white/10 hover:text-red-400 cursor-pointer"
                  title="Xóa bộ lọc ngày"
                >
                  ✕ Xóa
                </button>
              )}
            </div>

            {/* Site Filter Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">Nguồn tin:</span>
              <select
                value={selectedSite}
                onChange={(e) => {
                  setSelectedSite(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-white/10 bg-[#0e0e15] px-3 py-1.5 text-xs text-slate-300 focus:border-[#8b5cf6] focus:outline-none cursor-pointer"
              >
                <option value="">Tất cả nguồn tin</option>
                {sites.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-56 rounded-2xl border border-white/5 bg-white/3 p-5 space-y-3">
                <div className="h-4 w-1/3 rounded bg-white/10" />
                <div className="h-6 w-5/6 rounded bg-white/10" />
                <div className="h-16 w-full rounded bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center text-xs text-red-300">
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm font-semibold text-slate-300">Không tìm thấy bài báo nào</p>
            <p className="text-xs text-slate-500 mt-1">
              Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các bộ lọc danh mục/nguồn tin.
            </p>
          </div>
        )}

        {/* Articles Grid */}
        {!loading && !error && articles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((article, idx) => {
              const pinned = isPinned(article);
              return (
                <div
                  key={article.id || idx}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-1 ${
                    pinned
                      ? "border-[#8b5cf6]/50 bg-linear-to-b from-[#8b5cf6]/10 to-[#0e0e18] shadow-[0_4px_20px_rgba(139,92,246,0.15)]"
                      : "border-white/8 bg-[#0c0c12] hover:border-white/20 hover:bg-[#11111a]"
                  }`}
                >
                  <div>
                    {/* Top Metadata */}
                    <div className="flex items-center justify-between text-[11px] mb-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-white/8 px-2 py-0.5 font-semibold text-slate-300 uppercase tracking-wider">
                          {article.site || "Tin tức"}
                        </span>
                        {article.category && (
                          <span className="text-slate-500">• {article.category}</span>
                        )}
                      </div>
                      {article.published_at && (
                        <span className="text-slate-500">{article.published_at}</span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-[#a78bfa] transition-colors leading-snug line-clamp-2 mb-2">
                      {article.title}
                    </h3>

                    {/* Sapo */}
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 mb-4">
                      {article.sapo}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-2">
                    <button
                      onClick={() => handleReadFullArticle(article)}
                      className="text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>📖 Đọc bài viết</span>
                    </button>

                    <button
                      onClick={() => togglePinArticle(article)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                        pinned
                          ? "bg-[#8b5cf6] text-white shadow-[0_2px_10px_rgba(139,92,246,0.4)]"
                          : "bg-white/5 text-slate-300 hover:bg-[#8b5cf6]/20 hover:text-[#a78bfa]"
                      }`}
                    >
                      {pinned ? "✓ Đã ghim Context" : "+ Thêm Context"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && articles.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/5 pt-6">
            <span className="text-xs text-slate-500">
              Trang {page} • Đã tải {articles.length} bài viết
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 disabled:opacity-30 hover:bg-white/10 cursor-pointer"
              >
                ← Trang trước
              </button>
              <button
                disabled={articles.length < 12}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 disabled:opacity-30 hover:bg-white/10 cursor-pointer"
              >
                Trang tiếp →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Full Article Modal */}
      {(readingArticle || loadingFull) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative max-h-[85vh] w-full max-w-3xl flex flex-col rounded-2xl border border-white/15 bg-[#0d0d14] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded bg-[#8b5cf6]/20 px-2 py-0.5 font-bold text-[#a78bfa] uppercase">
                  {readingArticle?.site || "Bài báo"}
                </span>
                {readingArticle?.published_at && (
                  <span>• {readingArticle.published_at}</span>
                )}
              </div>
              <button
                onClick={() => setReadingArticle(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 custom-scrollbar">
              {loadingFull ? (
                <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
                  ⏳ Đang tải toàn bộ nội dung bài báo từ Qdrant...
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-white leading-snug">
                    {readingArticle?.title}
                  </h2>

                  {readingArticle?.author && (
                    <p className="text-xs text-slate-500">Tác giả: {readingArticle.author}</p>
                  )}

                  {readingArticle?.url && (
                    <a
                      href={readingArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#a78bfa] hover:underline"
                    >
                      🔗 Xem bài gốc trên website
                    </a>
                  )}

                  <div className="my-4 border-t border-white/8" />

                  <div className="prose prose-invert prose-sm max-w-none space-y-4 text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {readingArticle?.content}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {readingArticle && !loadingFull && (
              <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 bg-[#08080e]">
                <span className="text-xs text-slate-500">
                  {isPinned(readingArticle)
                    ? "✓ Bài báo này đã được ghim trong Context Chatbot"
                    : "Chưa ghim vào Context"}
                </span>
                <button
                  onClick={() => togglePinArticle(readingArticle)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    isPinned(readingArticle)
                      ? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                      : "bg-[#8b5cf6] text-white shadow-[0_2px_12px_rgba(139,92,246,0.4)]"
                  }`}
                >
                  {isPinned(readingArticle) ? "Bỏ ghim khỏi Context" : "+ Ghim vào Chat Context"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Context Drawer */}
      {pinnedArticles.length > 0 && (
        <div className="fixed bottom-4 left-16 right-4 md:left-64 md:right-8 z-40 animate-slide-up">
          <div className="mx-auto max-w-5xl rounded-2xl border border-[#8b5cf6]/40 bg-[#0f0e1a]/95 p-4 shadow-[0_8px_32px_rgba(139,92,246,0.25)] backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8b5cf6] text-white font-bold text-sm shadow-md">
                📌 {pinnedArticles.length}
              </div>
              <div className="flex items-center gap-2">
                {pinnedArticles.map((art) => (
                  <div
                    key={art.url_hash || art.url}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200"
                  >
                    <span className="max-w-[150px] truncate font-medium">{art.title}</span>
                    <button
                      onClick={() => removePinnedArticle(art.url_hash || art.url || "")}
                      className="text-slate-400 hover:text-red-400 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={clearPinnedArticles}
                className="rounded-xl px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
              >
                Xóa tất cả
              </button>
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-2 rounded-xl bg-linear-to-r from-[#8b5cf6] to-[#06b6d4] px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition-all cursor-pointer"
              >
                <span>Bắt đầu Chat với Context này</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
