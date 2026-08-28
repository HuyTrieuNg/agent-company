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
  Newspaper,
  X,
  TriangleAlert,
  Inbox,
  Calendar,
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

  const activeFiltersCount = [
    Boolean(selectedCategory),
    Boolean(selectedSite),
    Boolean(dateFrom || dateTo),
    Boolean(activeQuery),
  ].filter(Boolean).length;

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
    <div className="min-h-full bg-(--bg-canvas) text-(--text-primary) pb-28">
      {/* Top Banner & Header */}
      <header className="sticky top-0 z-30 border-b border-(--border-default) bg-(--bg-surface) px-4 py-3.5 md:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
                <Newspaper className="h-4 w-4" />
              </div>
              <h1 className="text-base md:text-lg font-bold tracking-tight text-(--text-primary)">
                Tin Tức & Báo Chí Thị Trường
              </h1>
            </div>
            <p className="text-xs text-(--text-secondary) mt-0.5">
              Dữ liệu từ Vector DB Qdrant, phân tích ngữ nghĩa và ghim vào Context Chatbot AI.
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm kiếm ngữ nghĩa (Semantic search)..."
              className="pl-8 pr-8 text-xs rounded-lg"
              aria-label="Tìm kiếm bài báo theo ngữ nghĩa"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-(--text-tertiary)" />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-2.5 text-(--text-tertiary) hover:text-(--text-primary) cursor-pointer"
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-6">
        {/* Category Pills & Filters Bar */}
        <div className="flex flex-col gap-3.5 border-b border-(--border-default) pb-5">
          {/* Categories Segmented Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <Button
              variant={selectedCategory === "" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedCategory("");
                setPage(1);
              }}
              className="shrink-0 rounded-lg text-xs"
            >
              Tất cả {totalRetrieved > 0 && selectedCategory === "" ? `(${totalRetrieved})` : ""}
            </Button>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <Button
                  key={cat}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setPage(1);
                  }}
                  className="shrink-0 rounded-lg text-xs"
                >
                  {cat}
                </Button>
              );
            })}
          </div>

          {/* Secondary Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Site Dropdown */}
              <div className="w-44">
                <Select
                  value={selectedSite || "ALL"}
                  onValueChange={(val) => {
                    setSelectedSite(val === "ALL" ? "" : val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
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

              {/* Date Filters with Popover & presets */}
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

              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs text-(--text-secondary) hover:text-(--status-negative) gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Xóa bộ lọc ({activeFiltersCount})</span>
                </Button>
              )}
            </div>

            {/* Total count & pinned summary */}
            <div className="flex items-center gap-2 text-xs text-(--text-secondary)">
              {isFetching && <span className="text-(--action-primary) animate-pulse">Đang cập nhật...</span>}
              {pinnedArticles.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContextDrawerOpen(true)}
                  className="gap-1.5 text-xs text-(--text-secondary) hover:text-(--text-primary)"
                >
                  <Bookmark className="h-3.5 w-3.5 text-(--action-primary)" />
                  <span>{pinnedArticles.length} bài trong Context</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-(--border-default) bg-(--bg-surface) p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
                <Skeleton className="h-5 w-full rounded" />
                <Skeleton className="h-4 w-4/5 rounded" />
                <Skeleton className="h-14 w-full rounded" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-7 w-24 rounded" />
                  <Skeleton className="h-7 w-28 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--status-negative)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-negative)_8%,transparent)] p-6 text-center text-xs text-(--status-negative) space-y-2.5">
            <div className="flex items-center justify-center gap-2">
              <TriangleAlert className="h-4 w-4 text-(--status-negative)" />
              <p className="text-sm font-semibold">Không thể tải danh sách bài báo</p>
            </div>
            <p className="text-(--text-secondary)">{(error as Error)?.message || "Vui lòng thử lại sau."}</p>
            <Button variant="outline" size="sm" onClick={() => handleResetFilters()} className="mt-2">
              Tải lại
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && articles.length === 0 && (
          <div className="py-20 text-center space-y-3 rounded-lg border border-(--border-default) bg-(--bg-surface) p-8">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-(--bg-subtle) text-(--text-tertiary)">
              <Inbox className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-(--text-primary)">Không tìm thấy bài báo nào phù hợp</h3>
            <p className="text-xs text-(--text-secondary) max-w-sm mx-auto">
              Hãy thử điều chỉnh từ khóa tìm kiếm ngữ nghĩa hoặc làm mới bộ lọc theo ngày và nguồn tin.
            </p>
            <Button variant="outline" size="sm" onClick={handleResetFilters} className="mt-2">
              Khôi phục tất cả bộ lọc
            </Button>
          </div>
        )}

        {/* Articles Grid */}
        {!isLoading && !isError && articles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {articles.map((article, idx) => {
              const pinned = isPinned(article);
              return (
                <Card
                  key={article.id || article.url_hash || idx}
                  className={`group relative flex flex-col justify-between rounded-lg transition-colors ${
                    pinned
                      ? "border-(--border-strong) bg-(--bg-selected)/35"
                      : "border-(--border-default) bg-(--bg-surface) hover:border-(--border-strong)"
                  }`}
                >
                  <CardHeader className="p-4 pb-2.5">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <Badge variant="secondary" className="bg-(--bg-subtle) text-(--text-secondary) uppercase tracking-wider font-semibold text-[10px]">
                          {article.site || "Tin tức"}
                        </Badge>
                        {article.category && (
                          <span className="text-(--text-tertiary) text-[11px] truncate max-w-[120px]">
                            • {article.category}
                          </span>
                        )}
                      </div>

                      {article.published_at && (
                        <span className="flex items-center gap-1 text-(--text-tertiary) text-[11px] shrink-0">
                          <Calendar className="h-3 w-3" />
                          {article.published_at}
                        </span>
                      )}
                    </div>

                    <CardTitle className="text-xs md:text-sm font-semibold text-(--text-primary) line-clamp-2 leading-snug">
                      {article.title}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-4 pt-0 flex-1">
                    <p className="text-xs text-(--text-secondary) leading-relaxed line-clamp-3">
                      {article.sapo || "Không có đoạn tóm tắt bài viết."}
                    </p>
                  </CardContent>

                  <CardFooter className="p-4 pt-2.5 border-t border-(--border-default) flex items-center justify-between gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openArticleSheet(article)}
                          className="gap-1.5 text-xs text-(--text-secondary) hover:text-(--text-primary)"
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
                          variant={pinned ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTogglePin(article)}
                          className="gap-1.5 text-xs"
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
          <div className="flex items-center justify-between border-t border-(--border-default) pt-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs text-(--text-secondary) bg-(--bg-subtle)">
                Trang {page}
              </Badge>
              <span className="text-xs text-(--text-tertiary)">
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
