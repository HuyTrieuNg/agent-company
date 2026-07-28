"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getStockOverview,
  getStockTrading,
  getStockTechnicals,
  getStockFinancials,
  getStockNews,
  searchStocks,
  StockOverview,
  TradingResponse,
  TechnicalsResponse,
  FinancialsResponse,
  NewsResponse,
  SearchResult,
} from "@/lib/stockApi";
import StockHeader from "@/components/stock/StockHeader";
import OverviewTab from "@/components/stock/OverviewTab";
import TradingTab from "@/components/stock/TradingTab";
import TechnicalsTab from "@/components/stock/TechnicalsTab";
import FinancialsTab from "@/components/stock/FinancialsTab";
import NewsTab from "@/components/stock/NewsTab";

type Tab = "overview" | "trading" | "technicals" | "financials" | "news";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Tổng quan", icon: "🏢" },
  { id: "trading", label: "Giao dịch", icon: "📈" },
  { id: "technicals", label: "Kỹ thuật", icon: "🔬" },
  { id: "financials", label: "Tài chính", icon: "💰" },
  { id: "news", label: "Tin tức", icon: "📰" },
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
    setSearchInput(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (!searchInput || searchInput.length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await searchStocks(searchInput);
        setSearchResults(res.results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
        <input
          type="text"
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value.toUpperCase()); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Tìm mã CK… (VNM, VIC…)"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 pr-10 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-[#8b5cf6]/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.1)] transition-all duration-200"
          id="stock-search-input"
        />
        <button
          type="submit"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
        >
          🔍
        </button>
      </form>
      {showDropdown && searchResults.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-[#12121a] shadow-2xl overflow-hidden">
          {searchResults.slice(0, 6).map((r) => (
            <button
              key={r.ticker}
              onMouseDown={() => {
                onSelect(r.ticker);
                setShowDropdown(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5 transition-colors"
            >
              <span className="font-bold text-[#a78bfa]">{r.ticker}</span>
              <span className="text-slate-400 truncate">{r.organ_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StockPage() {
  const [symbol, setSymbol] = useState("VNM");
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [overview, setOverview] = useState<StockOverview | null>(null);
  const [trading, setTrading] = useState<TradingResponse | null>(null);
  const [technicals, setTechnicals] = useState<TechnicalsResponse | null>(null);
  const [financials, setFinancials] = useState<FinancialsResponse | null>(null);
  const [news, setNews] = useState<NewsResponse | null>(null);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingTab, setLoadingTab] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load overview whenever symbol changes
  useEffect(() => {
    if (!symbol) return;
    setOverview(null);
    setLoadingOverview(true);
    setError(null);
    getStockOverview(symbol)
      .then(setOverview)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingOverview(false));
  }, [symbol]);

  // Load tab data when tab changes
  const loadTabData = useCallback(async (tab: Tab, sym: string) => {
    setLoadingTab(true);
    try {
      if (tab === "trading") {
        const data = await getStockTrading(sym);
        setTrading(data);
      } else if (tab === "technicals") {
        const data = await getStockTechnicals(sym);
        setTechnicals(data);
      } else if (tab === "financials") {
        const data = await getStockFinancials(sym);
        setFinancials(data);
      } else if (tab === "news") {
        const data = await getStockNews(sym);
        setNews(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoadingTab(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "overview" && symbol) {
      loadTabData(activeTab, symbol);
    }
  }, [activeTab, symbol, loadTabData]);

  function selectSymbol(sym: string) {
    setSymbol(sym.toUpperCase());
    setActiveTab("overview");
    setTrading(null);
    setTechnicals(null);
    setFinancials(null);
    setNews(null);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0f]">
      {/* ── Top Bar ── */}
      <div className="flex shrink-0 items-center gap-4 border-b border-white/8 px-5 py-3">
        {/* Search */}
        <SearchBar initialValue={symbol} onSelect={selectSymbol} />

        {/* Popular chips */}
        <div className="hidden md:flex flex-wrap gap-1.5">
          {POPULAR_STOCKS.map((s) => (
            <button
              key={s}
              onClick={() => selectSymbol(s)}
              id={`chip-${s}`}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150 ${
                symbol === s
                  ? "bg-[#8b5cf6]/20 text-[#a78bfa] border border-[#8b5cf6]/40"
                  : "border border-white/8 text-slate-500 hover:border-[#8b5cf6]/30 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stock Header (price info) ── */}
      <StockHeader overview={overview} loading={loadingOverview} />

      {/* ── Tab Navigation ── */}
      <div className="shrink-0 border-b border-white/8 px-5">
        <nav className="flex gap-0.5 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm font-medium transition-all duration-150 border-b-2 ${
                activeTab === tab.id
                  ? "border-[#8b5cf6] text-[#a78bfa]"
                  : "border-transparent text-slate-500 hover:text-slate-200"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-400">
          ⚠️ {error}
          <button onClick={() => setError(null)} className="ml-auto text-slate-500 hover:text-slate-200">✕</button>
        </div>
      )}

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {activeTab === "overview" && (
          <OverviewTab overview={overview} loading={loadingOverview} />
        )}
        {activeTab === "trading" && (
          <TradingTab data={trading} loading={loadingTab} symbol={symbol} />
        )}
        {activeTab === "technicals" && (
          <TechnicalsTab data={technicals} loading={loadingTab} />
        )}
        {activeTab === "financials" && (
          <FinancialsTab
            data={financials}
            loading={loadingTab}
            symbol={symbol}
            onChangeReport={(reportType, period) =>
              getStockFinancials(symbol, reportType, period).then(setFinancials)
            }
          />
        )}
        {activeTab === "news" && (
          <NewsTab data={news} loading={loadingTab} />
        )}
      </div>
    </div>
  );
}
