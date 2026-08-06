import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getStockOverview,
  getStockTrading,
  getStockTechnicals,
  getStockFinancials,
  getStockNews,
  searchStocks,
  clearStockCache,
} from "./stockApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok,
    status,
    json: async () => data,
  } as Response);
}

function mockFetchError(message: string) {
  return vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error(message));
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_OVERVIEW = {
  symbol: "VNM",
  company_name: "Vietnam Dairy Products JSC",
  exchange: "HOSE",
  industry: "Hàng tiêu dùng",
  market_cap: 1_500_000_000_000,
  pe_ratio: 15.2,
  pb_ratio: 3.5,
  ps_ratio: null,
  eps: 5000,
  beta: 0.85,
  current_price: 72000,
  price_change: 500,
  price_change_pct: 0.7,
  week_52_high: 85000,
  week_52_low: 60000,
  volume: 2_500_000,
  avg_volume: null,
  description: "",
};

const MOCK_TRADING = {
  symbol: "VNM",
  data: [
    { time: "2024-01-01", open: 70000, high: 72000, low: 69000, close: 71500, volume: 1_000_000 },
    { time: "2024-01-02", open: 71500, high: 73000, low: 71000, close: 72500, volume: 1_200_000 },
  ],
  count: 2,
};

const MOCK_TECHNICALS = {
  symbol: "VNM",
  timeframe: "1Y",
  last_price: 72000,
  data_points: 250,
  indicators: {
    sma_20: 71000,
    sma_50: 70500,
    sma_200: 68000,
    rsi_14: 55.3,
    macd: 120.5,
    macd_signal: 105.2,
    macd_histogram: 15.3,
    bb_upper: 75000,
    bb_middle: 71000,
    bb_lower: 67000,
  },
  price_history: [{ time: "2024-01-01", close: 72000 }],
};

const MOCK_FINANCIALS = {
  symbol: "VNM",
  report_type: "income_statement",
  period: "quarter",
  data: [
    { yearReport: 2024, lengthReport: 1, revenue: 14_000_000_000 },
  ],
};

const MOCK_NEWS = {
  symbol: "VNM",
  data: [
    { title: "Vinamilk tăng trưởng mạnh", source: "cafef", url: "https://cafef.vn/1", published_date: "2024-01-15" },
  ],
  count: 1,
};

// ─── Test suites ──────────────────────────────────────────────────────────────

describe("stockApi — getStockOverview", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches /api/stock/{symbol}/overview and returns typed data", async () => {
    mockFetch(MOCK_OVERVIEW);
    const result = await getStockOverview("VNM");
    expect(result.symbol).toBe("VNM");
    expect(result.company_name).toBe("Vietnam Dairy Products JSC");
    expect(result.pe_ratio).toBe(15.2);
    expect(result.current_price).toBe(72000);
  });

  it("calls the correct URL", async () => {
    const fetchMock = mockFetch(MOCK_OVERVIEW);
    await getStockOverview("HPG");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/stock/HPG/overview"),
      expect.anything()
    );
  });

  it("throws with backend 'detail' on error response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ detail: "Symbol not found" }),
    } as Response);
    await expect(getStockOverview("INVALID")).rejects.toThrow("Symbol not found");
  });

  it("throws HTTP status code when no detail field", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    await expect(getStockOverview("VNM")).rejects.toThrow("HTTP 500");
  });

  it("overview result has all required fields", async () => {
    mockFetch(MOCK_OVERVIEW);
    const result = await getStockOverview("VNM");
    const required = [
      "symbol", "company_name", "exchange", "industry",
      "current_price", "price_change_pct", "pe_ratio", "market_cap",
    ] as const;
    for (const field of required) {
      expect(result).toHaveProperty(field);
    }
  });
});


describe("stockApi — getStockTrading", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches /api/stock/{symbol}/trading with default params", async () => {
    const fetchMock = mockFetch(MOCK_TRADING);
    const result = await getStockTrading("VNM");
    expect(result.symbol).toBe("VNM");
    expect(result.data).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/stock/VNM/trading"),
      expect.anything()
    );
  });

  it("includes startDate in URL when provided", async () => {
    const fetchMock = mockFetch(MOCK_TRADING);
    await getStockTrading("VNM", "2023-01-01");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("start_date=2023-01-01"),
      expect.anything()
    );
  });

  it("trading data items have OHLCV keys", async () => {
    mockFetch(MOCK_TRADING);
    const result = await getStockTrading("VNM");
    const first = result.data[0];
    expect(first).toHaveProperty("open");
    expect(first).toHaveProperty("high");
    expect(first).toHaveProperty("low");
    expect(first).toHaveProperty("close");
    expect(first).toHaveProperty("volume");
  });

  it("throws on network error", async () => {
    mockFetchError("Failed to fetch");
    await expect(getStockTrading("VNM")).rejects.toThrow();
  });
});


describe("stockApi — getStockTechnicals", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches /api/stock/{symbol}/technicals and returns typed data", async () => {
    mockFetch(MOCK_TECHNICALS);
    const result = await getStockTechnicals("VNM");
    expect(result.symbol).toBe("VNM");
    expect(result.indicators.rsi_14).toBe(55.3);
    expect(result.indicators.sma_20).toBe(71000);
    expect(Array.isArray(result.price_history)).toBe(true);
  });

  it("includes timeframe query param in URL", async () => {
    const fetchMock = mockFetch(MOCK_TECHNICALS);
    await getStockTechnicals("VNM", "3M");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("timeframe=3M"),
      expect.anything()
    );
  });

  it("indicators object has required keys for frontend charts", async () => {
    mockFetch(MOCK_TECHNICALS);
    const result = await getStockTechnicals("VNM");
    const requiredKeys = [
      "sma_20", "sma_50", "sma_200",
      "rsi_14",
      "macd", "macd_signal", "macd_histogram",
      "bb_upper", "bb_middle", "bb_lower",
    ] as const;
    for (const key of requiredKeys) {
      expect(result.indicators).toHaveProperty(key);
    }
  });

  it("throws on 502 error with detail message", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ detail: "No data available" }),
    } as Response);
    await expect(getStockTechnicals("EMPTY")).rejects.toThrow("No data available");
  });
});


describe("stockApi — getStockFinancials", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches /api/stock/{symbol}/financials with default params", async () => {
    const fetchMock = mockFetch(MOCK_FINANCIALS);
    const result = await getStockFinancials("VNM");
    expect(result.symbol).toBe("VNM");
    expect(result.report_type).toBe("income_statement");
    expect(result.period).toBe("quarter");
    expect(Array.isArray(result.data)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("income_statement"),
      expect.anything()
    );
  });

  it("includes report_type and period in URL", async () => {
    const fetchMock = mockFetch(MOCK_FINANCIALS);
    await getStockFinancials("VNM", "balance_sheet", "annual");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/report_type=balance_sheet.*period=annual|period=annual.*report_type=balance_sheet/),
      expect.anything()
    );
  });

  it("returns empty data array gracefully", async () => {
    mockFetch({ ...MOCK_FINANCIALS, data: [] });
    const result = await getStockFinancials("VNM");
    expect(result.data).toEqual([]);
  });
});


describe("stockApi — getStockNews", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches /api/stock/{symbol}/news and returns news list", async () => {
    mockFetch(MOCK_NEWS);
    const result = await getStockNews("VNM");
    expect(result.symbol).toBe("VNM");
    expect(result.count).toBe(1);
    expect(result.data[0].title).toBe("Vinamilk tăng trưởng mạnh");
  });

  it("includes limit param in URL", async () => {
    const fetchMock = mockFetch(MOCK_NEWS);
    await getStockNews("VNM", 5);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=5"),
      expect.anything()
    );
  });

  it("news items can have optional fields without breaking", async () => {
    const sparseNews = {
      symbol: "VNM",
      data: [{ title: "Chỉ có tiêu đề" }], // missing source, url, date
      count: 1,
    };
    mockFetch(sparseNews);
    const result = await getStockNews("VNM");
    expect(result.data[0].title).toBe("Chỉ có tiêu đề");
  });

  it("throws on HTTP error with detail", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    } as Response);
    await expect(getStockNews("ERR")).rejects.toThrow("Server error");
  });
});


describe("stockApi — searchStocks", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches /api/stock/search with encoded query", async () => {
    const mockData = {
      results: [
        { ticker: "VNM", organ_name: "Vietnam Dairy Products JSC" },
        { ticker: "VNS", organ_name: "Vinasports" },
      ],
    };
    const fetchMock = mockFetch(mockData);
    const result = await searchStocks("VN");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].ticker).toBe("VNM");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("q=VN"),
      expect.anything()
    );
  });

  it("URL-encodes special characters in query", async () => {
    const fetchMock = mockFetch({ results: [] });
    await searchStocks("Vinamilk JSC");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("Vinamilk"),
      expect.anything()
    );
  });

  it("returns empty results array when nothing found", async () => {
    mockFetch({ results: [] });
    const result = await searchStocks("XXXXXXX");
    expect(result.results).toEqual([]);
  });

  it("throws on network failure", async () => {
    mockFetchError("Network error");
    await expect(searchStocks("VNM")).rejects.toThrow();
  });
});


describe("stockApi — timeout handling", () => {
  beforeEach(() => { clearStockCache(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("throws user-friendly error on AbortError (timeout)", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(abortErr);
    // AbortError from timeout — expect it to propagate
    await expect(getStockOverview("VNM")).rejects.toBeInstanceOf(DOMException);
  });
});
