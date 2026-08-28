"use client";

import { StockOverview } from "@/lib/stockApi";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Plus, BarChart2 } from "lucide-react";

function fmt(val: number | null | undefined, digits = 2): string {
  if (val == null || isNaN(val)) return "—";
  return val.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

function fmtMarketCap(val: number | null): string {
  if (val == null) return "—";
  if (val >= 1e12) return `${(val / 1e12).toFixed(1)} nghìn tỷ`;
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)} tỷ`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(0)} triệu`;
  return val.toLocaleString("vi-VN");
}

const METRIC_TIPS: Record<string, string> = {
  "P/E": "Price to Earnings: Tỷ số giá trên lợi nhuận một cổ phiếu",
  "P/B": "Price to Book: Tỷ số giá trên giá trị sổ sách",
  "EPS": "Earnings Per Share: Lợi nhuận trên mỗi cổ phiếu",
  "Vốn hóa": "Tổng giá trị thị trường của doanh nghiệp",
  "Khối lượng": "Khối lượng cổ phiếu giao dịch trong phiên",
  "52T Cao": "Mức giá cao nhất trong vòng 52 tuần qua",
  "52T Thấp": "Mức giá thấp nhất trong vòng 52 tuần qua",
  "Beta": "Hệ số đo lường mức độ biến động so với toàn thị trường",
};

export default function StockHeader({
  overview,
  loading,
}: {
  overview: StockOverview | null;
  loading: boolean;
}) {
  const isPositive = (overview?.price_change_pct ?? 0) >= 0;

  if (loading) {
    return (
      <div className="shrink-0 border-b border-(--border-default) bg-(--bg-surface) px-6 py-3.5 space-y-3">
        {/* Row 1 Skeleton */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-3.5 w-44 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
        </div>
        {/* Row 2 Skeleton */}
        <div className="flex items-center gap-2 pt-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-10 w-20 rounded-lg shrink-0" />
          ))}
          <Skeleton className="h-8 w-16 rounded-lg ml-auto shrink-0 lg:hidden" />
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const metrics = [
    { label: "P/E", value: fmt(overview.pe_ratio), priority: 1 },
    { label: "P/B", value: fmt(overview.pb_ratio), priority: 1 },
    { label: "EPS", value: fmt(overview.eps), priority: 1 },
    { label: "Vốn hóa", value: fmtMarketCap(overview.market_cap), priority: 1 },
    { label: "Khối lượng", value: fmt(overview.volume, 0), priority: 1 },
    { label: "52T Cao", value: fmt(overview.week_52_high), priority: 2 },
    { label: "52T Thấp", value: fmt(overview.week_52_low), priority: 2 },
    { label: "Beta", value: fmt(overview.beta), priority: 2 },
  ];

  return (
    <div className="shrink-0 border-b border-(--border-default) bg-(--bg-surface) px-6 py-4 space-y-3.5">
      {/* ── Row 1: Stock Identity (Left) & Price / Change (Right) ── */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Symbol & Name */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--border-default) bg-(--bg-subtle) text-sm font-bold text-(--action-primary)">
            {overview.symbol.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xl font-bold tracking-tight text-(--text-primary)">
                {overview.symbol}
              </span>
              {overview.exchange && (
                <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider font-mono px-1.5 py-0">
                  {overview.exchange}
                </Badge>
              )}
              {overview.industry && (
                <Badge variant="secondary" className="text-[10px] font-medium hidden sm:inline-flex px-1.5 py-0 truncate max-w-[180px]">
                  {overview.industry}
                </Badge>
              )}
            </div>
            <div className="text-xs text-(--text-secondary) mt-0.5 truncate max-w-sm sm:max-w-md md:max-w-lg" title={overview.company_name}>
              {overview.company_name}
            </div>
          </div>
        </div>

        {/* Right: Price & Change */}
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-(--text-primary)" id="stock-price">
            {fmt(overview.current_price, 0)}
          </span>
          {overview.price_change != null && (
            <Badge
              variant={isPositive ? "success" : "destructive"}
              className="text-xs font-semibold px-2 py-0.5 gap-1 tabular-nums shrink-0"
              id="stock-change"
            >
              <span>{isPositive ? "+" : "−"}</span>
              <span>{fmt(Math.abs(overview.price_change))}</span>
              {overview.price_change_pct != null && (
                <span className="hidden sm:inline">({isPositive ? "+" : "−"}{fmt(Math.abs(overview.price_change_pct), 2)}%)</span>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Row 2: Metrics Strip (Strictly 1 line) & '+' Popover Button (Only on small screens) ── */}
      <div className="flex items-center justify-between gap-2 overflow-hidden pt-1">
        {/* Metric Cards - 1 line */}
        <div className="flex items-center gap-2 overflow-hidden">
          {metrics.map((m) => (
            <Tooltip key={m.label}>
              <TooltipTrigger asChild>
                <div
                  className={`rounded-lg border border-(--border-default) bg-(--bg-subtle) px-3 py-1.5 text-center min-w-[70px] shrink-0 hover:border-(--border-strong) transition-colors cursor-help ${
                    m.priority === 2 ? "hidden lg:block" : ""
                  }`}
                >
                  <div className="text-[10px] text-(--text-secondary) font-medium leading-none mb-1">{m.label}</div>
                  <div className="text-xs font-semibold tabular-nums text-(--text-primary) leading-tight">{m.value}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-semibold text-(--action-primary) text-xs">{m.label}</p>
                <p className="text-xs text-(--text-secondary)">{METRIC_TIPS[m.label] || m.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* '+' Button to open popup with full financial metrics - only shown on screens < lg where some metrics are hidden */}
        <div className="lg:hidden shrink-0 ml-auto">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg border border-(--border-default) bg-(--bg-subtle) hover:bg-(--bg-surface) hover:border-(--border-strong) px-2.5 py-1 text-xs font-medium text-(--text-primary) transition-colors cursor-pointer shrink-0 shadow-xs"
                title="Xem chi tiết toàn bộ chỉ số tài chính"
              >
                <Plus className="h-3.5 w-3.5 text-(--action-primary)" />
                <span className="text-xs font-semibold text-(--text-secondary) hover:text-(--text-primary)">Chỉ số</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-84 p-4 border-(--border-default) bg-(--bg-surface) shadow-xl rounded-xl">
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-(--border-default)">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-(--action-primary)" />
                  <span className="text-xs font-bold text-(--text-primary)">Toàn bộ chỉ số tài chính</span>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px] font-bold">
                  {overview.symbol}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {metrics.map((m) => (
                  <div key={m.label} className="rounded-lg border border-(--border-default) bg-(--bg-subtle) p-2.5">
                    <div className="text-[10px] text-(--text-secondary) font-medium">{m.label}</div>
                    <div className="text-xs font-bold text-(--text-primary) tabular-nums mt-0.5">{m.value}</div>
                    <div className="text-[10px] text-(--text-tertiary) mt-1 line-clamp-2 leading-tight">
                      {METRIC_TIPS[m.label]}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
