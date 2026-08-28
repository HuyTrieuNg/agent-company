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
          className={`h-8 gap-2 border-(--border-default) text-xs font-medium transition-colors ${
            hasFilter
              ? "border-(--border-strong) bg-(--bg-selected) text-(--text-primary)"
              : "bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)"
          }`}
        >
          <CalendarIcon className={`h-3.5 w-3.5 ${hasFilter ? "text-(--action-primary)" : "text-(--text-tertiary)"}`} />
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
              className="ml-1 rounded p-0.5 text-(--text-tertiary) hover:text-(--status-negative) cursor-pointer"
              title="Xóa lọc ngày"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-4 bg-(--bg-surface) border-(--border-default) shadow-(--shadow-overlay) rounded-lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-(--border-default) pb-2.5">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-(--action-primary)" />
              <span className="text-xs font-bold text-(--text-primary)">Chọn Khoảng Thời Gian</span>
            </div>
            {hasFilter && (
              <Badge variant="secondary" className="text-[10px] bg-(--bg-selected) text-(--action-primary)">
                Đang kích hoạt
              </Badge>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold text-(--text-secondary) mb-2 block">Chọn nhanh</span>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(0)}
                className="h-7 text-[11px] bg-(--bg-subtle) hover:bg-(--bg-selected) hover:text-(--text-primary) text-(--text-secondary) rounded-md"
              >
                Hôm nay
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(7)}
                className="h-7 text-[11px] bg-(--bg-subtle) hover:bg-(--bg-selected) hover:text-(--text-primary) text-(--text-secondary) rounded-md"
              >
                7 ngày qua
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(30)}
                className="h-7 text-[11px] bg-(--bg-subtle) hover:bg-(--bg-selected) hover:text-(--text-primary) text-(--text-secondary) rounded-md"
              >
                30 ngày qua
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={setThisMonth}
                className="h-7 text-[11px] bg-(--bg-subtle) hover:bg-(--bg-selected) hover:text-(--text-primary) text-(--text-secondary) rounded-md"
              >
                Tháng này
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreset(90)}
                className="h-7 text-[11px] bg-(--bg-subtle) hover:bg-(--bg-selected) hover:text-(--text-primary) text-(--text-secondary) rounded-md"
              >
                3 tháng qua
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-7 text-[11px] bg-(--bg-subtle) hover:bg-[color-mix(in_srgb,var(--status-negative)_12%,transparent)] hover:text-(--status-negative) text-(--text-tertiary) rounded-md"
              >
                Tất cả
              </Button>
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="space-y-2.5 pt-1">
            <span className="text-[11px] font-semibold text-(--text-secondary) block">Tùy chỉnh ngày</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-(--text-tertiary) mb-1 block">Từ ngày</label>
                <Input
                  type="date"
                  value={tempFrom}
                  onChange={(e) => setTempFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-(--text-tertiary) mb-1 block">Đến ngày</label>
                <Input
                  type="date"
                  value={tempTo}
                  onChange={(e) => setTempTo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-(--border-default) pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-7 text-xs text-(--text-secondary) hover:text-(--text-primary)"
            >
              Đặt lại
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleApply}
              className="h-7 gap-1 text-xs font-semibold rounded-md"
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
