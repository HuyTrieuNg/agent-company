/**
 * Sources API client — CRUD for source profiles.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface SourceProfile {
  id: string;
  name: string;
  base_url: string;
  category: string;
  language: string;
  is_active: boolean;
  priority: number;
  created_at: string | null;
}

export interface SourceCreate {
  id: string;
  name: string;
  base_url: string;
  category?: string;
  language?: string;
  priority?: number;
  is_active?: boolean;
}

export interface SourceUpdate {
  name?: string;
  base_url?: string;
  category?: string;
  language?: string;
  priority?: number;
  is_active?: boolean;
}

const headers = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listSources(): Promise<SourceProfile[]> {
  const res = await fetch(`${API_URL}/api/sources`, { headers });
  return handleResponse<SourceProfile[]>(res);
}

export async function createSource(data: SourceCreate): Promise<SourceProfile> {
  const res = await fetch(`${API_URL}/api/sources`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse<SourceProfile>(res);
}

export async function updateSource(
  id: string,
  data: SourceUpdate
): Promise<SourceProfile> {
  const res = await fetch(`${API_URL}/api/sources/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse<SourceProfile>(res);
}

export async function toggleSource(
  id: string
): Promise<{ id: string; is_active: boolean }> {
  const res = await fetch(`${API_URL}/api/sources/${id}/toggle`, {
    method: "PATCH",
    headers,
  });
  return handleResponse<{ id: string; is_active: boolean }>(res);
}

export async function deleteSource(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/sources/${id}`, {
    method: "DELETE",
    headers,
  });
  return handleResponse<void>(res);
}

// ── Research API ──────────────────────────────────────────────────────────────

export interface ResearchSession {
  id: string;
  query: string;
  status: "running" | "done" | "error";
  current_step: string | null;
  result_md: string | null;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export async function startResearch(query: string): Promise<{ session_id: string }> {
  const res = await fetch(`${API_URL}/api/research`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  return handleResponse<{ session_id: string }>(res);
}

export async function getResearchResult(sessionId: string): Promise<ResearchSession> {
  const res = await fetch(`${API_URL}/api/research/${sessionId}?t=${Date.now()}`, { headers });
  return handleResponse<ResearchSession>(res);
}

export async function followupResearch(
  sessionId: string,
  query: string
): Promise<{ answer: string; session_id: string }> {
  const res = await fetch(`${API_URL}/api/research/${sessionId}/followup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  return handleResponse<{ answer: string; session_id: string }>(res);
}


export function streamResearchProgress(
  sessionId: string,
  onStep: (step: string) => void,
  onDone: () => void
): () => void {
  const url = `${API_URL}/api/research/${sessionId}/stream`;
  let aborted = false;
  const controller = new AbortController();

  async function startStream() {
    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        if (!aborted) onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const data = JSON.parse(raw);
            if (data.done) {
              if (!aborted) onDone();
              return;
            } else if (data.step) {
              if (!aborted) onStep(data.step);
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (!aborted) onDone();
    } catch (err: unknown) {
      if (!aborted && (err as { name?: string })?.name !== "AbortError") {
        onDone();
      }
    }
  }

  startStream();

  // Return cleanup function
  return () => {
    aborted = true;
    controller.abort();
  };
}
