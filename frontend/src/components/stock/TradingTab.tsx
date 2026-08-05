"use client";

import { useState, useEffect, useRef, memo } from "react";
import { TradingResponse, StockCandle } from "@/lib/stockApi";

function fmt(val: unknown, digits = 0): string {
  const n = Number(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

const MiniChart = memo(function MiniChart({ data }: { data: StockCandle[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const closes = data.map((d) => Number(d.close)).filter((v) => !isNaN(v));
    if (closes.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const pad = 10;

    ctx.clearRect(0, 0, W, H);

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad, 0, H - pad);
    gradient.addColorStop(0, "rgba(139,92,246,0.3)");
    gradient.addColorStop(1, "rgba(139,92,246,0)");

    const xStep = (W - pad * 2) / (closes.length - 1);
    const toY = (v: number) => pad + ((max - v) / range) * (H - pad * 2);

    // Draw area
    ctx.beginPath();
    ctx.moveTo(pad, toY(closes[0]));
    closes.forEach((v, i) => ctx.lineTo(pad + i * xStep, toY(v)));
    ctx.lineTo(pad + (closes.length - 1) * xStep, H);
    ctx.lineTo(pad, H);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(pad, toY(closes[0]));
    closes.forEach((v, i) => ctx.lineTo(pad + i * xStep, toY(v)));
    const isUp = closes[closes.length - 1] >= closes[0];
    ctx.strokeStyle = isUp ? "#10b981" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [data]);

  return <canvas ref={canvasRef} width={900} height={200} className="w-full h-48 rounded-xl" />;
});

const TradingTable = memo(function TradingTable({
  candles,
  setHovered,
}: {
  candles: StockCandle[];
  setHovered: (c: StockCandle | null) => void;
}) {
  return (
    <table className="w-full text-sm" id="trading-table">
      <thead className="sticky top-0 bg-[#0d0d16] border-b border-white/8">
        <tr>
          {["Ngày", "Mở", "Cao", "Thấp", "Đóng", "Khối lượng"].map((h) => (
            <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...candles].reverse().map((c, i) => {
          const up = Number(c.close) >= Number(c.open);
          return (
            <tr
              key={i}
              className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
              onMouseEnter={() => setHovered(c)}
              onMouseLeave={() => setHovered(null)}
            >
              <td className="px-4 py-2.5 text-slate-400">{String(c.time || c.date || "—")}</td>
              <td className="px-4 py-2.5 text-slate-300">{fmt(c.open)}</td>
              <td className="px-4 py-2.5 text-emerald-400">{fmt(c.high)}</td>
              <td className="px-4 py-2.5 text-red-400">{fmt(c.low)}</td>
              <td className="px-4 py-2.5 font-semibold" style={{ color: up ? "#10b981" : "#ef4444" }}>
                {fmt(c.close)}
              </td>
              <td className="px-4 py-2.5 text-slate-400">{fmt(c.volume, 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

export default function TradingTab({
  data,
  loading,
  symbol,
}: {
  data: TradingResponse | null;
  loading: boolean;
  symbol: string;
}) {
  const [hovered, setHovered] = useState<StockCandle | null>(null);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-48 rounded-2xl bg-white/8" />
        <div className="h-64 rounded-2xl bg-white/6" />
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-4xl mb-3">📉</span>
        <p>Không có dữ liệu giao dịch</p>
      </div>
    );
  }

  const candles = data.data;
  const last = hovered ?? candles[candles.length - 1];
  const isUp = Number(last.close) >= Number(last.open);

  return (
    <div className="flex flex-col gap-5">
      {/* Chart */}
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300">Lịch sử giá — {symbol}</h3>
          <span className="text-xs text-slate-500">{data.count} phiên</span>
        </div>
        <MiniChart data={candles} />
      </div>

      {/* Hovered details */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Giá mở", value: fmt(last.open) },
          { label: "Giá cao", value: fmt(last.high), color: "#10b981" },
          { label: "Giá thấp", value: fmt(last.low), color: "#ef4444" },
          { label: "Giá đóng", value: fmt(last.close), color: isUp ? "#10b981" : "#ef4444" },
          { label: "Khối lượng", value: fmt(last.volume, 0) },
          { label: "Ngày", value: String(last.time || last.date || "—") },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-white/8 bg-white/4 p-4"
          >
            <div className="text-xs text-slate-500 mb-1">{m.label}</div>
            <div className="text-lg font-bold" style={m.color ? { color: m.color } : { color: "#e2e8f0" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden">
        <div className="border-b border-white/8 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-300">Chi tiết phiên giao dịch</h3>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <TradingTable candles={candles} setHovered={setHovered} />
        </div>
      </div>
    </div>
  );
}
