export interface GoldItem {
  code: string;
  name: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  change_amount: number;
  change_percent: number;
  spread: number;
  high_24h: number;
  low_24h: number;
}

export interface GoldOverviewResponse {
  updated_at: string;
  items: GoldItem[];
}

export interface GoldHistoryPoint {
  time: string;
  date: string;
  buy: number;
  sell: number;
  middle: number;
  [key: string]: string | number;
}

export interface GoldHistoryResponse {
  code: string;
  name: string;
  unit: string;
  timeframe: string;
  data: GoldHistoryPoint[];
}

export interface GoldNewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  url: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function fetchGoldOverview(): Promise<GoldOverviewResponse> {
  const res = await fetch(`${API_BASE}/api/gold/overview`, {
    cache: "no-store",
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải thông tin giá vàng");
  return res.json();
}

export async function fetchGoldHistory(
  code: string = "SJC",
  timeframe: string = "1M"
): Promise<GoldHistoryResponse> {
  const res = await fetch(
    `${API_BASE}/api/gold/history?code=${encodeURIComponent(code)}&timeframe=${encodeURIComponent(timeframe)}`,
    {
      cache: "no-store",
      headers: { "ngrok-skip-browser-warning": "true" },
    }
  );
  if (!res.ok) throw new Error("Không thể tải lịch sử giá vàng");
  return res.json();
}

export async function fetchGoldNews(): Promise<GoldNewsItem[]> {
  const res = await fetch(`${API_BASE}/api/gold/news`, {
    cache: "no-store",
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải tin tức giá vàng");
  return res.json();
}
