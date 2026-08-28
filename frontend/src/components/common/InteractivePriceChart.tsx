"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, ChevronUp, Table as TableIcon } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ChartDataPoint {
  time?: string;
  date?: string;
  buy?: number;
  sell?: number;
  price?: number;
  close?: number;
  open?: number;
  high?: number;
  low?: number;
  value?: number;
  [key: string]: string | number | undefined;
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
  semanticColor?: 'primary' | 'positive' | 'negative';
}

function resolveChartColors(): { primary: string; positive: string; negative: string } {
  if (typeof document === 'undefined') {
    return { primary: '#1e4e8c', positive: '#137a5b', negative: '#b42318' };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--chart-primary').trim() || '#1e4e8c',
    positive: style.getPropertyValue('--chart-positive').trim() || '#137a5b',
    negative: style.getPropertyValue('--chart-negative').trim() || '#b42318',
  };
}

function useChartColors() {
  const { resolvedTheme } = useTheme();
  // resolvedTheme triggers re-computation when theme changes (CSS vars update)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveChartColors(), [resolvedTheme]);
}

interface InteractivePriceChartProps {
  data: ChartDataPoint[];
  series?: ChartSeries[];
  timeframe?: string;
  onTimeframeChange?: (timeframe: string) => void;
  unit?: string;
  title?: string;
  height?: number;
  showTableFallback?: boolean;
}

function formatNumber(val: number | undefined | null, unit?: string): string {
  if (val == null || isNaN(val)) return "—";
  if (unit === "đ/lượng" || (val >= 1000000 && !unit?.includes("USD"))) {
    return (val / 1000000).toFixed(2) + " triệu";
  }
  if (unit === "USD/oz" || val < 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(val);
  }
  return new Intl.NumberFormat("vi-VN").format(val);
}

export default function InteractivePriceChart({
  data,
  series: seriesProp,
  timeframe = "1M",
  onTimeframeChange,
  unit,
  title,
  height = 280,
  showTableFallback = true,
}: InteractivePriceChartProps) {
  const chartColors = useChartColors();

  const series = useMemo(() => seriesProp || [
    { key: "buy", label: "Giá Mua", semanticColor: "positive" as const },
    { key: "sell", label: "Giá Bán", semanticColor: "negative" as const },
  ], [seriesProp]);

  const getSeriesColor = useCallback((s: ChartSeries) => {
    if (s.semanticColor) {
      return chartColors[s.semanticColor];
    }
    return s.color || chartColors.primary;
  }, [chartColors]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const [showTable, setShowTable] = useState<boolean>(false);
  const { resolvedTheme } = useTheme();
  const isLightTheme = resolvedTheme === "light";

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

  // Compute Min & Max for Y Axis scaling and statistics
  const { minY, maxY, yTicks, xTicks, stats } = useMemo(() => {
    if (!data.length) {
      return {
        minY: 0,
        maxY: 100,
        yTicks: [],
        xTicks: [],
        stats: { min: 0, max: 0, first: 0, latest: 0, change: 0, changePercent: 0 },
      };
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

    // Key stats based on main series
    const mainKey = activeSeries[0]?.key || "price";
    const getVal = (d: ChartDataPoint) =>
      (typeof d[mainKey] === "number" ? (d[mainKey] as number) : (d.price ?? d.close ?? d.value ?? 0)) as number;

    const firstVal = getVal(data[0]);
    const latestVal = getVal(data[data.length - 1]);
    const change = latestVal - firstVal;
    const changePercent = firstVal > 0 ? (change / firstVal) * 100 : 0;

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

    return {
      minY: computedMin,
      maxY: computedMax,
      yTicks: yTicksList,
      xTicks: xTicksList,
      stats: {
        min,
        max,
        first: firstVal,
        latest: latestVal,
        change,
        changePercent,
      },
    };
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

    const padLeft = 12;
    const padRight = 70; // Y-axis labels margin on right
    const padTop = 16;
    const padBottom = 28; // X-axis labels margin on bottom

    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const toX = (index: number) => padLeft + (index / Math.max(1, data.length - 1)) * chartW;
    const toY = (val: number) => padTop + chartH - ((val - minY) / (maxY - minY || 1)) * chartH;

    // 1. Draw horizontal grid lines & Y-axis labels
    ctx.lineWidth = 1;
    ctx.strokeStyle = isLightTheme ? "rgba(23, 32, 51, 0.07)" : "rgba(241, 245, 249, 0.07)";
    ctx.fillStyle = isLightTheme ? "#66758c" : "#95a4b8";
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

    // 3. Draw Series Lines & Area Gradients (area-fill <= 12% opacity per UI plan)
    const effectiveSeries =
      activeSeries.length > 0
        ? activeSeries
        : [{ key: "price", label: "Giá", color: chartColors.primary, semanticColor: "primary" as const }];

    effectiveSeries.forEach((s) => {
      const points: { x: number; y: number; val: number }[] = [];
      data.forEach((d, i) => {
        const val = d[s.key] ?? d.price ?? d.close ?? d.value;
        if (typeof val === "number") {
          points.push({ x: toX(i), y: toY(val), val });
        }
      });

      if (points.length < 2) return;

      const seriesColor = getSeriesColor(s);
      // Area gradient: 10% opacity at top, fading to 0%
      const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      gradient.addColorStop(0, `${seriesColor}1a`); // ~10% opacity
      gradient.addColorStop(1, `${seriesColor}00`); // 0% opacity

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, padTop + chartH);
      ctx.lineTo(points[0].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Stroke line
      ctx.beginPath();
      if (s.dashed) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = seriesColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 4. Draw Hover Crosshair and Highlighted Dots
    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < data.length) {
      const hoverX = toX(hoverIndex);

      // Vertical crosshair line
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(hoverX, padTop);
      ctx.lineTo(hoverX, padTop + chartH);
      ctx.strokeStyle = isLightTheme ? "rgba(30, 78, 140, 0.35)" : "rgba(126, 180, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // Highlight dots for each active series
      effectiveSeries.forEach((s) => {
        const val =
          data[hoverIndex][s.key] ??
          data[hoverIndex].price ??
          data[hoverIndex].close ??
          data[hoverIndex].value;
        if (typeof val === "number") {
          const hoverY = toY(val);
          const seriesColor = getSeriesColor(s);

          // Outer subtle ring
          ctx.beginPath();
          ctx.arc(hoverX, hoverY, 6, 0, Math.PI * 2);
          ctx.fillStyle = `${seriesColor}33`;
          ctx.fill();

          // Inner solid dot
          ctx.beginPath();
          ctx.arc(hoverX, hoverY, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = seriesColor;
          ctx.fill();
          ctx.strokeStyle = isLightTheme ? "#ffffff" : "#171e28";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }
  }, [containerWidth, height, data, activeSeries, minY, maxY, yTicks, xTicks, hoverIndex, unit, isLightTheme, getSeriesColor, chartColors.primary]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!data.length) return;
    
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHoverIndex(prev => {
        const current = prev ?? -1;
        return Math.min(current + 1, data.length - 1);
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHoverIndex(prev => {
        const current = prev ?? data.length;
        return Math.max(current - 1, 0);
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHoverIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHoverIndex(data.length - 1);
    } else if (e.key === 'Escape') {
      setHoverIndex(null);
    }
  }, [data.length]);

  // Handle Mouse Hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !data.length) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const padLeft = 12;
    const padRight = 70;
    const chartW = containerWidth - padLeft - padRight;

    const relativeX = Math.max(0, Math.min(mouseX - padLeft, chartW));
    const rawIndex = Math.round((relativeX / chartW) * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(rawIndex, data.length - 1));

    setHoverIndex(clampedIndex);
  };

  const handleMouseLeave = () => {
    // Don't clear if keyboard navigation is active (container has focus)
    if (containerRef.current?.contains(document.activeElement)) return;
    setHoverIndex(null);
  };

  const activePoint = hoverIndex != null ? data[hoverIndex] : null;
  const latestPoint = data.length > 0 ? data[data.length - 1] : null;

  return (
    <Card className="flex flex-col gap-4 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4 md:p-5 shadow-xs">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--border-default) pb-3.5">
        <div>
          {title && (
            <CardTitle className="text-sm font-semibold text-(--text-primary)">
              {title}
            </CardTitle>
          )}
          {activePoint ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-(--text-secondary) mt-1 tabular-nums">
              <span className="font-medium text-(--text-tertiary)">
                {activePoint.date || activePoint.time}
              </span>
              {activeSeries.map((s) => {
                const val = activePoint[s.key] ?? activePoint.price ?? activePoint.close;
                return (
                  <span key={s.key} className="font-semibold" style={{ color: getSeriesColor(s) }}>
                    {s.label}: {formatNumber(typeof val === "number" ? val : null, unit)} {unit}
                  </span>
                );
              })}
            </div>
          ) : latestPoint ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-(--text-secondary) mt-1 tabular-nums">
              <span className="text-(--text-tertiary)">
                Cập nhật gần nhất: {latestPoint.date || latestPoint.time}
              </span>
              {activeSeries.map((s) => {
                const val = latestPoint[s.key] ?? latestPoint.price ?? latestPoint.close;
                return (
                  <span key={s.key} className="font-semibold text-(--text-primary)">
                    {s.label}: {formatNumber(typeof val === "number" ? val : null, unit)} {unit}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-(--text-tertiary) mt-1">
              Rê chuột lên biểu đồ để xem thông tin chi tiết
            </p>
          )}
        </div>

        {/* Timeframe selector using Tabs */}
        {onTimeframeChange && (
          <Tabs value={timeframe} onValueChange={onTimeframeChange} className="w-auto">
            <TabsList className="h-8 bg-(--bg-subtle) p-0.5 border border-(--border-default) rounded-lg">
              {["1D", "1W", "1M", "1Y"].map((tf) => (
                <TabsTrigger
                  key={tf}
                  value={tf}
                  className="h-7 px-2.5 text-xs font-medium rounded-md data-[state=active]:bg-(--bg-surface) data-[state=active]:text-(--text-primary) data-[state=active]:shadow-xs cursor-pointer"
                >
                  {tf}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Keyboard-accessible data announcement */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {activePoint && (
          <span>
            {activePoint.date || activePoint.time}
            {activeSeries.map(s => {
              const val = activePoint[s.key] ?? activePoint.price ?? activePoint.close;
              return typeof val === 'number' ? ` ${s.label}: ${formatNumber(val, unit)}` : '';
            }).join('')}
          </span>
        )}
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef} 
        aria-label={title ? `Biểu đồ: ${title}` : "Biểu đồ giá"}
        aria-roledescription="Biểu đồ tương tác"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (hoverIndex == null && data.length > 0) setHoverIndex(data.length - 1); }}
        onBlur={() => setHoverIndex(null)}
        className="relative w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) rounded-lg" 
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair block w-full h-full"
        />

        {/* Floating Tooltip Card */}
        {activePoint && hoverIndex != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-(--border-default) bg-(--bg-surface)/95 px-3 py-2 text-xs text-(--text-primary) backdrop-blur-md shadow-lg transition-all duration-75"
            style={{
              left: Math.min(
                Math.max(12, (hoverIndex / Math.max(1, data.length - 1)) * (containerWidth - 170)),
                containerWidth - 180
              ),
            }}
          >
            <div className="text-[11px] font-medium text-(--text-secondary) mb-1 border-b border-(--border-default) pb-1">
              {activePoint.date || activePoint.time}
            </div>
            <div className="flex flex-col gap-1 tabular-nums">
              {activeSeries.map((s) => {
                const val = activePoint[s.key] ?? activePoint.price ?? activePoint.close;
                return (
                  <div key={s.key} className="flex justify-between gap-3">
                    <span style={{ color: getSeriesColor(s) }} className="font-medium">
                      {s.label}:
                    </span>
                    <span className="font-semibold text-(--text-primary)">
                      {formatNumber(typeof val === "number" ? val : null, unit)}
                    </span>
                  </div>
                );
              })}
              {activePoint.buy != null && activePoint.sell != null && (
                <div className="flex justify-between gap-3 border-t border-(--border-default) pt-1 text-[10px] text-(--text-secondary)">
                  <span>Chênh lệch:</span>
                  <span className="font-semibold text-(--text-primary)">
                    {formatNumber(Math.abs(Number(activePoint.sell) - Number(activePoint.buy)), unit)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary Strip & Accessible Table Fallback */}
      <div className="border-t border-(--border-default) pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-(--text-secondary) tabular-nums">
          <span>
            Cao nhất: <strong className="text-(--text-primary)">{formatNumber(stats.max, unit)}</strong>
          </span>
          <span>
            Thấp nhất: <strong className="text-(--text-primary)">{formatNumber(stats.min, unit)}</strong>
          </span>
          <span>
            Biến động chu kỳ:{" "}
            <strong
              className={cn(
                stats.change >= 0 ? "text-(--status-positive)" : "text-(--status-negative)"
              )}
            >
              {stats.change >= 0 ? "+" : ""}
              {formatNumber(stats.change, unit)} ({stats.changePercent >= 0 ? "+" : ""}
              {stats.changePercent.toFixed(2)}%)
            </strong>
          </span>
        </div>

        {showTableFallback && data.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTable((prev) => !prev)}
            className="gap-1.5 text-xs text-(--text-secondary) hover:text-(--text-primary) h-7 px-2"
          >
            <TableIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{showTable ? "Ẩn bảng số liệu" : "Xem bảng số liệu"}</span>
            {showTable ? (
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>

      {/* Accessible Table Fallback for Screen Readers & Keyboard Access */}
      {showTable && data.length > 0 && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-(--border-default) bg-(--bg-subtle)">
          <Table>
            <TableHeader className="sticky top-0 bg-(--bg-subtle) z-10">
              <TableRow className="border-b border-(--border-default)">
                <TableHead className="text-xs font-semibold text-(--text-secondary) py-2">
                  Thời gian
                </TableHead>
                {activeSeries.map((s) => (
                  <TableHead
                    key={s.key}
                    className="text-xs font-semibold text-(--text-secondary) text-right py-2"
                  >
                    {s.label} {unit ? `(${unit})` : ""}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(-20).reverse().map((point, idx) => (
                <TableRow
                  key={idx}
                  className="border-b border-(--border-default) hover:bg-(--bg-surface)/60 text-xs"
                >
                  <TableCell className="py-2 text-(--text-secondary)">
                    {point.date || point.time || `#${idx + 1}`}
                  </TableCell>
                  {activeSeries.map((s) => {
                    const val = point[s.key] ?? point.price ?? point.close;
                    return (
                      <TableCell
                        key={s.key}
                        className="py-2 text-right font-medium tabular-nums text-(--text-primary)"
                      >
                        {formatNumber(typeof val === "number" ? val : null, unit)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
