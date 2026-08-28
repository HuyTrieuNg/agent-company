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
import { Info, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(val: number | null | undefined, digits = 2): string {
  if (val == null || isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

function RSIGauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-(--text-tertiary)">—</span>;
  const pct = Math.min(Math.max(value, 0), 100);
  let badgeVariant: "destructive" | "success" | "secondary" = "secondary";
  let label = "Trung lập";
  if (value >= 70) {
    badgeVariant = "destructive";
    label = "Quá mua (≥70)";
  }
  if (value <= 30) {
    badgeVariant = "success";
    label = "Quá bán (≤30)";
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs text-(--text-secondary)">
        <span className="tabular-nums">0</span>
        <Badge variant={badgeVariant} className="text-xs font-semibold px-2 py-0.5 tabular-nums">
          {fmt(value)} — {label}
        </Badge>
        <span className="tabular-nums">100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-(--bg-subtle) border border-(--border-default) overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            value >= 70
              ? "bg-(--status-negative)"
              : value <= 30
                ? "bg-(--status-positive)"
                : "bg-(--action-primary)"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-(--text-tertiary)">
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
          colorClass: isPositive ? "text-(--status-positive)" : "text-(--status-negative)",
          tip: "Hiệu số giữa MACD và Signal (phân kỳ dương/âm)",
        },
      ].map((m) => (
        <Tooltip key={m.label}>
          <TooltipTrigger asChild>
            <Card className="p-3 border border-(--border-default) bg-(--bg-subtle) text-center cursor-help hover:border-(--border-strong) transition-colors rounded-lg shadow-none">
              <div className="text-[11px] font-medium text-(--text-secondary) mb-1">{m.label}</div>
              <div
                className={cn(
                  "text-sm md:text-base font-bold tabular-nums text-(--text-primary)",
                  m.colorClass
                )}
              >
                {fmt(m.value, 4)}
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs text-(--text-secondary)">{m.tip}</p>
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
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="flex flex-col items-center justify-center py-20 border border-(--border-default) bg-(--bg-surface) rounded-xl text-(--text-tertiary)">
        <LineChart className="h-8 w-8 mb-2 text-(--text-tertiary)" aria-hidden="true" />
        <p className="text-xs">Không có dữ liệu kỹ thuật</p>
      </Card>
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
        series={[{ key: "close", label: "Giá đóng cửa", color: "", semanticColor: "primary" }]}
        title={`Biểu đồ kỹ thuật (${data.timeframe} - ${data.data_points} phiên)`}
        unit="đ"
        height={240}
      />

      {/* Grid of technical indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Moving Averages */}
        <Card className="border border-(--border-default) bg-(--bg-surface) p-4 rounded-xl shadow-xs">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
              Đường trung bình động (MA)
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-(--text-tertiary) hover:text-(--text-secondary) cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Simple Moving Averages đo xu hướng giá bình quân</p>
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
                    className="p-3 border border-(--border-default) bg-(--bg-subtle) text-center rounded-lg shadow-none"
                  >
                    <div className="text-xs font-medium text-(--text-secondary) mb-1">{ma.label}</div>
                    <div className="text-sm md:text-base font-bold tabular-nums text-(--text-primary)">
                      {fmt(ma.value, 0)}
                    </div>
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
        <Card className="border border-(--border-default) bg-(--bg-surface) p-4 rounded-xl shadow-xs">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
              Chỉ số RSI (14 phiên)
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-(--text-tertiary) hover:text-(--text-secondary) cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Chỉ số sức mạnh tương đối (Relative Strength Index)</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="p-0 pt-1">
            <RSIGauge value={indicators.rsi_14} />
          </CardContent>
        </Card>

        {/* MACD */}
        <Card className="border border-(--border-default) bg-(--bg-surface) p-4 rounded-xl shadow-xs">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
              Chỉ báo MACD
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-(--text-tertiary) hover:text-(--text-secondary) cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Moving Average Convergence Divergence</p>
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
        <Card className="border border-(--border-default) bg-(--bg-surface) p-4 rounded-xl shadow-xs">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
              Bollinger Bands (20 phiên, 2σ)
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-(--text-tertiary) hover:text-(--text-secondary) cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Dải biến động giá dựa trên độ lệch chuẩn (Upper / Middle / Lower)</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Upper Band", value: indicators.bb_upper, colorClass: "text-(--status-negative)" },
                { label: "Middle (SMA20)", value: indicators.bb_middle, colorClass: "text-(--action-primary)" },
                { label: "Lower Band", value: indicators.bb_lower, colorClass: "text-(--status-positive)" },
              ].map((bb) => (
                <Card key={bb.label} className="p-3 border border-(--border-default) bg-(--bg-subtle) text-center rounded-lg shadow-none">
                  <div className="text-[10px] font-medium text-(--text-secondary) mb-1">{bb.label}</div>
                  <div className={cn("text-sm md:text-base font-bold tabular-nums", bb.colorClass)}>
                    {fmt(bb.value, 0)}
                  </div>
                </Card>
              ))}
            </div>
            {indicators.bb_upper && indicators.bb_lower && lastPrice > 0 && (
              <div className="mt-3">
                <div className="text-xs text-(--text-secondary) mb-1">Vị trí giá trong dải</div>
                <div className="h-2 w-full rounded-full bg-(--bg-subtle) border border-(--border-default) overflow-hidden">
                  <div
                    className="h-full rounded-full bg-(--action-primary)"
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
