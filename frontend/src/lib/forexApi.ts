export interface ForexItem {
  code: string;
  name: string;
  symbol: string;
  cash_buy: number;
  transfer_buy: number;
  sell: number;
  change_amount: number;
  change_percent: number;
  spread: number;
  high_24h: number;
  low_24h: number;
}

export interface ForexOverviewResponse {
  updated_at: string;
  bank: string;
  items: ForexItem[];
}

export interface ForexHistoryPoint {
  time: string;
  date: string;
  buy: number;
  sell: number;
  middle: number;
  [key: string]: string | number;
}

export interface ForexHistoryResponse {
  code: string;
  name: string;
  symbol: string;
  timeframe: string;
  data: ForexHistoryPoint[];
}

export interface ForexNewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  url: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchForexOverview(): Promise<ForexOverviewResponse> {
  const res = await fetch(`${API_BASE}/api/forex/overview`, { cache: "no-store" });
  if (!res.ok) throw new Error("Không thể tải bảng tỷ giá ngoại tệ");
  return res.json();
}

export async function fetchForexHistory(
  pair: string = "USD",
  timeframe: string = "1M"
): Promise<ForexHistoryResponse> {
  const res = await fetch(
    `${API_BASE}/api/forex/history?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Không thể tải lịch sử tỷ giá");
  return res.json();
}

export async function fetchForexNews(): Promise<ForexNewsItem[]> {
  const res = await fetch(`${API_BASE}/api/forex/news`, { cache: "no-store" });
  if (!res.ok) throw new Error("Không thể tải tin tức tỷ giá ngoại tệ");
  return res.json();
}
