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
} from "lucide-react";

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
          className="pr-9 bg-white/5 border-white/10 text-xs rounded-xl font-bold tracking-wider uppercase placeholder:normal-case placeholder:font-normal"
          id="stock-search-input"
        />
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
      </form>
      {showDropdown && searchResults.length > 0 && (
        <Card className="absolute z-50 mt-1 w-full p-1 border-white/15 bg-[#0f0e1a] shadow-2xl overflow-hidden backdrop-blur-xl animate-fade-up">
          {searchResults.slice(0, 6).map((r) => (
            <button
              key={r.ticker}
              onMouseDown={() => {
                onSelect(r.ticker);
                setShowDropdown(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-violet-600/20 hover:text-white transition-colors cursor-pointer"
            >
              <Badge variant="cyan" className="font-bold text-[10px] py-0">
                {r.ticker}
              </Badge>
              <span className="text-slate-300 truncate text-xs">{r.organ_name}</span>
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
    <div className="flex h-full flex-col overflow-hidden bg-[#07070a] text-slate-100">
      {/* ── Top Bar ── */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-6 py-3 bg-[#07070a]/90 backdrop-blur-xl">
        {/* Search */}
        <SearchBar key={symbol} initialValue={symbol} onSelect={selectSymbol} />

        {/* Popular chips */}
        <div className="hidden md:flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500 mr-1">Phổ biến:</span>
          {POPULAR_STOCKS.map((s) => (
            <Badge
              key={s}
              id={`chip-${s}`}
              variant={symbol === s ? "default" : "secondary"}
              onClick={() => selectSymbol(s)}
              className={`cursor-pointer text-xs font-bold transition-all ${
                symbol === s
                  ? "bg-violet-600 text-white shadow-sm shadow-violet-500/25 border-violet-500"
                  : "bg-white/5 hover:bg-white/10 hover:text-white border-white/8"
              }`}
            >
              {s}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Stock Header (price info) ── */}
      <StockHeader overview={overview || null} loading={loadingOverview} />

      {/* ── Tab Navigation using shadcn Tabs ── */}
      <div className="shrink-0 border-b border-white/8 px-6 py-2 bg-[#07070a]">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as Tab)}
          className="w-full"
        >
          <TabsList className="bg-transparent border-none p-0 gap-2 h-auto justify-start">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  id={`tab-${tab.id}`}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-300 data-[state=active]:border-violet-500/40 border border-transparent text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
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
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          <span>⚠️ {(overviewError as Error)?.message || "Không thể tải dữ liệu chứng khoán."}</span>
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

