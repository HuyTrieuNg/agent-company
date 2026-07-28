"use client";

import { StockOverview } from "@/lib/stockApi";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/8 ${className}`} />;
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-white/4 p-4 transition-all duration-200 hover:border-[#8b5cf6]/30 hover:bg-white/6">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className="text-lg font-bold text-slate-100"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

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

export default function OverviewTab({
  overview,
  loading,
}: {
  overview: StockOverview | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
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
      <div className="rounded-2xl border border-white/8 bg-white/4 p-5">
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold shadow-lg"
            style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
              boxShadow: "0 4px 20px rgba(139,92,246,0.3)",
            }}
          >
            {overview.symbol.slice(0, 2)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-extrabold text-white">{overview.symbol}</h2>
              {overview.exchange && (
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 uppercase">
                  {overview.exchange}
                </span>
              )}
              {overview.industry && (
                <span className="rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2.5 py-0.5 text-[11px] text-[#a78bfa]">
                  {overview.industry}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-300">{overview.company_name}</p>
            {overview.description && (
              <p className="mt-2 text-sm text-slate-500 leading-relaxed line-clamp-3">
                {overview.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Chỉ số cơ bản
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {metrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} color={m.color} />
          ))}
        </div>
      </div>
    </div>
  );
}
