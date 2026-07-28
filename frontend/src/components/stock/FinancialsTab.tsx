"use client";

import { useState } from "react";
import { FinancialsResponse } from "@/lib/stockApi";

type ReportType = "income_statement" | "balance_sheet" | "cash_flow" | "ratios";
type Period = "quarter" | "annual";

const REPORT_TYPES: { id: ReportType; label: string }[] = [
  { id: "income_statement", label: "KQKD" },
  { id: "balance_sheet", label: "CĐKT" },
  { id: "cash_flow", label: "Lưu chuyển tiền" },
  { id: "ratios", label: "Chỉ số TC" },
];

function fmtNum(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return String(val ?? "—");
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)} triệu`;
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export default function FinancialsTab({
  data,
  loading,
  symbol,
  onChangeReport,
}: {
  data: FinancialsResponse | null;
  loading: boolean;
  symbol: string;
  onChangeReport: (reportType: string, period: string) => Promise<void>;
}) {
  const [activeReport, setActiveReport] = useState<ReportType>("income_statement");
  const [activePeriod, setActivePeriod] = useState<Period>("quarter");
  const [tabLoading, setTabLoading] = useState(false);

  async function changeReport(reportType: ReportType, period: Period) {
    setActiveReport(reportType);
    setActivePeriod(period);
    setTabLoading(true);
    try {
      await onChangeReport(reportType, period);
    } finally {
      setTabLoading(false);
    }
  }

  if (loading || tabLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 rounded-xl bg-white/8" />
        <div className="h-80 rounded-2xl bg-white/6" />
      </div>
    );
  }

  // Extract columns — skip common ID/time columns for display
  const records = data?.data ?? [];
  const allKeys = records.length > 0
    ? Object.keys(records[0]).filter(
        (k) => !["ticker", "period_begin", "period_end"].includes(k.toLowerCase())
      )
    : [];

  // Try to find period column
  const periodKey = allKeys.find((k) =>
    ["yearreport", "lengthreport", "year", "quarter", "period"].some((p) =>
      k.toLowerCase().includes(p)
    )
  );
  const dataKeys = allKeys.filter((k) => k !== periodKey);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Report type tabs */}
        <div className="flex gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.id}
              id={`report-${rt.id}`}
              onClick={() => changeReport(rt.id, activePeriod)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                activeReport === rt.id
                  ? "bg-[#8b5cf6]/20 text-[#a78bfa] border border-[#8b5cf6]/30"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        {/* Period toggle */}
        <div className="flex gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
          {(["quarter", "annual"] as Period[]).map((p) => (
            <button
              key={p}
              id={`period-${p}`}
              onClick={() => changeReport(activeReport, p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                activePeriod === p
                  ? "bg-[#06b6d4]/15 text-[#67e8f9] border border-[#06b6d4]/30"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {p === "quarter" ? "Quý" : "Năm"}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-slate-600">
          {symbol} — {records.length} kỳ
        </span>
      </div>

      {/* Table */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <span className="text-4xl mb-3">💰</span>
          <p>Không có dữ liệu báo cáo tài chính</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm" id="financials-table">
              <thead className="sticky top-0 bg-[#0d0d16] border-b border-white/8">
                <tr>
                  {periodKey && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 min-w-[100px]">
                      Kỳ
                    </th>
                  )}
                  {dataKeys.slice(0, 12).map((k) => (
                    <th
                      key={k}
                      className="px-4 py-3 text-right text-xs font-semibold text-slate-400 min-w-[130px]"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    {periodKey && (
                      <td className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">
                        {String(row[periodKey] ?? "—")}
                      </td>
                    )}
                    {dataKeys.slice(0, 12).map((k) => {
                      const raw = row[k];
                      const n = Number(raw);
                      const isNegative = !isNaN(n) && n < 0;
                      return (
                        <td
                          key={k}
                          className={`px-4 py-3 text-right ${
                            isNegative ? "text-red-400" : "text-slate-200"
                          }`}
                        >
                          {!isNaN(n) && raw !== null && raw !== ""
                            ? fmtNum(raw)
                            : String(raw ?? "—")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
