import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchGoldOverview,
  fetchGoldHistory,
  fetchGoldNews,
} from "./goldApi";

describe("goldApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchGoldOverview fetches /api/gold/overview", async () => {
    const mockData = {
      updated_at: "06/08/2026 14:00:00",
      items: [
        {
          code: "SJC",
          name: "Vàng SJC (1 lượng)",
          unit: "VND/lượng",
          buy_price: 84000000,
          sell_price: 86000000,
          change_amount: 200000,
          change_percent: 0.24,
          spread: 2000000,
          high_24h: 86500000,
          low_24h: 83800000,
        },
      ],
    };

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchGoldOverview();
    expect(res).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/gold/overview"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "ngrok-skip-browser-warning": "true",
        }),
      })
    );
  });

  it("fetchGoldHistory fetches /api/gold/history with code and timeframe", async () => {
    const mockData = {
      code: "SJC",
      name: "Vàng SJC (1 lượng)",
      unit: "VND/lượng",
      timeframe: "1M",
      data: [{ time: "01/08", date: "2026-08-01 00:00", buy: 84000000, sell: 86000000, middle: 85000000 }],
    };

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchGoldHistory("SJC", "1M");
    expect(res).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/gold/history?code=SJC&timeframe=1M"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "ngrok-skip-browser-warning": "true",
        }),
      })
    );
  });

  it("fetchGoldNews fetches /api/gold/news", async () => {
    const mockData = [
      {
        id: 1,
        title: "Giá vàng SJC biến động mạnh",
        summary: "Thị trường vàng...",
        source: "VnEconomy",
        published_at: "06/08/2026 13:00",
        url: "https://example.com",
      },
    ];

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchGoldNews();
    expect(res).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/gold/news"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "ngrok-skip-browser-warning": "true",
        }),
      })
    );
  });

  it("throws error when response is not ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(fetchGoldHistory("SJC", "1M")).rejects.toThrow("Không thể tải lịch sử giá vàng");
  });
});
