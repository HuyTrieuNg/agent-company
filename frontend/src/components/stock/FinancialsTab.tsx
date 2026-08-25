"use client";

import { useMemo, useState } from "react";
import { FinancialRecord, FinancialsResponse } from "@/lib/stockApi";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  SlidersHorizontal,
  TableProperties,
  Info,
  Search,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

type ReportType = "income_statement" | "balance_sheet" | "cash_flow" | "ratios";
type Period = "quarter" | "annual";
type LayoutMode = "indicators_row" | "periods_row";

const REPORT_TYPES: { id: ReportType; label: string; title: string }[] = [
  { id: "income_statement", label: "KQKD", title: "Kết quả kinh doanh" },
  { id: "balance_sheet", label: "CĐKT", title: "Cân đối kế toán" },
  { id: "cash_flow", label: "Lưu chuyển tiền", title: "Lưu chuyển tiền tệ" },
  { id: "ratios", label: "Chỉ số TC", title: "Chỉ số tài chính" },
];

const FINANCIAL_KEY_LABELS: Record<string, string> = {
  // Income Statement
  revenue: "Doanh thu thuần",
  netsales: "Doanh thu thuần",
  costofgoodsold: "Giá vốn hàng bán",
  cogs: "Giá vốn hàng bán",
  grossprofit: "Lợi nhuận gộp",
  operatingexpense: "Chi phí hoạt động",
  operatingprofit: "Lợi nhuận từ HĐKD",
  financialexpense: "Chi phí tài chính",
  financialincome: "Doanh thu tài chính",
  interestexpense: "Chi phí lãi vay",
  sellingexpense: "Chi phí bán hàng",
  gaexpense: "Chi phí QLDN",
  profitbeforetax: "Lợi nhuận trước thuế",
  pretaxprofit: "Lợi nhuận trước thuế",
  netprofit: "Lợi nhuận sau thuế (LNST)",
  profitaftertax: "Lợi nhuận sau thuế (LNST)",
  posttaxprofit: "Lợi nhuận sau thuế",
  shareholderequitynetprofit: "LNST của CĐ công ty mẹ",
  ebitda: "EBITDA",
  ebit: "EBIT",
  eps: "EPS (Lãi cơ bản trên CP)",
  dilutedeps: "EPS pha loãng",

  // Balance Sheet
  totalassets: "Tổng tài sản",
  currentassets: "Tài sản ngắn hạn",
  cash: "Tiền & tương đương tiền",
  shortterminvestment: "Đầu tư tài chính ngắn hạn",
  receivables: "Các khoản phải thu ngắn hạn",
  inventory: "Hàng tồn kho",
  othercurrentassets: "Tài sản ngắn hạn khác",
  noncurrentassets: "Tài sản dài hạn",
  fixedassets: "Tài sản cố định",
  longterminvestment: "Đầu tư tài chính dài hạn",
  totalliabilities: "Tổng nợ phải trả",
  currentliabilities: "Nợ ngắn hạn",
  shorttermdebt: "Vay & nợ thuê TC ngắn hạn",
  longtermliabilities: "Nợ dài hạn",
  longtermdebt: "Vay & nợ thuê TC dài hạn",
  totalequity: "Vốn chủ sở hữu",
  sharecapital: "Vốn góp của chủ sở hữu",
  retainedearnings: "LN sau thuế chưa phân phối",

  // Cash Flow
  operatingcashflow: "Lưu chuyển tiền từ HĐKD",
  investingcashflow: "Lưu chuyển tiền từ HĐ đầu tư",
  financingcashflow: "Lưu chuyển tiền từ HĐ tài chính",
  netcashflow: "Lưu chuyển tiền thuần trong kỳ",
  freecashflow: "Dòng tiền tự do (FCF)",

  // Ratios
  roa: "ROA (Tỷ suất LN / Tổng TS)",
  roe: "ROE (Tỷ suất LN / VCSH)",
  roic: "ROIC",
  grossmargin: "Biên lợi nhuận gộp",
  netmargin: "Biên lợi nhuận ròng",
  ebitdamargin: "Biên EBITDA",
  currentratio: "Chỉ số thanh toán hiện hành",
  quickratio: "Chỉ số thanh toán nhanh",
  debtequity: "Hệ số Nợ / VCSH (D/E)",
  debtassets: "Hệ số Nợ / Tổng tài sản",
  interestcoverage: "Hệ số chi trả lãi vay",
  assetturnover: "Vòng quay tổng tài sản",
  inventoryturnover: "Vòng quay hàng tồn kho",
  pe: "Chỉ số P/E",
  pb: "Chỉ số P/B",
  ps: "Chỉ số P/S",
  ev_ebitda: "EV/EBITDA",
  bvps: "Giá trị sổ sách (BVPS)",
};

/** Headline rows rendered with emphasis for faster scanning */
const HEADLINE_KEYS = new Set([
  "revenue",
  "netsales",
  "grossprofit",
  "operatingprofit",
  "netprofit",
  "profitaftertax",
  "posttaxprofit",
  "shareholderequitynetprofit",
  "ebitda",
  "totalassets",
  "totalliabilities",
  "totalequity",
  "netcashflow",
  "freecashflow",
]);

/** Vietnamese display-name patterns for headline rows (transposed datasets) */
const HEADLINE_NAME_PATTERNS = [
  "doanh thu thuần",
  "lợi nhuận gộp",
  "lợi nhuận sau thuế",
  "lợi nhuận trước thuế",
  "lợi nhuận từ hoạt động",
  "ebitda",
  "tổng tài sản",
  "tổng nợ phải trả",
  "vốn chủ sở hữu",
  "lưu chuyển tiền thuần",
  "dòng tiền tự do",
];

function normKey(key: string): string {
  return key.toLowerCase().replace(/[_\s-]/g, "");
}

function isPercentKey(key: string, name: string): boolean {
  return (
    ["roa", "roe", "roic", "margin"].some((p) => normKey(key).includes(p)) ||
    /roa|roe|roic|margin|biên/i.test(key) ||
    /roa|roe|roic|margin|biên/i.test(name)
  );
}

function isHeadline(key: string, name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    HEADLINE_KEYS.has(normKey(key)) ||
    HEADLINE_NAME_PATTERNS.some((p) => lowerName.includes(p))
  );
}

function getIndicatorName(key: string): string {
  const cleanKey = normKey(key);
  if (FINANCIAL_KEY_LABELS[cleanKey]) {
    return FINANCIAL_KEY_LABELS[cleanKey];
  }
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toNum(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)} tỷ`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)} tr`;
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function fmtCell(raw: unknown, key: string, name: string): string {
  const n = toNum(raw);
  if (n === null) return String(raw ?? "—");
  if (isPercentKey(key, name)) {
    const v = Math.abs(n) <= 3 ? n * 100 : n;
    return `${v.toFixed(2)}%`;
  }
  return fmtNum(n);
}

/* ─── Period label parsing ─────────────────────────────────────────────────── */

/** Sortable rank of a period row — annual reports rank above quarters of the same year */
function periodRank(row: Record<string, unknown>): number | null {
  const year = toNum(row.yearReport) ?? toNum(row.year);
  if (year === null) return null;
  let q = toNum(row.lengthReport) ?? toNum(row.quarter);
  if (q === null || q < 1 || q > 4) q = 4;
  return year * 5 + q;
}

/** A column key like "2026-Q2", "Q1/2025" or "Năm 2025" denotes a period (transposed datasets) */
function isPeriodLikeCol(key: string): boolean {
  return /(?:19|20)\d{2}/.test(key) || /^\s*q\s*[1-4]\b/i.test(key);
}

/** Sortable rank of a period-like column label */
function periodRankFromLabel(label: string): number {
  const year = Number(label.match(/(?:19|20)\d{2}/)?.[0] ?? 0);
  const q = Number(label.match(/q\s*([1-4])/i)?.[1] ?? 4);
  return year * 5 + q;
}

/** Normalize "2026-Q2" / "Q2-2026" to the canonical "Q2/2026" form */
function prettifyPeriodLabel(label: string): string {
  const yearFirst = label.match(/^\s*((?:19|20)\d{2})\s*[-/]\s*q\s*([1-4])\s*$/i);
  if (yearFirst) return `Q${yearFirst[2]}/${yearFirst[1]}`;
  const quarterFirst = label.match(/^\s*q\s*([1-4])\s*[-/]\s*((?:19|20)\d{2})\s*$/i);
  if (quarterFirst) return `Q${quarterFirst[1]}/${quarterFirst[2]}`;
  return label.trim();
}

function getPeriodLabel(
  row: Record<string, unknown>,
  periodKey?: string
): string {
  if (row.yearReport != null && row.lengthReport != null) {
    const len = Number(row.lengthReport);
    if (len >= 1 && len <= 4) {
      return `Q${len}/${row.yearReport}`;
    }
    if (len === 0 || len === 5) {
      return `Năm ${row.yearReport}`;
    }
  }
  if (row.year != null && row.quarter != null) {
    return `Q${row.quarter}/${row.year}`;
  }
  if (periodKey && row[periodKey] != null) {
    return String(row[periodKey]);
  }
  return "—";
}

/* ─── Unified data model ───────────────────────────────────────────────────── */

type IndicatorRow = {
  key: string;
  name: string;
  sub: string | null;
  headline: boolean;
  cells: unknown[];
  growth: { cur: number | null; prev: number | null };
};

type FinancialModel = {
  periods: string[];
  rows: IndicatorRow[];
};

function makeRow(
  key: string,
  name: string,
  sub: string | null,
  cells: unknown[]
): IndicatorRow {
  return {
    key,
    name,
    sub,
    headline: isHeadline(key, name),
    cells,
    growth: { cur: toNum(cells[0]), prev: toNum(cells[1]) },
  };
}

/**
 * Normalizes both API shapes into { periods: newest-first, rows: indicators }.
 * Shape A — each record is one period (yearReport/lengthReport fields).
 * Shape B — transposed: each record is one indicator, period labels are column keys.
 */
function buildFinancialModel(records: FinancialRecord[]): FinancialModel {
  if (records.length === 0) return { periods: [], rows: [] };
  const keys = Object.keys(records[0]);
  const shapeA = keys.some((k) =>
    ["yearreport", "lengthreport", "year", "quarter"].includes(normKey(k))
  );

  if (shapeA) {
    const periodKey = keys.find((k) =>
      ["yearreport", "lengthreport", "year", "quarter", "period"].some((p) =>
        k.toLowerCase().includes(p)
      )
    );
    const dataKeys = keys.filter((k) => {
      const lower = k.toLowerCase();
      if (["ticker", "period_begin", "period_end"].includes(lower)) return false;
      return k !== periodKey;
    });
    const sorted = [...records].sort(
      (a, b) => (periodRank(b) ?? -Infinity) - (periodRank(a) ?? -Infinity)
    );
    const periods = sorted.map((r) => getPeriodLabel(r, periodKey));
    const rows = dataKeys.map((k) =>
      makeRow(k, getIndicatorName(k), k, sorted.map((r) => r[k]))
    );
    return { periods, rows };
  }

  // Shape B: transposed table
  const periodCols = keys
    .filter(isPeriodLikeCol)
    .sort((a, b) => periodRankFromLabel(b) - periodRankFromLabel(a));
  const metaCols = keys.filter((k) => !isPeriodLikeCol(k));
  const nameCol =
    metaCols.find((k) => normKey(k) === "item") ??
    metaCols.find((k) => normKey(k) === "itemen") ??
    metaCols[0];
  const idCol = metaCols.find((k) =>
    ["itemid", "itemcode", "id"].includes(normKey(k))
  );
  const enCol = metaCols.find((k) => normKey(k) === "itemen");

  const periods = periodCols.map(prettifyPeriodLabel);
  const rows = records.map((r, i) => {
    const name = String(r[nameCol] ?? `Chỉ tiêu ${i + 1}`);
    const rawId = idCol && r[idCol] != null ? String(r[idCol]) : null;
    const rawEn = enCol && r[enCol] != null ? String(r[enCol]) : null;
    return makeRow(
      rawId ?? `${name}-${i}`,
      name,
      rawId ?? rawEn,
      periodCols.map((pk) => r[pk])
    );
  });
  return { periods, rows };
}

function GrowthBadge({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null || prev === 0) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct > 0.05;
  const down = pct < -0.05;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
        up
          ? "bg-emerald-500/10 text-emerald-400"
          : down
            ? "bg-red-500/10 text-red-400"
            : "bg-white/5 text-slate-400"
      )}
    >
      {up ? (
        <ArrowUpRight className="h-2.5 w-2.5" />
      ) : down ? (
        <ArrowDownRight className="h-2.5 w-2.5" />
      ) : (
        <Minus className="h-2.5 w-2.5" />
      )}
      {Math.abs(pct) >= 999 ? ">999" : Math.abs(pct).toFixed(1)}%
    </span>
  );
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("indicators_row");
  const [tabLoading, setTabLoading] = useState(false);
  const [filter, setFilter] = useState("");

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

  const model = useMemo(
    () => buildFinancialModel(data?.data ?? []),
    [data]
  );

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return model.rows;
    return model.rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.sub ?? "").toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q)
    );
  }, [model.rows, filter]);

  if (loading || tabLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const isFiltering = filter.trim() !== "";

  /* Solid backgrounds so sticky cells stay opaque across zebra / headline rows */
  const rowBg = (idx: number, emphasized: boolean) =>
    emphasized ? "bg-[#14122a]" : idx % 2 === 1 ? "bg-[#10101b]" : "bg-[#0c0c14]";
  const rowHoverBg = "group-hover:bg-[#191830]";

  const filterInput = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Lọc chỉ tiêu..."
        aria-label="Lọc chỉ tiêu tài chính"
        className="h-7 border-white/10 bg-white/5 pl-7 text-xs placeholder:text-slate-500"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Report type tabs */}
          <Tabs
            value={activeReport}
            onValueChange={(val) => changeReport(val as ReportType, activePeriod)}
          >
            <TabsList className="bg-white/5 border-white/10">
              {REPORT_TYPES.map((rt) => (
                <TabsTrigger
                  key={rt.id}
                  value={rt.id}
                  id={`report-${rt.id}`}
                  title={rt.title}
                  className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-xs font-semibold"
                >
                  {rt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Period toggle */}
          <Tabs
            value={activePeriod}
            onValueChange={(val) => changeReport(activeReport, val as Period)}
          >
            <TabsList className="bg-white/5 border-white/10">
              <TabsTrigger
                value="quarter"
                id="period-quarter"
                className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-xs font-semibold"
              >
                Theo Quý
              </TabsTrigger>
              <TabsTrigger
                value="annual"
                id="period-annual"
                className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-xs font-semibold"
              >
                Theo Năm
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Layout Orientation Switcher */}
          <Tabs
            value={layoutMode}
            onValueChange={(val) => setLayoutMode(val as LayoutMode)}
          >
            <TabsList className="bg-white/5 border-white/10 h-9 p-0.5">
              <TabsTrigger
                value="indicators_row"
                className="text-xs h-7 gap-1.5 data-[state=active]:bg-white/15 data-[state=active]:text-slate-50"
                title="Hiển thị chỉ tiêu theo từng dòng, kỳ theo cột"
              >
                <TableProperties className="h-3.5 w-3.5" />
                <span>Chỉ tiêu theo dòng</span>
              </TabsTrigger>
              <TabsTrigger
                value="periods_row"
                className="text-xs h-7 gap-1.5 data-[state=active]:bg-white/15 data-[state=active]:text-slate-50"
                title="Hiển thị kỳ theo từng dòng, chỉ tiêu theo cột"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Kỳ theo dòng</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-xs flex items-center gap-1 cursor-help">
              <Info className="h-3 w-3 text-slate-400" />
              <span>{symbol} — {model.periods.length} kỳ báo cáo</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Kỳ mới nhất hiển thị đầu tiên và được làm nổi bật. Header và cột chỉ
              tiêu cố định khi cuộn dọc/ngang.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Table Area */}
      {model.periods.length === 0 || model.rows.length === 0 ? (
        <Card className="border-white/8 bg-[#0c0c14] flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
            <Landmark className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-300">Không có dữ liệu báo cáo tài chính</p>
          <p className="text-xs text-slate-500 mt-1">Hãy thử chọn loại báo cáo hoặc kỳ khác</p>
        </Card>
      ) : layoutMode === "indicators_row" ? (
        <Card className="border-white/8 bg-[#0c0c14] overflow-hidden shadow-2xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              {/* ─── Mode 1: Indicators as Rows, Periods as Columns (Industry Standard) ─── */}
              <Table id="financials-table" className="border-collapse w-full">
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    {/* Top-Left Corner Header: Sticky BOTH Top and Left — hosts the indicator filter */}
                    <TableHead className="sticky top-0 left-0 z-30 min-w-[240px] max-w-[320px] bg-[#0e0d18] border-r border-b border-white/15 px-3 py-2.5 shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
                      {filterInput}
                    </TableHead>

                    {/* Period Column Headers: Sticky Top — newest first */}
                    {model.periods.map((label, idx) => (
                      <TableHead
                        key={label + idx}
                        className={cn(
                          "sticky top-0 z-20 min-w-[130px] bg-[#0e0d18] border-b border-white/10 px-4 py-2.5 text-right text-xs font-bold backdrop-blur-md tabular-nums",
                          idx === 0 ? "text-cyan-300" : "text-slate-200"
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {label}
                          {idx === 0 && (
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-white/5">
                  {visibleRows.map((row, rowIdx) => (
                    <TableRow
                      key={row.key}
                      className={cn(
                        "transition-colors group hover:bg-transparent",
                        rowBg(rowIdx, row.headline)
                      )}
                    >
                      {/* Item Column Cell: Sticky Left */}
                      <TableCell
                        className={cn(
                          "sticky left-0 z-10 min-w-[240px] max-w-[320px] border-r border-white/10 px-3 py-2 shadow-[4px_0_12px_rgba(0,0,0,0.6)] transition-colors",
                          rowBg(rowIdx, row.headline),
                          rowHoverBg
                        )}
                      >
                        <span
                          className={cn(
                            "block leading-tight text-xs",
                            row.headline
                              ? "font-bold text-slate-50"
                              : "font-semibold text-slate-100"
                          )}
                        >
                          {row.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <GrowthBadge cur={row.growth.cur} prev={row.growth.prev} />
                          {row.sub && (
                            <span className="text-[10px] text-slate-600 font-mono truncate opacity-80 group-hover:text-slate-500">
                              {row.sub}
                            </span>
                          )}
                        </span>
                      </TableCell>

                      {/* Values across periods — latest column tinted */}
                      {row.cells.map((raw, idx) => {
                        const n = toNum(raw);
                        return (
                          <TableCell
                            key={idx}
                            className={cn(
                              "text-right text-xs px-4 py-2 font-mono tabular-nums",
                              idx === 0 && "bg-violet-400/[0.04]",
                              n !== null && n < 0
                                ? "text-red-400 font-medium"
                                : n !== null && n > 0
                                  ? row.headline
                                    ? "text-slate-50 font-semibold"
                                    : "text-slate-200"
                                  : "text-slate-500"
                            )}
                          >
                            {fmtCell(raw, row.key, row.name)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {visibleRows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={model.periods.length + 1}
                        className="py-12 text-center text-xs text-slate-500"
                      >
                        Không có chỉ tiêu nào khớp bộ lọc “{filter.trim()}”
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Footer note */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-4 py-2.5 text-[10px] text-slate-500">
              <span>Số liệu lớn tự rút gọn thành triệu / tỷ đồng · Chỉ số tỷ suất hiển thị %</span>
              <span className="tabular-nums">
                {model.periods.length} kỳ{isFiltering ? ` · ${visibleRows.length}/${model.rows.length} chỉ tiêu` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-white/8 bg-[#0c0c14] overflow-hidden shadow-2xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              {/* ─── Mode 2: Periods as Rows (newest first), Indicators as Columns ─── */}
              <Table id="financials-table" className="border-collapse w-full">
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    {/* Top-Left Corner Header: Sticky BOTH Top and Left — hosts the indicator filter */}
                    <TableHead className="sticky top-0 left-0 z-30 min-w-[150px] bg-[#0e0d18] border-r border-b border-white/15 px-3 py-2.5 shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
                      {filterInput}
                    </TableHead>

                    {/* Indicator Column Headers: Sticky Top + QoQ/YoY growth badge */}
                    {visibleRows.map((row) => (
                      <TableHead
                        key={row.key}
                        className="sticky top-0 z-20 min-w-[160px] bg-[#0e0d18] border-b border-white/10 px-3 py-2 text-right align-top backdrop-blur-md"
                      >
                        <span className="block text-xs font-bold text-slate-200 leading-tight">
                          {row.name}
                        </span>
                        <span className="mt-1 flex items-center justify-end gap-1.5">
                          <GrowthBadge cur={row.growth.cur} prev={row.growth.prev} />
                          {row.sub && (
                            <span className="text-[9px] text-slate-600 font-mono font-normal">
                              {row.sub}
                            </span>
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-white/5">
                  {model.periods.map((label, i) => (
                    <TableRow
                      key={label + i}
                      className={cn("transition-colors group", rowBg(i, false))}
                    >
                      {/* Period Column Cell: Sticky Left — latest row highlighted */}
                      <TableCell
                        className={cn(
                          "sticky left-0 z-10 min-w-[150px] border-r border-white/10 px-3 py-2.5 whitespace-nowrap text-xs shadow-[4px_0_12px_rgba(0,0,0,0.6)] transition-colors",
                          i === 0
                            ? "bg-[#12142a] font-bold text-cyan-300"
                            : cn(rowBg(i, false), "font-semibold text-slate-300"),
                          rowHoverBg
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          {label}
                          {i === 0 && (
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      </TableCell>

                      {/* Indicator Values — latest row tinted */}
                      {visibleRows.map((row) => {
                        const raw = row.cells[i];
                        const n = toNum(raw);
                        return (
                          <TableCell
                            key={row.key}
                            className={cn(
                              "text-right text-xs px-3 py-2.5 font-mono tabular-nums",
                              i === 0 && "bg-violet-400/[0.04]",
                              n !== null && n < 0
                                ? "text-red-400 font-medium"
                                : n !== null && n > 0
                                  ? "text-slate-200"
                                  : "text-slate-500"
                            )}
                          >
                            {fmtCell(raw, row.key, row.name)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Footer note */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-4 py-2.5 text-[10px] text-slate-500">
              <span>Số liệu lớn tự rút gọn thành triệu / tỷ đồng · Chỉ số tỷ suất hiển thị %</span>
              <span className="tabular-nums">
                {model.periods.length} kỳ{isFiltering ? ` · ${visibleRows.length}/${model.rows.length} chỉ tiêu` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
