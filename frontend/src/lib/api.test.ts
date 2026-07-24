import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessage } from "./api";

describe("sendMessage API helper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send a POST request with correct payload including cached articles", async () => {
    const mockResponseData = {
      reply: "Trả về thông tin từ cache.",
      history: [
        { role: "user", content: "Nói tiếp đi" },
        { role: "model", content: "Trả về thông tin từ cache." },
      ],
      cached_articles: [{ title: "Bài báo 1" }],
    };

    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    } as Response);

    const history = [{ role: "user" as const, content: "Câu hỏi trước đó" }];
    const cachedArticles = [{ title: "Bài báo 1" }];

    const result = await sendMessage("Nói tiếp đi", history, cachedArticles);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/chat"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          message: "Nói tiếp đi",
          history,
          cached_articles: cachedArticles,
        }),
      })
    );
    expect(result).toEqual(mockResponseData);
  });

  it("should throw error containing backend detail when response is not ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Yêu cầu không hợp lệ từ model." }),
    } as Response);

    await expect(sendMessage("test", [])).rejects.toThrow(
      "Yêu cầu không hợp lệ từ model."
    );
  });

  it("should retry fetch on retryable network errors", async () => {
    const mockResponseData = {
      reply: "Thành công sau retry",
      history: [],
      cached_articles: [],
    };

    // 1st call fails with a network error
    // 2nd call succeeds
    const fetchMock = vi
      .mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response);

    const result = await sendMessage("hello", []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(mockResponseData);
  });

  it("should fail after maximum retries on persistent network error", async () => {
    const fetchMock = vi
      .mocked(globalThis.fetch)
      .mockRejectedValue(new Error("Failed to fetch")); // fails repeatedly

    await expect(sendMessage("hello", [])).rejects.toThrow(
      "Mất kết nối tới server. Kiểm tra lại kết nối mạng hoặc tải lại trang."
    );
    
    // Initial call + 2 retries = 3 calls total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should use empty array as default for cachedArticles", async () => {
    const mockResponseData = {
      reply: "OK",
      history: [{ role: "user", content: "hi" }, { role: "model", content: "OK" }],
      cached_articles: [],
    };
    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    } as Response);

    await sendMessage("hi", []);

    const sentBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(sentBody.cached_articles).toEqual([]);
  });

  it("should fallback to HTTP status code in error when no detail field", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),  // no 'detail' key
    } as Response);

    await expect(sendMessage("test", [])).rejects.toThrow("HTTP 503");
  });

  it("should throw user-friendly message on AbortError (timeout)", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    vi.mocked(globalThis.fetch).mockRejectedValue(abortError);

    await expect(sendMessage("test", [])).rejects.toThrow(
      "Yêu cầu mất quá lâu (>90s), vui lòng thử lại."
    );
  });

  it("response cached_articles should be an array (schema contract)", async () => {
    const mockResponseData = {
      reply: "Test reply",
      history: [
        { role: "user", content: "test" },
        { role: "model", content: "Test reply" },
      ],
      cached_articles: [
        { article_title: "Bài A", site: "cafef", text: "Nội dung", article_url: "https://cafef.vn/a" }
      ],
    };
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    } as Response);

    const result = await sendMessage("test", []);

    // Contract: cached_articles must be an array so frontend can iterate
    expect(Array.isArray(result.cached_articles)).toBe(true);
  });

  it("history in response must have role and content fields (schema contract)", async () => {
    const mockResponseData = {
      reply: "Hello",
      history: [
        { role: "user", content: "Hi" },
        { role: "model", content: "Hello" },
      ],
      cached_articles: [],
    };
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    } as Response);

    const result = await sendMessage("Hi", []);

    for (const msg of result.history) {
      expect(msg).toHaveProperty("role");
      expect(msg).toHaveProperty("content");
      expect(["user", "model"]).toContain(msg.role);
    }
  });

  it("should not retry on AbortError", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.mocked(globalThis.fetch).mockRejectedValue(abortError);

    await expect(sendMessage("test", [])).rejects.toThrow();
    // AbortError must NOT be retried — only 1 call expected
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
