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
  iconGradient: string;
  titleGradient: string;
  liveBadgeClass: string;
  liveDotClass: string;
  activePillClass: string;
  selectedRowClass: string;
  newsHeadingIconClass: string;
  newsSourceBadgeClass: string;
  newsTitleHoverClass: string;
  sourceLinkClass: string;
  pinBtnActiveClass: string;
  pinBtnHoverClass: string;
  pinnedCardClass: string;
}

export type MetricTone = "emerald" | "red" | "cyan" | "amber" | "neutral";

export interface MarketMetric {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  tone: MetricTone;
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
  theme: MarketTheme;
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

/* ─── Shared bits ──────────────────────────────────────────────────────────── */

const METRIC_TONES: Record<
  MetricTone,
  { card: string; label: string; info: string }
> = {
  emerald: {
    card: "border-emerald-500/20 bg-emerald-500/5",
    label: "text-emerald-400",
    info: "text-emerald-400/60",
  },
  red: {
    card: "border-red-500/20 bg-red-500/5",
    label: "text-red-400",
    info: "text-red-400/60",
  },
  cyan: {
    card: "border-cyan-500/20 bg-cyan-500/5",
    label: "text-cyan-400",
    info: "text-cyan-400/60",
  },
  amber: {
    card: "border-amber-500/20 bg-amber-500/5",
    label: "text-amber-400",
    info: "text-amber-400/60",
  },
  neutral: {
    card: "border-white/10 bg-white/5",
    label: "text-slate-400",
    info: "text-slate-400/60",
  },
};

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
      variant={selected ? "secondary" : positive ? "success" : "destructive"}
      className={cn(
        "px-1.5 py-0 text-[10px] font-bold tabular-nums",
        selected && "bg-black/20 text-slate-950 hover:bg-black/30",
        className
      )}
    >
      {positive ? "+" : ""}
      {percent}%
    </Badge>
  );
}

function MetricCard({ metric }: { metric: MarketMetric }) {
  const tone = METRIC_TONES[metric.tone];
  return (
    <Card className={cn("p-4 backdrop-blur-md", tone.card)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 pb-1">
        <span className={cn("text-xs font-semibold", tone.label)}>
          {metric.label}
        </span>
        <span className="flex items-center gap-1.5">
          {metric.tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info
                  className={cn("h-3.5 w-3.5 cursor-help", tone.info)}
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
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
            ))}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <p
          className={cn(
            "text-xl font-bold tabular-nums md:text-2xl",
            metric.valueClass ?? "text-slate-50"
          )}
        >
          {metric.value}
        </p>
        {metric.sub && (
          <p className="mt-1 text-[11px] text-slate-500">{metric.sub}</p>
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
    <Card className="border-white/8 bg-[#0c0c14] p-4">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-slate-500">
          <ArrowDownRight className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
          <span className="font-semibold tabular-nums text-slate-300">
            {range.format(range.low)}
          </span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Khoảng dao động 24H
        </span>
        <span className="flex items-center gap-1 text-slate-500">
          <span className="font-semibold tabular-nums text-slate-300">
            {range.format(range.high)}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        </span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-red-500/40 via-amber-500/40 to-emerald-500/40"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0c14] bg-white shadow-md"
          style={{ left: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

/* ─── Main template ────────────────────────────────────────────────────────── */

export default function MarketPage<T>({
  theme,
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
    <div className="flex h-full flex-col space-y-6 overflow-y-auto bg-[#07070a] p-4 text-slate-100 md:p-8 pb-28">
      {/* ── Page Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl text-xl font-bold shadow-lg",
              theme.iconGradient
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1
              className={cn(
                "bg-linear-to-r bg-clip-text text-xl font-bold text-transparent md:text-2xl",
                theme.titleGradient
              )}
            >
              {title}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>

        {updatedAt && (
          <Badge
            variant="secondary"
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs",
              theme.liveBadgeClass
            )}
          >
            <span
              className={cn("h-2 w-2 animate-ping rounded-full", theme.liveDotClass)}
            />
            <span>Cập nhật: {updatedAt}</span>
          </Badge>
        )}
      </header>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{(error as Error)?.message || errorLabel}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-xl bg-white/4" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl bg-white/4" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl bg-white/4" />
          <Skeleton className="h-64 rounded-2xl bg-white/4" />
        </div>
      ) : (
        <>
          {/* ── Asset Selection Pills ── */}
          <div className="flex flex-wrap gap-2 border-b border-white/8 pb-3">
            {items.map((item) => {
              const code = getItemCode(item);
              const isSelected = code === selectedCode;
              return (
                <button
                  key={code}
                  onClick={() => onSelectCode(code)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all",
                    isSelected
                      ? cn("border-transparent", theme.activePillClass)
                      : "border-white/8 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-slate-100"
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
          <Card className="space-y-4 border-white/8 bg-[#0c0c14] p-5">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-200">
                {tableTitle}
              </CardTitle>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {items.length} {tableCountLabel}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    {columns.map((col) => (
                      <TableHead
                        key={col.key}
                        className={cn(
                          "whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase text-slate-400",
                          ALIGN_CLASS[col.align ?? "left"],
                          col.className
                        )}
                      >
                        {col.header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-white/6 text-slate-200">
                  {items.map((item, idx) => {
                    const code = getItemCode(item);
                    const isSelected = code === selectedCode;
                    return (
                      <TableRow
                        key={code}
                        onClick={() => onSelectCode(code)}
                        className={cn(
                          "cursor-pointer border-white/6 transition-colors hover:bg-white/5",
                          !isSelected && idx % 2 === 1 && "bg-white/[0.02]",
                          isSelected && cn(theme.selectedRowClass, "font-semibold")
                        )}
                      >
                        {columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={cn(
                              "px-4 py-3 tabular-nums",
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
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-200">
                <Newspaper
                  className={cn("h-4 w-4", theme.newsHeadingIconClass)}
                  aria-hidden="true"
                />
                <span>{newsTitle}</span>
              </h2>
              <Badge variant="secondary" className="text-xs text-slate-400">
                {news.length} bài viết
              </Badge>
            </div>

            {news.length === 0 ? (
              <Card className="flex flex-col items-center justify-center gap-2 border-white/8 bg-[#0c0c14] py-12 text-slate-500">
                <Newspaper className="h-6 w-6 text-slate-600" aria-hidden="true" />
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
                        "group relative flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5",
                        pinned
                          ? theme.pinnedCardClass
                          : "border-white/8 bg-[#0c0c14] hover:border-white/20 hover:bg-[#12121e]"
                      )}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              theme.newsSourceBadgeClass
                            )}
                          >
                            {item.source}
                          </Badge>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Calendar className="h-3 w-3" aria-hidden="true" />
                            {item.published_at}
                          </span>
                        </div>

                        <CardTitle
                          className={cn(
                            "line-clamp-2 text-sm font-semibold leading-snug text-slate-100 transition-colors",
                            theme.newsTitleHoverClass
                          )}
                        >
                          {item.title}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="flex-1 p-4 pt-0">
                        <p className="line-clamp-3 text-xs leading-relaxed text-slate-400">
                          {item.summary}
                        </p>
                      </CardContent>

                      <CardFooter className="flex items-center justify-between gap-2 border-t border-white/5 p-4 pt-2">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "inline-flex items-center gap-1 text-xs transition-colors",
                            theme.sourceLinkClass
                          )}
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
                              className={cn(
                                "gap-1.5 text-xs font-semibold",
                                pinned
                                  ? theme.pinBtnActiveClass
                                  : cn("text-slate-300", theme.pinBtnHoverClass)
                              )}
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
