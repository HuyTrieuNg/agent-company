"use client";

import { useEffect, useRef } from "react";
import { TechnicalsResponse } from "@/lib/stockApi";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";

function fmt(val: number | null | undefined, digits = 2): string {
  if (val == null || isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

function MiniLineChart({ data }: { data: { time: string; close: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const closes = data.map((d) => d.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const pad = 12;

    ctx.clearRect(0, 0, W, H);

    const xStep = (W - pad * 2) / (closes.length - 1);
    const toY = (v: number) => pad + ((max - v) / range) * (H - pad * 2);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (i / 4) * (H - pad * 2);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
      ctx.stroke();
    }

    // Gradient area
    const gradient = ctx.createLinearGradient(0, pad, 0, H);
    gradient.addColorStop(0, "rgba(139,92,246,0.25)");
    gradient.addColorStop(1, "rgba(139,92,246,0.02)");
    ctx.beginPath();
    ctx.moveTo(pad, toY(closes[0]));
    closes.forEach((v, i) => ctx.lineTo(pad + i * xStep, toY(v)));
    ctx.lineTo(pad + (closes.length - 1) * xStep, H);
    ctx.lineTo(pad, H);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main line
    ctx.beginPath();
    ctx.moveTo(pad, toY(closes[0]));
    closes.forEach((v, i) => ctx.lineTo(pad + i * xStep, toY(v)));
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Last point dot
    const lastX = pad + (closes.length - 1) * xStep;
    const lastY = toY(closes[closes.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#8b5cf6";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data]);

  return <canvas ref={canvasRef} width={900} height={220} className="w-full h-52 rounded-xl" />;
}

function RSIGauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500">—</span>;
  const pct = Math.min(Math.max(value, 0), 100);
  let color = "#f59e0b"; // neutral
  let label = "Trung lập";
  if (value >= 70) { color = "#ef4444"; label = "Quá mua"; }
  if (value <= 30) { color = "#10b981"; label = "Quá bán"; }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-slate-500">
        <span>0</span>
        <span className="font-semibold" style={{ color }}>{fmt(value)} — {label}</span>
        <span>100</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>Quá bán (≤30)</span>
        <span>Quá mua (≥70)</span>
      </div>
    </div>
  );
}

function MACDBar({ macd, signal, histogram }: { macd: number | null; signal: number | null; histogram: number | null }) {
  const isPositive = (histogram ?? 0) >= 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "MACD", value: macd },
          { label: "Signal", value: signal },
          { label: "Histogram", value: histogram, color: isPositive ? "#10b981" : "#ef4444" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/8 bg-white/4 p-3 text-center">
            <div className="text-[11px] text-slate-500 mb-1">{m.label}</div>
            <div className="text-base font-bold" style={m.color ? { color: m.color } : { color: "#e2e8f0" }}>
              {fmt(m.value, 4)}
            </div>
          </div>
        ))}
      </div>
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
      <div className="space-y-4 animate-pulse">
        <div className="h-52 rounded-2xl bg-white/8" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/6" />)}
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
    { label: "SMA 20", value: indicators.sma_20, period: 20 },
    { label: "SMA 50", value: indicators.sma_50, period: 50 },
    { label: "SMA 200", value: indicators.sma_200, period: 200 },
  ];

  const lastPrice = data.last_price ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Price chart */}
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300">Biểu đồ giá ({data.timeframe})</h3>
          <span className="text-xs text-slate-500">{data.data_points} phiên</span>
        </div>
        {price_history.length > 0 ? (
          <InteractivePriceChart
            data={price_history.map((d) => ({ date: d.time, close: d.close }))}
            series={[{ key: "close", label: "Giá đóng cửa", color: "#8b5cf6" }]}
            title={`Biểu đồ giá lịch sử (${data.timeframe} - ${data.data_points} phiên)`}
            unit="đ"
            height={240}
          />
        ) : (
          <div className="h-52 flex items-center justify-center text-slate-600">Không có dữ liệu</div>
        )}
      </div>

      {/* Moving Averages */}
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Đường trung bình động (MA)</h3>
        <div className="grid grid-cols-3 gap-3">
          {mas.map((ma) => {
            const aboveMA = lastPrice > (ma.value ?? 0);
            return (
              <div
                key={ma.label}
                className="rounded-xl border border-white/8 bg-white/4 p-3 text-center"
              >
                <div className="text-xs text-slate-500 mb-1">{ma.label}</div>
                <div className="text-base font-bold text-slate-100">{fmt(ma.value, 0)}</div>
                {ma.value != null && (
                  <div
                    className="mt-1 text-[10px] font-medium rounded-full px-2 py-0.5 inline-block"
                    style={{
                      color: aboveMA ? "#10b981" : "#ef4444",
                      background: aboveMA ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    }}
                  >
                    {aboveMA ? "▲ Trên MA" : "▼ Dưới MA"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RSI */}
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">RSI (14 phiên)</h3>
        <RSIGauge value={indicators.rsi_14} />
      </div>

      {/* MACD */}
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">MACD</h3>
        <MACDBar
          macd={indicators.macd}
          signal={indicators.macd_signal}
          histogram={indicators.macd_histogram}
        />
      </div>

      {/* Bollinger Bands */}
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Bollinger Bands (20 phiên, 2σ)</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Upper Band", value: indicators.bb_upper, color: "#ef4444" },
            { label: "Middle (SMA20)", value: indicators.bb_middle, color: "#f59e0b" },
            { label: "Lower Band", value: indicators.bb_lower, color: "#10b981" },
          ].map((bb) => (
            <div key={bb.label} className="rounded-xl border border-white/8 bg-white/4 p-3 text-center">
              <div className="text-[10px] text-slate-500 mb-1">{bb.label}</div>
              <div className="text-base font-bold" style={{ color: bb.color }}>
                {fmt(bb.value, 0)}
              </div>
            </div>
          ))}
        </div>
        {indicators.bb_upper && indicators.bb_lower && lastPrice > 0 && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Vị trí giá trong dải</div>
            <div className="h-2.5 w-full rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-red-500 opacity-60"
                style={{
                  width: `${Math.min(100, Math.max(0,
                    ((lastPrice - indicators.bb_lower) / (indicators.bb_upper - indicators.bb_lower)) * 100
                  ))}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
