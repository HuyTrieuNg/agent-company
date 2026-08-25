"use client";

import { TechnicalsResponse } from "@/lib/stockApi";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

function fmt(val: number | null | undefined, digits = 2): string {
  if (val == null || isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

function RSIGauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const pct = Math.min(Math.max(value, 0), 100);
  let badgeVariant: "destructive" | "success" | "secondary" = "secondary";
  let label = "Trung lập";
  if (value >= 70) {
    badgeVariant = "destructive";
    label = "Quá mua (Overbought)";
  }
  if (value <= 30) {
    badgeVariant = "success";
    label = "Quá bán (Oversold)";
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>0</span>
        <Badge variant={badgeVariant} className="text-xs font-bold px-2 py-0.5">
          {fmt(value)} — {label}
        </Badge>
        <span>100</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            value >= 70 ? "bg-red-500" : value <= 30 ? "bg-emerald-500" : "bg-amber-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Vùng quá bán (≤ 30)</span>
        <span>Vùng quá mua (≥ 70)</span>
      </div>
    </div>
  );
}

function MACDBar({
  macd,
  signal,
  histogram,
}: {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}) {
  const isPositive = (histogram ?? 0) >= 0;
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {[
        { label: "Đường MACD", value: macd, tip: "Đường trung bình động hội tụ/phân kỳ (12, 26)" },
        { label: "Đường Signal", value: signal, tip: "Đường tín hiệu EMA 9 phiên" },
        {
          label: "Histogram",
          value: histogram,
          color: isPositive ? "#10b981" : "#ef4444",
          tip: "Hiệu số giữa MACD và Signal (phân kỳ dương/âm)",
        },
      ].map((m) => (
        <Tooltip key={m.label}>
          <TooltipTrigger asChild>
            <Card className="p-3 border-white/8 bg-white/4 text-center cursor-help hover:border-violet-500/30 transition-colors">
              <div className="text-[11px] text-slate-400 mb-1">{m.label}</div>
              <div
                className="text-sm md:text-base font-bold"
                style={m.color ? { color: m.color } : { color: "#e2e8f0" }}
              >
                {fmt(m.value, 4)}
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-[11px] text-slate-200">{m.tip}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export default function TechnicalsTab({
  data,
  loading,
}: {
  data: TechnicalsResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-4xl mb-3">🔬</span>
        <p>Không có dữ liệu kỹ thuật</p>
      </div>
    );
  }

  const { indicators, price_history } = data;

  const mas = [
    { label: "SMA 20", value: indicators.sma_20, period: 20, desc: "Ngắn hạn (20 phiên)" },
    { label: "SMA 50", value: indicators.sma_50, period: 50, desc: "Trung hạn (50 phiên)" },
    { label: "SMA 200", value: indicators.sma_200, period: 200, desc: "Dài hạn (200 phiên)" },
  ];

  const lastPrice = data.last_price ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Price chart */}
      <InteractivePriceChart
        data={price_history.map((d) => ({ date: d.time, close: d.close }))}
        series={[{ key: "close", label: "Giá đóng cửa", color: "#8b5cf6" }]}
        title={`Biểu đồ kỹ thuật (${data.timeframe} - ${data.data_points} phiên)`}
        unit="đ"
        height={240}
      />

      {/* Grid of technical indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Moving Averages */}
        <Card className="border-white/8 bg-white/4 p-4">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300">
              Đường trung bình động (MA)
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-[11px]">Simple Moving Averages đo xu hướng giá bình quân</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-3 gap-2.5">
              {mas.map((ma) => {
                const aboveMA = lastPrice > (ma.value ?? 0);
                return (
                  <Card
                    key={ma.label}
                    className="p-3 border-white/8 bg-white/4 text-center"
                  >
                    <div className="text-xs text-slate-400 mb-1">{ma.label}</div>
                    <div className="text-sm md:text-base font-bold text-slate-100">{fmt(ma.value, 0)}</div>
                    {ma.value != null && (
                      <div className="mt-1.5">
                        <Badge
                          variant={aboveMA ? "success" : "destructive"}
                          className="text-[10px] py-0 px-1.5 font-semibold"
                        >
                          {aboveMA ? "▲ Trên MA" : "▼ Dưới MA"}
                        </Badge>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* RSI */}
        <Card className="border-white/8 bg-white/4 p-4">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300">
              Chỉ số RSI (14 phiên)
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-[11px]">Chỉ số sức mạnh tương đối (Relative Strength Index)</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="p-0 pt-1">
            <RSIGauge value={indicators.rsi_14} />
          </CardContent>
        </Card>

        {/* MACD */}
        <Card className="border-white/8 bg-white/4 p-4">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300">
              Chỉ báo MACD
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-[11px]">Moving Average Convergence Divergence</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="p-0">
            <MACDBar
              macd={indicators.macd}
              signal={indicators.macd_signal}
              histogram={indicators.macd_histogram}
            />
          </CardContent>
        </Card>

        {/* Bollinger Bands */}
        <Card className="border-white/8 bg-white/4 p-4">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300">
              Bollinger Bands (20 phiên, 2σ)
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-[11px]">Dải biến động giá dựa trên độ lệch chuẩn (Upper / Middle / Lower)</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Upper Band", value: indicators.bb_upper, color: "#ef4444" },
                { label: "Middle (SMA20)", value: indicators.bb_middle, color: "#f59e0b" },
                { label: "Lower Band", value: indicators.bb_lower, color: "#10b981" },
              ].map((bb) => (
                <Card key={bb.label} className="p-3 border-white/8 bg-white/4 text-center">
                  <div className="text-[10px] text-slate-400 mb-1">{bb.label}</div>
                  <div className="text-sm md:text-base font-bold" style={{ color: bb.color }}>
                    {fmt(bb.value, 0)}
                  </div>
                </Card>
              ))}
            </div>
            {indicators.bb_upper && indicators.bb_lower && lastPrice > 0 && (
              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-1">Vị trí giá trong dải</div>
                <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-red-500 opacity-70"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((lastPrice - indicators.bb_lower) /
                            (indicators.bb_upper - indicators.bb_lower)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

