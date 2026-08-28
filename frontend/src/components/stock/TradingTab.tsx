"use client";

import { useState, memo } from "react";
import { TradingResponse, StockCandle } from "@/lib/stockApi";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(val: unknown, digits = 0): string {
  const n = Number(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

const TradingTable = memo(function TradingTable({
  candles,
  setHovered,
}: {
  candles: StockCandle[];
  setHovered: (c: StockCandle | null) => void;
}) {
  return (
    <Table id="trading-table">
      <TableHeader className="sticky top-0 bg-(--bg-subtle) z-10">
        <TableRow className="border-b border-(--border-default) hover:bg-transparent">
          <TableHead className="text-xs font-semibold text-(--text-secondary) py-2.5">
            Ngày
          </TableHead>
          <TableHead className="text-xs font-semibold text-(--text-secondary) text-right py-2.5">
            Mở
          </TableHead>
          <TableHead className="text-xs font-semibold text-(--text-secondary) text-right py-2.5">
            Cao
          </TableHead>
          <TableHead className="text-xs font-semibold text-(--text-secondary) text-right py-2.5">
            Thấp
          </TableHead>
          <TableHead className="text-xs font-semibold text-(--text-secondary) text-right py-2.5">
            Đóng
          </TableHead>
          <TableHead className="text-xs font-semibold text-(--text-secondary) text-right py-2.5">
            Khối lượng
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...candles].reverse().map((c, i) => {
          const up = Number(c.close) >= Number(c.open);
          return (
            <TableRow
              key={i}
              className="cursor-pointer transition-colors border-b border-(--border-default) hover:bg-(--bg-subtle)/60"
              onMouseEnter={() => setHovered(c)}
              onMouseLeave={() => setHovered(null)}
            >
              <TableCell className="text-(--text-secondary) font-medium text-xs py-2.5">
                {String(c.time || c.date || "—")}
              </TableCell>
              <TableCell className="text-(--text-primary) text-right text-xs py-2.5 tabular-nums">
                {fmt(c.open)}
              </TableCell>
              <TableCell className="text-(--status-positive) font-medium text-right text-xs py-2.5 tabular-nums">
                {fmt(c.high)}
              </TableCell>
              <TableCell className="text-(--status-negative) font-medium text-right text-xs py-2.5 tabular-nums">
                {fmt(c.low)}
              </TableCell>
              <TableCell
                className={cn(
                  "font-bold text-right text-xs py-2.5 tabular-nums",
                  up ? "text-(--status-positive)" : "text-(--status-negative)"
                )}
              >
                {fmt(c.close)}
              </TableCell>
              <TableCell className="text-(--text-secondary) text-right text-xs py-2.5 tabular-nums">
                {fmt(c.volume, 0)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
      <div className="space-y-5">
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-20 border border-(--border-default) bg-(--bg-surface) rounded-xl text-(--text-tertiary)">
        <TrendingDown className="h-8 w-8 mb-2 text-(--text-tertiary)" aria-hidden="true" />
        <p className="text-xs">Không có dữ liệu giao dịch</p>
      </Card>
    );
  }

  const candles = data.data;
  const last = hovered ?? candles[candles.length - 1];
  const isUp = Number(last.close) >= Number(last.open);

  const chartData = candles.map((c) => ({
    date: String(c.time || c.date || ""),
    close: Number(c.close),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Interactive Price Chart with X/Y Axes and Hover Tooltip */}
      <InteractivePriceChart
        data={chartData}
        series={[{ key: "close", label: "Giá đóng cửa", color: "", semanticColor: "primary" }]}
        title={`Biểu đồ lịch sử giá giao dịch — ${symbol} (${data.count} phiên)`}
        unit="đ"
        height={280}
      />

      {/* Hovered details card */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {[
          { label: "Phiên / Ngày", value: String(last.time || last.date || "—") },
          { label: "Giá mở", value: fmt(last.open) },
          { label: "Giá cao", value: fmt(last.high), colorClass: "text-(--status-positive)" },
          { label: "Giá thấp", value: fmt(last.low), colorClass: "text-(--status-negative)" },
          {
            label: "Giá đóng",
            value: fmt(last.close),
            colorClass: isUp ? "text-(--status-positive)" : "text-(--status-negative)",
          },
          { label: "Khối lượng", value: fmt(last.volume, 0) },
        ].map((m) => (
          <Card
            key={m.label}
            className="p-3.5 border border-(--border-default) bg-(--bg-surface) rounded-xl shadow-xs"
          >
            <div className="text-[11px] font-medium text-(--text-secondary) mb-1">{m.label}</div>
            <div
              className={cn(
                "text-sm md:text-base font-bold tabular-nums truncate text-(--text-primary)",
                m.colorClass
              )}
            >
              {m.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Trading History Table */}
      <Card className="border border-(--border-default) bg-(--bg-surface) overflow-hidden rounded-xl shadow-xs">
        <CardHeader className="border-b border-(--border-default) px-5 py-3.5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
              Chi tiết các phiên giao dịch
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {candles.length} phiên gần nhất
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <TradingTable candles={candles} setHovered={setHovered} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
