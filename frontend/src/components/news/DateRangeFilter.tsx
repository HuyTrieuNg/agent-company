"use client";

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, X, Check } from "lucide-react";

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onApply: (from: string, to: string) => void;
  onReset: () => void;
}

function formatDateDisplay(d: string): string {
  if (!d) return "";
  const [year, month, day] = d.split("-");
  if (!year || !month || !day) return d;
  return `${day}/${month}/${year}`;
}

export default function DateRangeFilter({
  dateFrom,
  dateTo,
  onApply,
  onReset,
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(dateFrom);
  const [tempTo, setTempTo] = useState(dateTo);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setTempFrom(dateFrom);
      setTempTo(dateTo);
    }
  };

  const handleApply = () => {
    onApply(tempFrom, tempTo);
    setIsOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTempFrom("");
    setTempTo("");
    onReset();
    setIsOpen(false);
  };

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    const formatDate = (date: Date) => date.toISOString().split("T")[0];
    const fromStr = formatDate(start);
    const toStr = formatDate(end);

    setTempFrom(fromStr);
    setTempTo(toStr);
    onApply(fromStr, toStr);
    setIsOpen(false);
  };

  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    const fromStr = formatDate(firstDay);
    const toStr = formatDate(now);

    setTempFrom(fromStr);
    setTempTo(toStr);
    onApply(fromStr, toStr);
    setIsOpen(false);
  };

  const hasFilter = Boolean(dateFrom || dateTo);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 gap-2 border-white/10 text-xs font-medium transition-all ${
            hasFilter
              ? "border-violet-500/50 bg-violet-600/15 text-violet-200 hover:bg-violet-600/25"
              : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100"
          }`}
        >
          <CalendarIcon className={`h-3.5 w-3.5 ${hasFilter ? "text-violet-400" : "text-slate-400"}`} />
          <span>
            {dateFrom && dateTo
              ? `${formatDateDisplay(dateFrom)} - ${formatDateDisplay(dateTo)}`
              : dateFrom
              ? `Từ ${formatDateDisplay(dateFrom)}`
              : dateTo
              ? `Đến ${formatDateDisplay(dateTo)}`
              : "Lọc theo ngày"}
          </span>

          {hasFilter && (
            <span
              onClick={handleClear}
              className="ml-1 rounded-full p-0.5 hover:bg-white/20 text-slate-400 hover:text-white cursor-pointer"
              title="Xóa lọc ngày"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-4 bg-[#0d0d16] border-white/15 shadow-2xl rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-bold text-slate-200">Chọn Khoảng Thời Gian</span>
            </div>
            {hasFilter && (
              <Badge variant="secondary" className="text-[10px] bg-violet-500/20 text-violet-300">
                Đang kích hoạt
              </Badge>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 mb-2 block">Chọn nhanh</span>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(0)}
                className="h-7 text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg"
              >
                Hôm nay
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(7)}
                className="h-7 text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg"
              >
                7 ngày qua
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(30)}
                className="h-7 text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg"
              >
                30 ngày qua
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={setThisMonth}
                className="h-7 text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg"
              >
                Tháng này
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(90)}
                className="h-7 text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg"
              >
                3 tháng qua
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-7 text-[11px] bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-slate-400 rounded-lg"
              >
                Tất cả
              </Button>
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="space-y-2.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 block">Tùy chỉnh ngày</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Từ ngày</label>
                <Input
                  type="date"
                  value={tempFrom}
                  onChange={(e) => setTempFrom(e.target.value)}
                  className="h-8 text-xs bg-white/5 border-white/10 rounded-xl"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Đến ngày</label>
                <Input
                  type="date"
                  value={tempTo}
                  onChange={(e) => setTempTo(e.target.value)}
                  className="h-8 text-xs bg-white/5 border-white/10 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-7 text-xs text-slate-400 hover:text-slate-200"
            >
              Đặt lại
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleApply}
              className="h-7 gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg shadow-md shadow-violet-500/20"
            >
              <Check className="h-3 w-3" />
              <span>Áp dụng</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
