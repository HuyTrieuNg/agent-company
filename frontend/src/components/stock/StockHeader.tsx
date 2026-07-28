"use client";

import { StockOverview } from "@/lib/stockApi";

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

export default function StockHeader({
  overview,
  loading,
}: {
  overview: StockOverview | null;
  loading: boolean;
}) {
  const isPositive = (overview?.price_change_pct ?? 0) >= 0;
  const changeColor = isPositive ? "#10b981" : "#ef4444";
  const changeBg = isPositive ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)";
  const changeBorder = isPositive ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)";

  if (loading) {
    return (
      <div className="shrink-0 border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-4 animate-pulse">
          <div className="h-10 w-20 rounded-xl bg-white/8" />
          <div className="h-8 w-32 rounded-lg bg-white/6" />
          <div className="ml-auto flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 w-20 rounded-xl bg-white/6" />
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
    <div className="shrink-0 border-b border-white/8 bg-gradient-to-r from-[#0d0d16] to-[#0a0a0f] px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        {/* Symbol & Name */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold shadow-lg"
            style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
              boxShadow: "0 4px 20px rgba(139,92,246,0.35)",
            }}
          >
            {overview.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-white tracking-tight">
                {overview.symbol}
              </span>
              {overview.exchange && (
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400 uppercase">
                  {overview.exchange}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate">
              {overview.company_name}
            </div>
            {overview.industry && (
              <div className="text-[10px] text-[#8b5cf6]/70 mt-0.5">{overview.industry}</div>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-white tracking-tight" id="stock-price">
            {fmt(overview.current_price, 0)}
          </span>
          {overview.price_change != null && (
            <div
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold"
              style={{
                color: changeColor,
                background: changeBg,
                border: `1px solid ${changeBorder}`,
              }}
              id="stock-change"
            >
              <span>{isPositive ? "▲" : "▼"}</span>
              <span>{fmt(Math.abs(overview.price_change))}</span>
              {overview.price_change_pct != null && (
                <span>({fmt(Math.abs(overview.price_change_pct), 2)}%)</span>
              )}
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div className="ml-auto flex flex-wrap gap-2">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-center min-w-[70px]"
            >
              <div className="text-[10px] text-slate-500 mb-0.5">{m.label}</div>
              <div className="text-sm font-semibold text-slate-100">{m.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
