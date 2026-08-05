const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const STOCK_TIMEOUT_MS = 30_000;

const cache = new Map<string, { promise: Promise<any>; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 phút

async function stockFetch<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.promise;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), STOCK_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail ?? `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      cache.delete(path); // Xoá cache nếu lỗi để lần sau gọi lại
      throw err;
    } finally {
      clearTimeout(timerId);
    }
  })();

  cache.set(path, { promise, timestamp: Date.now() });
  return promise;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockOverview {
  symbol: string;
  company_name: string;
  exchange: string;
  industry: string;
  market_cap: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  eps: number | null;
  beta: number | null;
  current_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  volume: number | null;
  avg_volume: number | null;
  description: string;
  error?: string;
}

export interface StockCandle {
  time?: string;
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  [key: string]: unknown;
}

export interface TradingResponse {
  symbol: string;
  data: StockCandle[];
  count: number;
}

export interface TechnicalIndicators {
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
}

export interface TechnicalsResponse {
  symbol: string;
  timeframe: string;
  last_price: number | null;
  data_points: number;
  indicators: TechnicalIndicators;
  price_history: { time: string; close: number }[];
  error?: string;
}

export interface FinancialRecord {
  [key: string]: unknown;
}

export interface FinancialsResponse {
  symbol: string;
  report_type: string;
  period: string;
  data: FinancialRecord[];
}

export interface StockNewsItem {
  title?: string;
  source?: string;
  url?: string;
  published_date?: string;
  [key: string]: unknown;
}

export interface NewsResponse {
  symbol: string;
  data: StockNewsItem[];
  count: number;
}

export interface SearchResult {
  ticker: string;
  organ_name?: string;
  [key: string]: unknown;
}

export interface SearchResponse {
  results: SearchResult[];
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const getStockOverview = (symbol: string) =>
  stockFetch<StockOverview>(`/api/stock/${symbol}/overview`);

export const getStockTrading = (
  symbol: string,
  startDate = "2024-01-01",
  interval = "1D"
) => stockFetch<TradingResponse>(`/api/stock/${symbol}/trading?start_date=${startDate}&interval=${interval}`);

export const getStockTechnicals = (symbol: string, timeframe = "1Y") =>
  stockFetch<TechnicalsResponse>(`/api/stock/${symbol}/technicals?timeframe=${timeframe}`);

export const getStockFinancials = (
  symbol: string,
  reportType = "income_statement",
  period = "quarter"
) =>
  stockFetch<FinancialsResponse>(
    `/api/stock/${symbol}/financials?report_type=${reportType}&period=${period}`
  );

export const getStockNews = (symbol: string, limit = 10) =>
  stockFetch<NewsResponse>(`/api/stock/${symbol}/news?limit=${limit}`);

export const searchStocks = (q: string) =>
  stockFetch<SearchResponse>(`/api/stock/search?q=${encodeURIComponent(q)}`);
