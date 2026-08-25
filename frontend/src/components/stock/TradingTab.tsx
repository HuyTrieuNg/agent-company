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
      <TableHeader className="sticky top-0 bg-[#0d0d16] z-10">
        <TableRow className="border-b border-white/10 hover:bg-transparent">
          {["Ngày", "Mở", "Cao", "Thấp", "Đóng", "Khối lượng"].map((h) => (
            <TableHead key={h} className="text-xs font-semibold text-slate-400">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...candles].reverse().map((c, i) => {
          const up = Number(c.close) >= Number(c.open);
          return (
            <TableRow
              key={i}
              className="cursor-pointer transition-colors hover:bg-white/5"
              onMouseEnter={() => setHovered(c)}
              onMouseLeave={() => setHovered(null)}
            >
              <TableCell className="text-slate-400 font-medium text-xs py-3">
                {String(c.time || c.date || "—")}
              </TableCell>
              <TableCell className="text-slate-300 text-xs py-3">{fmt(c.open)}</TableCell>
              <TableCell className="text-emerald-400 font-medium text-xs py-3">{fmt(c.high)}</TableCell>
              <TableCell className="text-red-400 font-medium text-xs py-3">{fmt(c.low)}</TableCell>
              <TableCell
                className="font-bold text-xs py-3"
                style={{ color: up ? "#10b981" : "#ef4444" }}
              >
                {fmt(c.close)}
              </TableCell>
              <TableCell className="text-slate-400 text-xs py-3">{fmt(c.volume, 0)}</TableCell>
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
        <Skeleton className="h-72 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
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
        series={[{ key: "close", label: "Giá đóng cửa", color: "#8b5cf6" }]}
        title={`Biểu đồ lịch sử giá giao dịch — ${symbol} (${data.count} phiên)`}
        unit="đ"
        height={280}
      />

      {/* Hovered details card */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {[
          { label: "Phiên / Ngày", value: String(last.time || last.date || "—") },
          { label: "Giá mở", value: fmt(last.open) },
          { label: "Giá cao", value: fmt(last.high), color: "#10b981" },
          { label: "Giá thấp", value: fmt(last.low), color: "#ef4444" },
          { label: "Giá đóng", value: fmt(last.close), color: isUp ? "#10b981" : "#ef4444" },
          { label: "Khối lượng", value: fmt(last.volume, 0) },
        ].map((m) => (
          <Card
            key={m.label}
            className="p-3.5 border-white/8 bg-white/4 backdrop-blur-md"
          >
            <div className="text-[11px] text-slate-500 mb-1">{m.label}</div>
            <div className="text-sm md:text-base font-bold truncate" style={m.color ? { color: m.color } : { color: "#e2e8f0" }}>
              {m.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Trading History Table */}
      <Card className="border-white/8 bg-white/4 overflow-hidden">
        <CardHeader className="border-b border-white/8 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300">
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

