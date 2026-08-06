import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchForexOverview,
  fetchForexHistory,
  fetchForexNews,
} from "./forexApi";

describe("forexApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchForexOverview fetches /api/forex/overview", async () => {
    const mockData = {
      updated_at: "06/08/2026 14:00:00",
      bank: "Ngân hàng Thương mại",
      items: [
        {
          code: "USD",
          name: "Đô la Mỹ",
          symbol: "$",
          cash_buy: 25150,
          transfer_buy: 25180,
          sell: 25520,
          change_amount: 10,
          change_percent: 0.04,
          spread: 340,
          high_24h: 25670,
          low_24h: 25030,
        },
      ],
    };

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchForexOverview();
    expect(res).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/forex/overview"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "ngrok-skip-browser-warning": "true",
        }),
      })
    );
  });

  it("fetchForexHistory fetches /api/forex/history with pair and timeframe", async () => {
    const mockData = {
      code: "USD",
      name: "Đô la Mỹ",
      symbol: "$",
      timeframe: "1M",
      data: [{ time: "01/08", date: "2026-08-01 00:00", buy: 25180, sell: 25520, middle: 25350 }],
    };

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchForexHistory("USD", "1M");
    expect(res).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/forex/history?pair=USD&timeframe=1M"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "ngrok-skip-browser-warning": "true",
        }),
      })
    );
  });

  it("fetchForexNews fetches /api/forex/news", async () => {
    const mockData = [
      {
        id: 1,
        title: "Tỷ giá USD/VND nhích nhẹ",
        summary: "Tỷ giá trung tâm...",
        source: "Thời Báo Tài Chính",
        published_at: "06/08/2026 13:00",
        url: "https://example.com",
      },
    ];

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchForexNews();
    expect(res).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/forex/news"),
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

    await expect(fetchForexHistory("USD", "1M")).rejects.toThrow("Không thể tải lịch sử tỷ giá");
  });
});
