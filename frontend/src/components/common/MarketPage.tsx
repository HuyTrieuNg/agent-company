"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Calendar,
  ExternalLink,
  Info,
  Newspaper,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewsArticleItem } from "@/lib/api";
import { useContextStore } from "@/stores/contextStore";
import { cn } from "@/lib/utils";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface MarketTheme {
  iconGradient?: string;
  titleGradient?: string;
  liveBadgeClass?: string;
  liveDotClass?: string;
  activePillClass?: string;
  selectedRowClass?: string;
  newsHeadingIconClass?: string;
  newsSourceBadgeClass?: string;
  newsTitleHoverClass?: string;
  sourceLinkClass?: string;
  pinBtnActiveClass?: string;
  pinBtnHoverClass?: string;
  pinnedCardClass?: string;
}

export type MetricTone = "emerald" | "red" | "cyan" | "amber" | "neutral";

export interface MarketMetric {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  tone?: MetricTone;
  trend?: "up" | "down";
  valueClass?: string;
}

export interface MarketRange {
  low: number;
  high: number;
  current: number;
  format: (value: number) => string;
}

export interface MarketNewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  url: string;
}

export interface MarketColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  render: (item: T) => ReactNode;
}

export interface MarketPageProps<T> {
  theme?: MarketTheme;
  icon: LucideIcon;
  title: string;
  subtitle: string;

  loading?: boolean;
  error?: Error | null;
  errorLabel?: string;
  updatedAt?: string;

  items: T[];
  getItemCode: (item: T) => string;
  selectedCode: string;
  onSelectCode: (code: string) => void;
  renderPill: (item: T, selected: boolean) => ReactNode;

  metrics: MarketMetric[];
  range?: MarketRange | null;

  chartSlot: ReactNode;

  tableTitle: string;
  tableCountLabel: string;
  columns: MarketColumn<T>[];

  newsTitle: string;
  news: MarketNewsItem[];
  toArticle: (item: MarketNewsItem) => NewsArticleItem;
  pinToastLabels: { added: string; removed: string };
}

const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function ChangeBadge({
  percent,
  selected = false,
  className,
}: {
  percent: number;
  selected?: boolean;
  className?: string;
}) {
  const positive = percent >= 0;
  return (
    <Badge
      variant={positive ? "success" : "destructive"}
      className={cn(
        "px-1.5 py-0 text-[10px] font-semibold tabular-nums inline-flex items-center gap-0.5",
        selected && "border-(--action-primary) bg-(--bg-selected) text-(--action-primary)",
        className
      )}
    >
      {positive ? "+" : ""}
      {percent}%
    </Badge>
  );
}

function MetricCard({ metric }: { metric: MarketMetric }) {
  return (
    <Card className="border border-(--border-default) bg-(--bg-surface) p-4 rounded-xl shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 pb-1.5">
        <span className="text-xs font-medium text-(--text-secondary)">
          {metric.label}
        </span>
        <span className="flex items-center gap-1.5">
          {metric.tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info
                  className="h-3.5 w-3.5 cursor-help text-(--text-tertiary) hover:text-(--text-secondary) transition-colors"
                  aria-label={metric.tooltip}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{metric.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {metric.trend &&
            (metric.trend === "up" ? (
              <TrendingUp className="h-3.5 w-3.5 text-(--status-positive)" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-(--status-negative)" aria-hidden="true" />
            ))}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <p
          className={cn(
            "text-xl font-bold tabular-nums text-(--text-primary) md:text-2xl",
            metric.valueClass
          )}
        >
          {metric.value}
        </p>
        {metric.sub && (
          <p className="mt-1 text-[11px] text-(--text-tertiary)">{metric.sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RangeStrip({ range }: { range: MarketRange }) {
  const valid =
    [range.low, range.high, range.current].every((n) => Number.isFinite(n)) &&
    range.high > range.low;
  const pct = valid
    ? Math.min(
        100,
        Math.max(0, ((range.current - range.low) / (range.high - range.low)) * 100)
      )
    : 50;

  return (
    <Card className="border border-(--border-default) bg-(--bg-surface) p-4 rounded-xl shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-1 text-(--text-secondary)">
          <ArrowDownRight className="h-3.5 w-3.5 text-(--status-negative)" aria-hidden="true" />
          <span className="text-(--text-tertiary)">Thấp nhất:</span>
          <span className="font-semibold tabular-nums text-(--text-primary)">
            {range.format(range.low)}
          </span>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-tertiary)">
          Biên độ dao động 24H
        </span>
        <span className="flex items-center gap-1 text-(--text-secondary)">
          <span className="text-(--text-tertiary)">Cao nhất:</span>
          <span className="font-semibold tabular-nums text-(--text-primary)">
            {range.format(range.high)}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 text-(--status-positive)" aria-hidden="true" />
        </span>
      </div>

      {/* Bullet / Range Track */}
      <div className="relative mt-3 h-2 rounded-full bg-(--bg-subtle) border border-(--border-default)">
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--bg-surface) bg-(--action-primary) shadow-sm"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-(--text-tertiary) tabular-nums">
        <span>0%</span>
        <span>
          Hiện tại: <strong className="text-(--text-primary)">{range.format(range.current)}</strong> ({pct.toFixed(0)}%)
        </span>
        <span>100%</span>
      </div>
    </Card>
  );
}

/* ─── Main template ────────────────────────────────────────────────────────── */

export default function MarketPage<T>({
  icon: Icon,
  title,
  subtitle,
  loading = false,
  error = null,
  errorLabel = "Lỗi khi kết nối hệ thống",
  updatedAt,
  items,
  getItemCode,
  selectedCode,
  onSelectCode,
  renderPill,
  metrics,
  range,
  chartSlot,
  tableTitle,
  tableCountLabel,
  columns,
  newsTitle,
  news,
  toArticle,
  pinToastLabels,
}: MarketPageProps<T>) {
  const { isPinned, togglePinArticle } = useContextStore();

  const handleTogglePin = (item: MarketNewsItem) => {
    const article = toArticle(item);
    const added = togglePinArticle(article);
    if (added) {
      toast.success(pinToastLabels.added, { description: item.title });
    } else {
      toast.info(pinToastLabels.removed, { description: item.title });
    }
  };

  return (
    <div className="flex h-full flex-col space-y-6 overflow-y-auto bg-(--bg-canvas) p-4 md:p-8 pb-28 text-(--text-primary)">
      {/* ── Page Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-(--border-default) pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-(--border-default) bg-(--bg-subtle) text-(--action-primary)">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-(--text-primary) md:text-2xl">
              {title}
            </h1>
            <p className="mt-0.5 text-xs text-(--text-secondary)">{subtitle}</p>
          </div>
        </div>

        {updatedAt && (
          <Badge
            variant="secondary"
            className="flex items-center gap-2 px-3 py-1 text-xs text-(--text-secondary)"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-(--status-positive)" />
            <span>Cập nhật: {updatedAt}</span>
          </Badge>
        )}
      </header>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--status-negative)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-negative)_10%,transparent)] p-4 text-xs text-(--status-negative)">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{(error as Error)?.message || errorLabel}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          {/* ── Asset Selection Segmented Controls / Pills ── */}
          <div className="flex flex-wrap gap-2 border-b border-(--border-default) pb-3.5">
            {items.map((item) => {
              const code = getItemCode(item);
              const isSelected = code === selectedCode;
              return (
                <button
                  key={code}
                  onClick={() => onSelectCode(code)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) focus-visible:ring-offset-1",
                    isSelected
                      ? "border-(--border-strong) bg-(--bg-surface) text-(--text-primary) shadow-xs font-semibold"
                      : "border-(--border-default) bg-(--bg-subtle) text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-surface) hover:text-(--text-primary)"
                  )}
                >
                  {renderPill(item, isSelected)}
                </button>
              );
            })}
          </div>

          {/* ── Key Metrics Cards ── */}
          {metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {metrics.map((metric) => (
                <MetricCard key={metric.key} metric={metric} />
              ))}
            </div>
          )}

          {/* ── 24H Range Strip ── */}
          {range && <RangeStrip range={range} />}

          {/* ── Interactive Historical Chart ── */}
          {chartSlot}

          {/* ── Comparison Table ── */}
          <Card className="space-y-4 border border-(--border-default) bg-(--bg-surface) p-4 md:p-5 rounded-xl shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
                {tableTitle}
              </CardTitle>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {items.length} {tableCountLabel}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-(--border-default) hover:bg-transparent">
                    {columns.map((col) => (
                      <TableHead
                        key={col.key}
                        className={cn(
                          "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase text-(--text-secondary)",
                          ALIGN_CLASS[col.align ?? "left"],
                          col.className
                        )}
                      >
                        {col.header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-(--border-default)">
                  {items.map((item) => {
                    const code = getItemCode(item);
                    const isSelected = code === selectedCode;
                    return (
                      <TableRow
                        key={code}
                        onClick={() => onSelectCode(code)}
                        className={cn(
                          "cursor-pointer border-b border-(--border-default) transition-colors hover:bg-(--bg-subtle)/60",
                          isSelected && "bg-(--bg-selected) font-semibold"
                        )}
                      >
                        {columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={cn(
                              "px-4 py-3 text-xs text-(--text-primary) tabular-nums",
                              ALIGN_CLASS[col.align ?? "left"],
                              col.className
                            )}
                          >
                            {col.render(item)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* ── Market News ── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
                <Newspaper
                  className="h-4 w-4 text-(--action-primary)"
                  aria-hidden="true"
                />
                <span>{newsTitle}</span>
              </h2>
              <Badge variant="secondary" className="text-xs text-(--text-secondary)">
                {news.length} bài viết
              </Badge>
            </div>

            {news.length === 0 ? (
              <Card className="flex flex-col items-center justify-center gap-2 border border-(--border-default) bg-(--bg-surface) py-12 text-(--text-tertiary) rounded-xl">
                <Newspaper className="h-6 w-6 text-(--text-tertiary)" aria-hidden="true" />
                <p className="text-xs">Chưa có tin tức cho thị trường này</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {news.map((item) => {
                  const article = toArticle(item);
                  const pinned = isPinned(article);
                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        "group relative flex flex-col justify-between border rounded-xl transition-colors duration-150",
                        pinned
                          ? "border-(--action-primary) bg-(--bg-selected)/25"
                          : "border-(--border-default) bg-(--bg-surface) hover:border-(--border-strong)"
                      )}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-semibold uppercase"
                          >
                            {item.source}
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-(--text-tertiary)">
                            <Calendar className="h-3 w-3" aria-hidden="true" />
                            {item.published_at}
                          </span>
                        </div>

                        <CardTitle className="line-clamp-2 text-sm font-semibold leading-snug text-(--text-primary) transition-colors group-hover:text-(--action-primary)">
                          {item.title}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="flex-1 p-4 pt-0">
                        <p className="line-clamp-3 text-xs leading-relaxed text-(--text-secondary)">
                          {item.summary}
                        </p>
                      </CardContent>

                      <CardFooter className="flex items-center justify-between gap-2 border-t border-(--border-default) p-4 pt-2.5">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-(--action-primary) hover:underline"
                        >
                          <span>Xem nguồn</span>
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={pinned ? "default" : "secondary"}
                              size="sm"
                              onClick={() => handleTogglePin(item)}
                              className="gap-1.5 text-xs font-medium"
                            >
                              {pinned ? (
                                <>
                                  <BookmarkCheck
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Đã ghim</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>+ Ghim Context</span>
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {pinned
                                ? "Bỏ ghim khỏi Context Chatbot AI"
                                : "Ghim tin tức này vào Context Chatbot AI"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
