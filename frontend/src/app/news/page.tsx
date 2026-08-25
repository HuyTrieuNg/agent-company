"use client";

import { useState, useMemo } from "react";
import { useNewsArticles, useNewsCategories } from "@/hooks/useNews";
import { useContextStore } from "@/stores/contextStore";
import { useUiStore } from "@/stores/uiStore";
import { NewsArticleItem } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DateRangeFilter from "@/components/news/DateRangeFilter";
import {
  Search,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export default function NewsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [activeQuery, setActiveQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const { isPinned, togglePinArticle, pinnedArticles } = useContextStore();
  const { openArticleSheet, setContextDrawerOpen } = useUiStore();

  const { data: categoriesData } = useNewsCategories();

  const queryParams = useMemo(
    () => ({
      query: activeQuery || undefined,
      category: selectedCategory || undefined,
      site: selectedSite || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page,
      limit: 12,
    }),
    [activeQuery, selectedCategory, selectedSite, dateFrom, dateTo, page]
  );

  const { data: newsData, isLoading, isError, error, isFetching } = useNewsArticles(queryParams);

  const categories = categoriesData?.categories || [];
  const sites = categoriesData?.sites || [];
  const articles = newsData?.articles || [];
  const totalRetrieved = newsData?.total_retrieved || 0;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setActiveQuery("");
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedCategory("");
    setSelectedSite("");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setActiveQuery("");
    setPage(1);
  };

  const handleTogglePin = (art: NewsArticleItem) => {
    const added = togglePinArticle(art);
    if (added) {
      toast.success("Đã ghim bài báo vào Context Chatbot", {
        description: art.title,
      });
    } else {
      toast.info("Đã bỏ ghim bài báo khỏi Context", {
        description: art.title,
      });
    }
  };

  return (
    <div className="min-h-full bg-[#07070a] text-slate-100 pb-28">
      {/* Top Banner & Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07070a]/90 backdrop-blur-xl px-4 py-4 md:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 text-sm font-bold shadow-xs">
                📰
              </span>
              <h1 className="text-xl font-bold tracking-tight bg-linear-to-r from-white via-slate-100 to-violet-300 bg-clip-text text-transparent">
                Tin Tức & Báo Chí Qdrant
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Khám phá bài báo tài chính từ Vector DB, phân tích ngữ nghĩa và ghim vào Context Chatbot AI.
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm kiếm ngữ nghĩa (Semantic search)..."
              className="pl-9 pr-9 bg-white/5 border-white/10 text-xs rounded-xl focus-visible:ring-violet-500"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-6">
        {/* Category Pills & Filters Bar */}
        <div className="flex flex-col gap-4 border-b border-white/5 pb-5">
          {/* Categories Pill Scroll */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            <Button
              variant={selectedCategory === "" ? "default" : "secondary"}
              size="sm"
              onClick={() => {
                setSelectedCategory("");
                setPage(1);
              }}
              className={`shrink-0 rounded-xl text-xs font-semibold ${
                selectedCategory === ""
                  ? "bg-violet-600 text-white shadow-md shadow-violet-500/25 hover:bg-violet-700"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tất cả {totalRetrieved > 0 && selectedCategory === "" ? `(${totalRetrieved})` : ""}
            </Button>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <Button
                  key={cat}
                  variant={isSelected ? "default" : "secondary"}
                  size="sm"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-xl text-xs font-semibold ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-md shadow-violet-500/25 hover:bg-violet-700"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {cat}
                </Button>
              );
            })}
          </div>

          {/* Secondary Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Site Dropdown */}
              <div className="w-48">
                <Select
                  value={selectedSite || "ALL"}
                  onValueChange={(val) => {
                    setSelectedSite(val === "ALL" ? "" : val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                    <SelectValue placeholder="Tất cả nguồn tin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả nguồn tin</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Filters with shadcn Popover & presets */}
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onApply={(from, to) => {
                  setDateFrom(from);
                  setDateTo(to);
                  setPage(1);
                }}
                onReset={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              />

              {(selectedCategory || selectedSite || dateFrom || dateTo || activeQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs text-slate-400 hover:text-red-400 gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Xóa bộ lọc</span>
                </Button>
              )}
            </div>

            {/* Total count & pinned summary */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {isFetching && <span className="text-violet-400 animate-pulse">Đang cập nhật...</span>}
              {pinnedArticles.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setContextDrawerOpen(true)}
                  className="gap-1.5 text-xs text-violet-300 border border-violet-500/20"
                >
                  <Bookmark className="h-3.5 w-3.5 text-violet-400" />
                  <span>{pinnedArticles.length} bài trong Context</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-20 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <Skeleton className="h-5 w-full rounded-md" />
                <Skeleton className="h-4 w-4/5 rounded-md" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-7 w-24 rounded-lg" />
                  <Skeleton className="h-7 w-28 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-xs text-red-300 space-y-2">
            <p className="text-sm font-semibold">⚠️ Không thể tải danh sách bài báo</p>
            <p>{(error as Error)?.message || "Vui lòng thử lại sau."}</p>
            <Button variant="outline" size="sm" onClick={() => handleResetFilters()} className="mt-2">
              Tải lại
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && articles.length === 0 && (
          <div className="py-20 text-center space-y-3">
            <span className="text-4xl">📭</span>
            <h3 className="text-sm font-bold text-slate-200">Không tìm thấy bài báo nào phù hợp</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Hãy thử điều chỉnh từ khóa tìm kiếm ngữ nghĩa hoặc làm mới bộ lọc theo ngày và nguồn tin.
            </p>
            <Button variant="outline" size="sm" onClick={handleResetFilters} className="mt-2">
              Khôi phục tất cả bộ lọc
            </Button>
          </div>
        )}

        {/* Articles Grid */}
        {!isLoading && !isError && articles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((article, idx) => {
              const pinned = isPinned(article);
              return (
                <Card
                  key={article.id || article.url_hash || idx}
                  className={`group relative flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${
                    pinned
                      ? "border-violet-500/50 bg-gradient-to-b from-violet-950/20 to-[#0d0d16] shadow-lg shadow-violet-500/10"
                      : "border-white/8 bg-[#0c0c14] hover:border-white/20 hover:bg-[#11111c]"
                  }`}
                >
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="bg-white/8 text-slate-300 uppercase tracking-wider font-bold">
                          {article.site || "Tin tức"}
                        </Badge>
                        {article.category && (
                          <span className="text-slate-500 text-[11px] truncate max-w-[120px]">
                            • {article.category}
                          </span>
                        )}
                      </div>

                      {article.published_at && (
                        <span className="text-slate-500 text-[11px]">{article.published_at}</span>
                      )}
                    </div>

                    <CardTitle className="text-sm font-bold text-slate-100 group-hover:text-violet-300 transition-colors line-clamp-2 leading-snug">
                      {article.title}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-5 pt-0 flex-1">
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                      {article.sapo || "Không có đoạn tóm tắt bài viết."}
                    </p>
                  </CardContent>

                  <CardFooter className="p-5 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openArticleSheet(article)}
                          className="gap-1.5 text-xs text-slate-400 hover:text-white"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>Đọc bài viết</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Xem toàn văn bài viết từ Vector DB</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={pinned ? "default" : "secondary"}
                          size="sm"
                          onClick={() => handleTogglePin(article)}
                          className={`gap-1.5 text-xs font-semibold ${
                            pinned
                              ? "bg-violet-600 text-white shadow-md shadow-violet-500/30 hover:bg-violet-700"
                              : "text-slate-300 hover:bg-violet-600/20 hover:text-violet-300"
                          }`}
                        >
                          {pinned ? (
                            <>
                              <BookmarkCheck className="h-3.5 w-3.5" />
                              <span>Đã ghim</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="h-3.5 w-3.5" />
                              <span>+ Ghim Context</span>
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {pinned ? "Bỏ ghim khỏi Context Chatbot AI" : "Ghim bài báo này vào Context Chatbot AI"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && !isError && articles.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/5 pt-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs text-slate-400">
                Trang {page}
              </Badge>
              <span className="text-xs text-slate-500">
                • Đang hiển thị {articles.length} bài viết
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Trang trước</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={articles.length < 12}
                onClick={() => setPage((p) => p + 1)}
                className="gap-1 text-xs"
              >
                <span>Trang tiếp</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
