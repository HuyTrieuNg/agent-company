export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  history: ChatMessage[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const CHAT_TIMEOUT_MS = 90_000; // 90s – đủ cho Qdrant + Gemini

export async function sendMessage(
  message: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ message, history } satisfies ChatRequest),
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error?.detail ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<ChatResponse>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Yêu cầu mất quá lâu (>90s), vui lòng thử lại.");
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}
