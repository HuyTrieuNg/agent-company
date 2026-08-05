"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";

export interface ChartDataPoint {
  time?: string;
  date?: string;
  buy?: number;
  sell?: number;
  price?: number;
  close?: number;
  value?: number;
  [key: string]: string | number | undefined;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

interface InteractivePriceChartProps {
  data: ChartDataPoint[];
  series?: ChartSeries[];
  timeframe?: string;
  onTimeframeChange?: (timeframe: string) => void;
  unit?: string;
  title?: string;
  height?: number;
}

function formatNumber(val: number | undefined | null, unit?: string): string {
  if (val == null || isNaN(val)) return "—";
  if (unit === "đ/lượng" || val >= 1000000) {
    if (val >= 1000000) {
      return (val / 1000000).toFixed(2) + " triệu";
    }
  }
  return new Intl.NumberFormat("vi-VN").format(val);
}

export default function InteractivePriceChart({
  data,
  series = [
    { key: "buy", label: "Giá Mua", color: "#10b981" },
    { key: "sell", label: "Giá Bán", color: "#ef4444" },
  ],
  timeframe = "1M",
  onTimeframeChange,
  unit,
  title,
  height = 280,
}: InteractivePriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);

  // Measure container width for responsive canvas rendering
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Filter series that actually exist in the data
  const activeSeries = useMemo(() => {
    if (!data.length) return series;
    return series.filter((s) =>
      data.some((d) => d[s.key] != null && typeof d[s.key] === "number")
    );
  }, [data, series]);

  // Compute Min & Max for Y Axis scaling
  const { minY, maxY, yTicks, xTicks } = useMemo(() => {
    if (!data.length) {
      return { minY: 0, maxY: 100, yTicks: [], xTicks: [] };
    }

    let min = Infinity;
    let max = -Infinity;

    data.forEach((d) => {
      activeSeries.forEach((s) => {
        const val = d[s.key];
        if (typeof val === "number") {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      });
      // Also fallback to price / close if activeSeries empty
      if (activeSeries.length === 0) {
        const fallback = d.price ?? d.close ?? d.value;
        if (typeof fallback === "number") {
          if (fallback < min) min = fallback;
          if (fallback > max) max = fallback;
        }
      }
    });

    if (min === Infinity || max === -Infinity) {
      min = 0;
      max = 100;
    }

    // Add padding to Y-axis range
    const diff = max - min || 1;
    const padding = diff * 0.08;
    const computedMin = min - padding;
    const computedMax = max + padding;

    // Generate 5 Y-axis ticks
    const tickCount = 5;
    const yTicksList: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      yTicksList.push(computedMin + ((computedMax - computedMin) / (tickCount - 1)) * i);
    }

    // Generate X-axis ticks (4-6 sample indexes)
    const xStep = Math.max(1, Math.floor(data.length / 5));
    const xTicksList: { index: number; label: string }[] = [];
    for (let i = 0; i < data.length; i += xStep) {
      const point = data[i];
      const label = point.time || point.date || `#${i + 1}`;
      xTicksList.push({ index: i, label });
    }
    // Always include last item if not included
    if (xTicksList.length > 0 && xTicksList[xTicksList.length - 1].index !== data.length - 1) {
      const lastPoint = data[data.length - 1];
      xTicksList.push({
        index: data.length - 1,
        label: lastPoint.time || lastPoint.date || `#${data.length}`,
      });
    }

    return { minY: computedMin, maxY: computedMax, yTicks: yTicksList, xTicks: xTicksList };
  }, [data, activeSeries]);

  // Canvas Drawing Logic
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = containerWidth;
    const H = height;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);

    const padLeft = 10;
    const padRight = 65; // Y-axis labels margin on right
    const padTop = 20;
    const padBottom = 30; // X-axis labels margin on bottom

    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const toX = (index: number) => padLeft + (index / Math.max(1, data.length - 1)) * chartW;
    const toY = (val: number) => padTop + chartH - ((val - minY) / (maxY - minY || 1)) * chartH;

    // 1. Draw horizontal grid lines & Y-axis labels
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    yTicks.forEach((tickVal) => {
      const y = toY(tickVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();

      // Render Y-axis text label on the right
      ctx.fillText(formatNumber(tickVal, unit), padLeft + chartW + 8, y);
    });

    // 2. Draw vertical grid lines & X-axis labels
    xTicks.forEach((tick) => {
      const x = toX(tick.index);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + chartH);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillText(tick.label, x, padTop + chartH + 16);
    });

    // 3. Draw Series Lines & Gradients
    const effectiveSeries = activeSeries.length > 0
      ? activeSeries
      : [{ key: "price", label: "Giá", color: "#8b5cf6" }];

    effectiveSeries.forEach((s) => {
      const points: { x: number; y: number; val: number }[] = [];
      data.forEach((d, i) => {
        const val = d[s.key] ?? d.price ?? d.close ?? d.value;
        if (typeof val === "number") {
          points.push({ x: toX(i), y: toY(val), val });
        }
      });

      if (points.length < 2) return;

      // Area gradient
      const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      gradient.addColorStop(0, `${s.color}33`); // 20% opacity
      gradient.addColorStop(1, `${s.color}00`); // 0% opacity

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, padTop + chartH);
      ctx.lineTo(points[0].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Smooth Stroke line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.stroke();
    });

    // 4. Draw Hover Crosshair and Highlighted Dots
    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < data.length) {
      const hoverX = toX(hoverIndex);

      // Vertical crosshair line
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(hoverX, padTop);
      ctx.lineTo(hoverX, padTop + chartH);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);

      // Highlight dots for each active series
      effectiveSeries.forEach((s) => {
        const val = data[hoverIndex][s.key] ?? data[hoverIndex].price ?? data[hoverIndex].close ?? data[hoverIndex].value;
        if (typeof val === "number") {
          const hoverY = toY(val);

          // Outer glowing ring
          ctx.beginPath();
          ctx.arc(hoverX, hoverY, 7, 0, Math.PI * 2);
          ctx.fillStyle = `${s.color}55`;
          ctx.fill();

          // Inner solid dot
          ctx.beginPath();
          ctx.arc(hoverX, hoverY, 4, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }
  }, [containerWidth, height, data, activeSeries, minY, maxY, yTicks, xTicks, hoverIndex, unit]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle Mouse Hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !data.length) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const padLeft = 10;
    const padRight = 65;
    const chartW = containerWidth - padLeft - padRight;

    const relativeX = Math.max(0, Math.min(mouseX - padLeft, chartW));
    const rawIndex = Math.round((relativeX / chartW) * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(rawIndex, data.length - 1));

    setHoverIndex(clampedIndex);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/4 p-4 shadow-xl backdrop-blur-md">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 pb-3">
        <div>
          {title && <h3 className="text-sm font-bold text-slate-100">{title}</h3>}
          {activePoint ? (
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>🕒 {activePoint.date || activePoint.time}</span>
              {activeSeries.map((s) => {
                const val = activePoint[s.key] ?? activePoint.price ?? activePoint.close;
                return (
                  <span key={s.key} style={{ color: s.color }} className="font-semibold">
                    {s.label}: {formatNumber(typeof val === "number" ? val : null, unit)} {unit}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Rê chuột lên biểu đồ để xem thông tin chi tiết</p>
          )}
        </div>

        {/* Timeframe buttons */}
        {onTimeframeChange && (
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/5 p-1">
            {["1D", "1W", "1M", "1Y"].map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  timeframe === tf
                    ? "bg-[#8b5cf6] text-white shadow-[0_2px_8px_rgba(139,92,246,0.4)]"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair block w-full h-full"
        />

        {/* Floating Tooltip Card */}
        {activePoint && hoverIndex != null && (
          <div
            className="pointer-events-none absolute top-3 z-10 rounded-xl border border-white/15 bg-black/75 px-3 py-2 text-xs text-slate-100 backdrop-blur-md shadow-2xl transition-all duration-75"
            style={{
              left: Math.min(
                Math.max(10, (hoverIndex / Math.max(1, data.length - 1)) * (containerWidth - 160)),
                containerWidth - 180
              ),
            }}
          >
            <div className="text-[11px] font-semibold text-slate-400 mb-1 border-b border-white/10 pb-1">
              {activePoint.date || activePoint.time}
            </div>
            <div className="flex flex-col gap-1">
              {activeSeries.map((s) => {
                const val = activePoint[s.key] ?? activePoint.price ?? activePoint.close;
                return (
                  <div key={s.key} className="flex justify-between gap-3">
                    <span style={{ color: s.color }}>{s.label}:</span>
                    <span className="font-bold text-slate-50">
                      {formatNumber(typeof val === "number" ? val : null, unit)}
                    </span>
                  </div>
                );
              })}
              {activePoint.buy != null && activePoint.sell != null && (
                <div className="flex justify-between gap-3 border-t border-white/10 pt-1 text-[10px] text-slate-400">
                  <span>Chênh lệch (Spread):</span>
                  <span className="font-semibold text-amber-400">
                    {formatNumber(Math.abs(Number(activePoint.sell) - Number(activePoint.buy)), unit)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
