"use client";

import { useState, useEffect } from "react";
import {
  useStockOverview,
  useStockTrading,
  useStockTechnicals,
  useStockFinancials,
  useStockNews,
} from "@/hooks/useStocks";
import { searchStocks, SearchResult } from "@/lib/stockApi";
import StockHeader from "@/components/stock/StockHeader";
import OverviewTab from "@/components/stock/OverviewTab";
import TradingTab from "@/components/stock/TradingTab";
import TechnicalsTab from "@/components/stock/TechnicalsTab";
import FinancialsTab from "@/components/stock/FinancialsTab";
import NewsTab from "@/components/stock/NewsTab";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Search,
  Building2,
  TrendingUp,
  LineChart,
  Landmark,
  Newspaper,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "overview" | "trading" | "technicals" | "financials" | "news";

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "overview", label: "Tổng quan", icon: Building2 },
  { id: "trading", label: "Giao dịch", icon: TrendingUp },
  { id: "technicals", label: "Kỹ thuật", icon: LineChart },
  { id: "financials", label: "Tài chính", icon: Landmark },
  { id: "news", label: "Tin tức", icon: Newspaper },
];

const POPULAR_STOCKS = ["VNM", "VIC", "HPG", "VHM", "FPT", "MWG", "TCB", "ACB"];

function SearchBar({
  initialValue,
  onSelect,
}: {
  initialValue: string;
  onSelect: (sym: string) => void;
}) {
  const [searchInput, setSearchInput] = useState(initialValue);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!searchInput || searchInput.trim().length === 0) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await searchStocks(searchInput);
        setSearchResults(res.results || []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function handleInputChange(val: string) {
    const formatted = val.toUpperCase();
    setSearchInput(formatted);
    if (!formatted.trim()) {
      setSearchResults([]);
    }
    setShowDropdown(true);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchInput.trim()) {
      onSelect(searchInput.trim().toUpperCase());
      setShowDropdown(false);
    }
  }

  return (
    <div className="relative flex-1 max-w-xs">
      <form onSubmit={handleSearch} className="relative">
        <Input
          type="text"
          value={searchInput}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Tìm mã CK… (VNM, VIC…)"
          className="pr-9 bg-(--bg-surface) border-(--border-default) text-(--text-primary) text-xs rounded-lg font-semibold tracking-wider uppercase placeholder:normal-case placeholder:font-normal placeholder:text-(--text-tertiary) h-9"
          id="stock-search-input"
        />
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-(--text-tertiary) pointer-events-none" />
      </form>
      {showDropdown && searchResults.length > 0 && (
        <Card className="absolute z-50 mt-1 w-full p-1 border-(--border-default) bg-(--bg-surface) shadow-lg overflow-hidden rounded-lg">
          {searchResults.slice(0, 6).map((r) => (
            <button
              key={r.ticker}
              onMouseDown={() => {
                onSelect(r.ticker);
                setShowDropdown(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs text-(--text-primary) hover:bg-(--bg-subtle) transition-colors cursor-pointer"
            >
              <Badge variant="secondary" className="font-semibold text-[10px] py-0 font-mono">
                {r.ticker}
              </Badge>
              <span className="text-(--text-secondary) truncate text-xs">{r.organ_name}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

export default function StockPage() {
  const [symbol, setSymbol] = useState("VNM");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [reportType, setReportType] = useState("income_statement");
  const [period, setPeriod] = useState("quarter");

  // React Query Hooks
  const { data: overview, isLoading: loadingOverview, error: overviewError } = useStockOverview(symbol);
  const { data: trading, isLoading: loadingTrading } = useStockTrading(symbol);
  const { data: technicals, isLoading: loadingTechnicals } = useStockTechnicals(symbol);
  const { data: financials, isLoading: loadingFinancials } = useStockFinancials(symbol, reportType, period);
  const { data: news, isLoading: loadingNews } = useStockNews(symbol);

  function selectSymbol(sym: string) {
    setSymbol(sym.toUpperCase());
    setActiveTab("overview");
  }

  const handleReportChange = async (newReportType: string, newPeriod: string) => {
    setReportType(newReportType);
    setPeriod(newPeriod);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--bg-canvas) text-(--text-primary)">
      {/* ── Top Bar ── */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-(--border-default) px-6 py-3 bg-(--bg-surface)">
        {/* Search */}
        <SearchBar key={symbol} initialValue={symbol} onSelect={selectSymbol} />

        {/* Popular chips */}
        <div className="hidden md:flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-(--text-tertiary) mr-1">Phổ biến:</span>
          {POPULAR_STOCKS.map((s) => (
            <button
              key={s}
              id={`chip-${s}`}
              onClick={() => selectSymbol(s)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                symbol === s
                  ? "border-(--border-strong) bg-(--bg-selected) text-(--action-primary)"
                  : "border-(--border-default) bg-(--bg-subtle) text-(--text-secondary) hover:bg-(--bg-surface) hover:text-(--text-primary)"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stock Header (price info) ── */}
      <StockHeader overview={overview || null} loading={loadingOverview} />

      {/* ── Tab Navigation using shadcn Tabs ── */}
      <div className="shrink-0 border-b border-(--border-default) px-6 py-2 bg-(--bg-surface)">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as Tab)}
          className="w-full"
        >
          <TabsList className="bg-transparent border-none p-0 gap-1.5 h-auto justify-start flex-wrap">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  id={`tab-${tab.id}`}
                  className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-subtle) data-[state=active]:bg-(--bg-selected) data-[state=active]:text-(--action-primary) data-[state=active]:font-semibold border border-transparent transition-colors cursor-pointer"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* ── Error Banner ── */}
      {overviewError && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--status-negative)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-negative)_10%,transparent)] px-4 py-3 text-xs text-(--status-negative)">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{(overviewError as Error)?.message || "Không thể tải dữ liệu chứng khoán."}</span>
        </div>
      )}

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-28">
        {activeTab === "overview" && (
          <OverviewTab overview={overview || null} loading={loadingOverview} />
        )}
        {activeTab === "trading" && (
          <TradingTab data={trading || null} loading={loadingTrading} symbol={symbol} />
        )}
        {activeTab === "technicals" && (
          <TechnicalsTab data={technicals || null} loading={loadingTechnicals} />
        )}
        {activeTab === "financials" && (
          <FinancialsTab
            data={financials || null}
            loading={loadingFinancials}
            symbol={symbol}
            onChangeReport={handleReportChange}
          />
        )}
        {activeTab === "news" && (
          <NewsTab data={news || null} loading={loadingNews} />
        )}
      </div>
    </div>
  );
}
