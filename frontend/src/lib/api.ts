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

export async function sendMessage(
  message: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ message, history } satisfies ChatRequest),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<ChatResponse>;
}
