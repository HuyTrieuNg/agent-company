export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  /** Danh sách bài báo đã retrieve từ lượt trước, dùng để backend cache */
  cached_articles: Record<string, unknown>[];
}

export interface ChatResponse {
  reply: string;
  history: ChatMessage[];
  /** Backend trả về articles đã dùng (mới retrieve hoặc từ cache) để frontend lưu lại */
  cached_articles: Record<string, unknown>[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const CHAT_TIMEOUT_MS = 90_000; // 90s – đủ cho Qdrant + Gemini
const MAX_RETRIES = 2;          // retry tối đa 2 lần khi gặp network error
const RETRY_DELAY_MS = 1_200;   // đợi 1.2s trước khi retry (cho tunnel reconnect)

/** Kiểm tra có phải lỗi mạng có thể retry không (network-changed, connection reset...) */
function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // AbortError do user timeout → KHÔNG retry
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("err_network_changed") ||
    msg.includes("load failed") ||       // Safari
    msg.includes("networkerror")
  );
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0 && isRetryableNetworkError(err)) {
      console.warn(
        `[api] Network error, retrying in ${RETRY_DELAY_MS}ms... (${retries} left)`,
        err
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

export async function sendMessage(
  message: string,
  history: ChatMessage[],
  cachedArticles: Record<string, unknown>[] = []
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const res = await fetchWithRetry(
      `${API_URL}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          message,
          history,
          cached_articles: cachedArticles,
        } satisfies ChatRequest),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error?.detail ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<ChatResponse>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Yêu cầu mất quá lâu (>90s), vui lòng thử lại.");
    }
    if (isRetryableNetworkError(err)) {
      throw new Error(
        "Mất kết nối tới server. Kiểm tra lại kết nối mạng hoặc tải lại trang."
      );
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}
