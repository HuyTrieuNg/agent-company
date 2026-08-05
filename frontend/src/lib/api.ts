export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  history: ChatMessage[];
  /** Danh sách bài báo đã retrieve từ lượt trước, dùng để backend cache */
  cached_articles: Record<string, unknown>[];
  /** Danh sách bài báo người dùng ghim trực tiếp từ trang Tin tức làm Context */
  pinned_articles?: Record<string, unknown>[];
}

export interface ChatResponse {
  reply: string;
  session_id?: string;
  history: ChatMessage[];
  /** Backend trả về articles đã dùng (mới retrieve hoặc từ cache) để frontend lưu lại */
  cached_articles: Record<string, unknown>[];
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  messages: ChatMessage[];
}

export interface UserPreference {
  role_title: string;
  interested_topics: string;
  response_style: string;
  custom_instructions: string;
}

export interface NewsArticleItem extends Record<string, unknown> {
  id?: string;
  url_hash: string;
  title: string;
  sapo: string;
  site: string;
  category: string;
  published_at?: string;
  author?: string;
  tags?: string[];
  url?: string;
  score?: number;
}


export interface FullArticleItem extends NewsArticleItem {
  content: string;
  chunk_count?: number;
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
  cachedArticles: Record<string, unknown>[] = [],
  sessionId?: string,
  pinnedArticles: Record<string, unknown>[] = []
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
          session_id: sessionId,
          history,
          cached_articles: cachedArticles,
          pinned_articles: pinnedArticles,
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


export async function fetchSessions(): Promise<ChatSessionSummary[]> {
  const res = await fetchWithRetry(`${API_URL}/api/chat/sessions`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải danh sách phiên chat");
  return res.json();
}

export async function createSession(): Promise<ChatSessionSummary> {
  const res = await fetchWithRetry(`${API_URL}/api/chat/sessions`, {
    method: "POST",
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tạo phiên chat mới");
  return res.json();
}

export async function fetchSessionDetail(sessionId: string): Promise<ChatSessionDetail> {
  const res = await fetchWithRetry(`${API_URL}/api/chat/sessions/${sessionId}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải thông tin phiên chat");
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetchWithRetry(`${API_URL}/api/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể xóa phiên chat");
}

export async function fetchPreferences(): Promise<UserPreference> {
  const res = await fetchWithRetry(`${API_URL}/api/preferences`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải cài đặt người dùng");
  return res.json();
}

export async function updatePreferences(pref: UserPreference): Promise<UserPreference> {
  const res = await fetchWithRetry(`${API_URL}/api/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(pref),
  });
  if (!res.ok) throw new Error("Không thể cập nhật cài đặt người dùng");
  return res.json();
}

export async function fetchNewsCategories(): Promise<{ sites: { code: string; name: string }[]; categories: string[] }> {
  const res = await fetchWithRetry(`${API_URL}/api/news/categories`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải danh mục tin tức");
  return res.json();
}

export async function fetchNewsArticles(params?: {
  query?: string;
  category?: string;
  site?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}): Promise<{ page: number; limit: number; total_retrieved: number; articles: NewsArticleItem[] }> {
  const url = new URL(`${API_URL}/api/news/articles`, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  if (params?.query) url.searchParams.set("query", params.query);
  if (params?.category) url.searchParams.set("category", params.category);
  if (params?.site) url.searchParams.set("site", params.site);
  if (params?.date_from) url.searchParams.set("date_from", params.date_from);
  if (params?.date_to) url.searchParams.set("date_to", params.date_to);
  if (params?.page) url.searchParams.set("page", params.page.toString());
  if (params?.limit) url.searchParams.set("limit", params.limit.toString());

  const res = await fetchWithRetry(url.toString(), {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error("Không thể tải danh sách bài báo");
  return res.json();
}

export async function fetchFullArticles(urlHashes: string[]): Promise<{ articles: FullArticleItem[] }> {
  const res = await fetchWithRetry(`${API_URL}/api/news/articles/full`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ url_hashes: urlHashes }),
  });
  if (!res.ok) throw new Error("Không thể tải nội dung đầy đủ bài báo");
  return res.json();
}


