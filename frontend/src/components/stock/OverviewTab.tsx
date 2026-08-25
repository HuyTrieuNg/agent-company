"use client";

import { StockOverview } from "@/lib/stockApi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

function fmt(val: number | null | undefined, digits = 2): string {
  if (val == null || isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

function fmtMarketCap(val: number | null): string {
  if (val == null) return "—";
  if (val >= 1e12) return `${(val / 1e12).toFixed(1)} nghìn tỷ`;
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)} tỷ`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(0)} triệu`;
  return val.toLocaleString("vi-VN");
}

const METRIC_TIPS: Record<string, string> = {
  "Giá hiện tại": "Mức giá khớp lệnh gần nhất",
  "Thay đổi %": "Mức tăng / giảm so với giá tham chiếu",
  "Vốn hóa thị trường": "Tổng giá trị thị trường = Giá cổ phiếu × Số lượng lưu hành",
  "P/E": "Hệ số Giá trên Thu nhập mỗi cổ phiếu (Price to Earnings)",
  "P/B": "Hệ số Giá trên Giá trị sổ sách (Price to Book)",
  "P/S": "Hệ số Giá trên Doanh thu (Price to Sales)",
  "EPS": "Thu nhập trên mỗi cổ phần (Earnings Per Share)",
  "Beta": "Độ nhạy của cổ phiếu so với biến động thị trường chung",
  "Khối lượng": "Tổng khối lượng giao dịch trong ngày",
  "Khối lượng trung bình": "Khối lượng giao dịch bình quân nhiều phiên",
  "52 tuần cao nhất": "Mức giá cao nhất được ghi nhận trong 1 năm qua",
  "52 tuần thấp nhất": "Mức giá thấp nhất được ghi nhận trong 1 năm qua",
};

export default function OverviewTab({
  overview,
  loading,
}: {
  overview: StockOverview | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-12 w-full mt-2" />
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-4xl mb-3">📊</span>
        <p>Nhập mã chứng khoán để xem thông tin</p>
      </div>
    );
  }

  const isPositive = (overview.price_change_pct ?? 0) >= 0;

  const metrics = [
    { label: "Giá hiện tại", value: fmt(overview.current_price, 0) },
    {
      label: "Thay đổi %",
      value:
        overview.price_change_pct != null
          ? `${isPositive ? "+" : ""}${fmt(overview.price_change_pct)}%`
          : "—",
      color: isPositive ? "#10b981" : "#ef4444",
    },
    { label: "Vốn hóa thị trường", value: fmtMarketCap(overview.market_cap) },
    { label: "P/E", value: fmt(overview.pe_ratio) },
    { label: "P/B", value: fmt(overview.pb_ratio) },
    { label: "P/S", value: fmt(overview.ps_ratio) },
    { label: "EPS", value: fmt(overview.eps) },
    { label: "Beta", value: fmt(overview.beta) },
    { label: "Khối lượng", value: fmt(overview.volume, 0) },
    { label: "Khối lượng trung bình", value: fmt(overview.avg_volume, 0) },
    { label: "52 tuần cao nhất", value: fmt(overview.week_52_high, 0) },
    { label: "52 tuần thấp nhất", value: fmt(overview.week_52_low, 0) },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Company Info */}
      <Card className="border-white/8 bg-white/4 p-5 backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold text-white shadow-lg bg-linear-to-br from-violet-600 to-cyan-500 shadow-violet-500/25"
          >
            {overview.symbol.slice(0, 2)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-extrabold text-slate-50 tracking-tight">{overview.symbol}</h2>
              {overview.exchange && (
                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                  {overview.exchange}
                </Badge>
              )}
              {overview.industry && (
                <Badge variant="cyan" className="text-[11px] font-medium">
                  {overview.industry}
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-slate-300">{overview.company_name}</p>
            {overview.description && (
              <p className="mt-2 text-xs md:text-sm text-slate-400 leading-relaxed line-clamp-3">
                {overview.description}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Metrics Grid */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Chỉ số cơ bản
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {metrics.map((m) => (
            <Tooltip key={m.label}>
              <TooltipTrigger asChild>
                <Card className="group flex flex-col justify-between p-4 border-white/8 bg-white/4 transition-all duration-200 hover:border-violet-500/30 hover:bg-white/6 cursor-help">
                  <span className="text-xs text-slate-400">{m.label}</span>
                  <span
                    className="mt-1 text-base md:text-lg font-bold text-slate-100 group-hover:text-white transition-colors"
                    style={m.color ? { color: m.color } : undefined}
                  >
                    {m.value}
                  </span>
                </Card>
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

