"use client";

import { StockOverview } from "@/lib/stockApi";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

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
      <div className="shrink-0 border-b border-white/8 px-6 py-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-4 w-48 rounded-lg" />
          </div>
          <div className="ml-auto hidden md:flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const metrics = [
    { label: "P/E", value: fmt(overview.pe_ratio) },
    { label: "P/B", value: fmt(overview.pb_ratio) },
    { label: "EPS", value: fmt(overview.eps) },
    { label: "Vốn hóa", value: fmtMarketCap(overview.market_cap) },
    { label: "Khối lượng", value: fmt(overview.volume, 0) },
    { label: "52T Cao", value: fmt(overview.week_52_high) },
    { label: "52T Thấp", value: fmt(overview.week_52_low) },
    { label: "Beta", value: fmt(overview.beta) },
  ];

  return (
    <div className="shrink-0 border-b border-white/8 bg-gradient-to-r from-[#0d0d16] to-[#0a0a0f] px-6 py-4">
      <div className="flex flex-wrap items-start gap-4">
        {/* Symbol & Name */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-lg bg-linear-to-br from-violet-600 to-cyan-500 shadow-violet-500/25"
          >
            {overview.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-slate-50 tracking-tight">
                {overview.symbol}
              </span>
              {overview.exchange && (
                <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                  {overview.exchange}
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 max-w-[200px] truncate">
              {overview.company_name}
            </div>
            {overview.industry && (
              <Badge variant="cyan" className="mt-1 text-[10px] font-medium py-0 h-4">
                {overview.industry}
              </Badge>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-50 tracking-tight" id="stock-price">
            {fmt(overview.current_price, 0)}
          </span>
          {overview.price_change != null && (
            <Badge
              variant={isPositive ? "success" : "destructive"}
              className="text-xs font-bold px-2.5 py-1 gap-1"
              id="stock-change"
            >
              <span>{isPositive ? "▲" : "▼"}</span>
              <span>{fmt(Math.abs(overview.price_change))}</span>
              {overview.price_change_pct != null && (
                <span>({fmt(Math.abs(overview.price_change_pct), 2)}%)</span>
              )}
            </Badge>
          )}
        </div>

        {/* Metrics grid with Tooltips */}
        <div className="ml-auto flex flex-wrap gap-2">
          {metrics.map((m) => (
            <Tooltip key={m.label}>
              <TooltipTrigger asChild>
                <div
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-1.5 text-center min-w-[70px] hover:border-violet-500/30 transition-colors cursor-help"
                >
                  <div className="text-[10px] text-slate-500 mb-0.5">{m.label}</div>
                  <div className="text-xs font-bold text-slate-100">{m.value}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-semibold text-violet-300">{m.label}</p>
                <p className="text-[11px] text-slate-300">{METRIC_TIPS[m.label] || m.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

