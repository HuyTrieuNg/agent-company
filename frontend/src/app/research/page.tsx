"use client";

import { useRef, useState, useEffect, KeyboardEvent } from "react";
import Markdown from "@/components/Markdown";
import {
  startResearch,
  getResearchResult,
  streamResearchProgress,
  streamFollowup,
} from "@/lib/sources-api";
import type { ResearchSession } from "@/lib/sources-api";

const SUGGESTIONS = [
  "Tình hình lãi suất ngân hàng Việt Nam hiện nay",
  "Diễn biến thị trường chứng khoán tuần qua",
  "Tỷ giá USD/VND và tác động đến xuất nhập khẩu",
  "Tình hình lạm phát và CPI tháng gần nhất",
];

// Heuristic: detect if a query is a follow-up to the previous topic.
// Returns true if the new query likely refers to the same context.
function isFollowUp(prevQuery: string, newQuery: string): boolean {
  const followUpSignals = [
    /^(vậy|thì|còn|thế|đó|ngoài ra|bên cạnh|hơn nữa|nếu|tại sao|tại sao lại|làm sao|như thế nào|ý bạn)/i,
    /^(và |nhưng |hoặc |hay |hay là )/i,
    /\b(trên|đó|này|đây|ấy|kia|vừa rồi|đã nói|báo cáo|bài|kết quả)\b/i,
    /^(giải thích|phân tích thêm|chi tiết hơn|cụ thể|ví dụ|so sánh)/i,
  ];
  const q = newQuery.trim().toLowerCase();

  // Very short queries are usually follow-ups
  if (q.split(" ").length <= 5 && followUpSignals.some((r) => r.test(q))) return true;

  // Check keyword overlap with previous query
  const prevWords = new Set(
    prevQuery
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const newWords = newQuery
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const overlap = newWords.filter((w) => prevWords.has(w)).length;
  const overlapRatio = overlap / Math.max(newWords.length, 1);

  return followUpSignals.some((r) => r.test(q)) || overlapRatio >= 0.5;
}

type FollowUpQA = {
  question: string;
  answer: string | null; // null = loading, "" = streaming in progress
  streaming?: boolean;   // true while tokens are arriving
};

type ResearchEntry = {
  query: string;
  sessionId: string | null;
  steps: string[];
  fetchingReport: boolean;   // true while polling for result_md after SSE done
  fetchElapsed: number;      // seconds elapsed since fetchingReport started
  result: ResearchSession | null;
  status: "running" | "done" | "error";
  followUps: FollowUpQA[];
};

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400 [animation-duration:0.7s]" />
  );
}

export default function ResearchPage() {
  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // track timers so we can clear them
  const elapsedTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Cleanup SSE + timers on unmount
  useEffect(() => () => {
    cleanupRef.current?.();
    elapsedTimersRef.current.forEach((t) => clearInterval(t));
  }, []);

  // ── Long-poll after SSE finishes ──────────────────────────────────────────
  function startFetchingReport(
    entryIndex: number,
    session_id: string,
    onSettled: () => void
  ) {
    const POLL_INTERVAL_MS = 3000;
    const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes
    let elapsed = 0;
    let settled = false;

    // Mark entry as fetching
    setEntries((prev) => {
      const next = [...prev];
      next[entryIndex] = { ...next[entryIndex], fetchingReport: true, fetchElapsed: 0 };
      return next;
    });

    // Elapsed ticker (every second for display)
    const elapsedTimer = setInterval(() => {
      if (settled) { clearInterval(elapsedTimer); return; }
      setEntries((prev) => {
        const next = [...prev];
        if (next[entryIndex]) {
          next[entryIndex] = { ...next[entryIndex], fetchElapsed: next[entryIndex].fetchElapsed + 1 };
        }
        return next;
      });
    }, 1000);
    elapsedTimersRef.current.set(entryIndex, elapsedTimer);

    // Poll loop
    const poll = async () => {
      while (elapsed < MAX_WAIT_MS && !settled) {
        try {
          const result = await getResearchResult(session_id);
          if (result.result_md || result.status === "error") {
            settled = true;
            clearInterval(elapsedTimer);
            elapsedTimersRef.current.delete(entryIndex);
            setEntries((prev) => {
              const next = [...prev];
              next[entryIndex] = {
                ...next[entryIndex],
                result,
                fetchingReport: false,
                status: result.status === "error" ? "error" : "done",
              };
              return next;
            });
            onSettled();
            return;
          }
        } catch {
          // network error, keep trying
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        elapsed += POLL_INTERVAL_MS;
      }

      // Timeout — show whatever we have
      if (!settled) {
        settled = true;
        clearInterval(elapsedTimer);
        elapsedTimersRef.current.delete(entryIndex);
        setEntries((prev) => {
          const next = [...prev];
          next[entryIndex] = {
            ...next[entryIndex],
            fetchingReport: false,
            status: "error",
          };
          return next;
        });
        onSettled();
      }
    };

    poll();
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit() {
    const query = input.trim();
    if (!query || loading) return;

    setInput("");
    setError(null);

    // ── Follow-up detection ──────────────────────────────────────────────
    const lastEntry = entries[entries.length - 1];
    if (
      lastEntry &&
      lastEntry.status === "done" &&
      lastEntry.sessionId &&
      lastEntry.result?.result_md &&
      isFollowUp(lastEntry.query, query)
    ) {
      const lastIdx = entries.length - 1;
      const followUpIdx = lastEntry.followUps.length;

      // Append a follow-up placeholder (streaming = true, answer = "")
      setEntries((prev) => {
        const next = [...prev];
        next[lastIdx] = {
          ...next[lastIdx],
          followUps: [
            ...next[lastIdx].followUps,
            { question: query, answer: "", streaming: true },
          ],
        };
        return next;
      });
      setLoading(true);

      cleanupRef.current = streamFollowup(
        lastEntry.sessionId,
        query,
        // onToken — append each token to answer
        (token) => {
          setEntries((prev) => {
            const next = [...prev];
            const fups = [...next[lastIdx].followUps];
            fups[followUpIdx] = {
              ...fups[followUpIdx],
              answer: (fups[followUpIdx].answer ?? "") + token,
              streaming: true,
            };
            next[lastIdx] = { ...next[lastIdx], followUps: fups };
            return next;
          });
        },
        // onDone
        (fullAnswer) => {
          setEntries((prev) => {
            const next = [...prev];
            const fups = [...next[lastIdx].followUps];
            fups[followUpIdx] = { question: query, answer: fullAnswer, streaming: false };
            next[lastIdx] = { ...next[lastIdx], followUps: fups };
            return next;
          });
          setLoading(false);
        },
        // onError
        (msg) => {
          setEntries((prev) => {
            const next = [...prev];
            const fups = [...next[lastIdx].followUps];
            fups[followUpIdx] = {
              question: query,
              answer: `❌ Lỗi: ${msg}`,
              streaming: false,
            };
            next[lastIdx] = { ...next[lastIdx], followUps: fups };
            return next;
          });
          setLoading(false);
        }
      );
      return;
    }

    // ── New research ─────────────────────────────────────────────────────
    setLoading(true);
    const entryIndex = entries.length;
    setEntries((prev) => [
      ...prev,
      {
        query,
        sessionId: null,
        steps: ["🚀 Bắt đầu nghiên cứu..."],
        fetchingReport: false,
        fetchElapsed: 0,
        result: null,
        status: "running",
        followUps: [],
      },
    ]);

    try {
      const { session_id } = await startResearch(query);

      // Patch sessionId into entry
      setEntries((prev) => {
        const next = [...prev];
        next[entryIndex] = { ...next[entryIndex], sessionId: session_id };
        return next;
      });

      // SSE: stream progress
      cleanupRef.current = streamResearchProgress(
        session_id,
        // onStep
        (step) => {
          setEntries((prev) => {
            const next = [...prev];
            const entry = { ...next[entryIndex] };
            entry.steps = [...entry.steps, step];
            next[entryIndex] = entry;
            return next;
          });
        },
        // onDone — hand off to long-poll
        () => {
          startFetchingReport(entryIndex, session_id, () => setLoading(false));
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
      setEntries((prev) => {
        const next = [...prev];
        next[entryIndex] = { ...next[entryIndex], status: "error" };
        return next;
      });
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-[#06b6d4] text-base shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
            📊
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-white">Research Agent</p>
            <p className="text-[11px] text-slate-500">Đọc &amp; tổng hợp tin tức kinh tế</p>
          </div>
        </div>

        <a
          href="/sources"
          className="ml-auto flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-[11px] text-slate-400 transition hover:border-[#8b5cf6]/40 hover:text-slate-200"
          id="goto-sources-link"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          Quản lý nguồn
        </a>

        {entries.length > 0 && (
          <button
            id="clear-research-btn"
            onClick={() => { setEntries([]); setError(null); }}
            className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/8 bg-transparent text-slate-600 transition-colors duration-200 hover:border-white/15 hover:bg-white/5 hover:text-slate-50 cursor-pointer"
            title="Xóa lịch sử research"
          >
            <ResetIcon />
          </button>
        )}
      </header>

      {/* ── Results area ── */}
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-7" id="research-area">
        {entries.length === 0 && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-16 text-center">
            <div className="text-[44px] leading-none filter drop-shadow-[0_0_20px_rgba(16,185,129,0.4)]">📰</div>
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.5px] text-slate-50">
              Research Agent
            </h1>
            <p className="m-0 max-w-sm text-sm leading-[1.65] text-slate-500">
              Nhập chủ đề hoặc câu hỏi kinh tế. Agent sẽ tự động đọc tin từ các
              nguồn đã cấu hình và tổng hợp báo cáo cho bạn.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="cursor-pointer rounded-full border border-white/8 bg-white/4 px-4 py-2 text-[13px] text-slate-400 transition-all duration-200 hover:-translate-y-px hover:border-emerald-500/40 hover:bg-emerald-500/8 hover:text-slate-50"
                  id={`research-chip-${s.slice(0, 20).replace(/\s+/g, "-")}`}
                  onClick={() => {
                    setInput(s);
                    textareaRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {entries.map((entry, i) => (
              <div key={i} id={`research-entry-${i}`} className="flex flex-col gap-3 animate-fade-up">

                {/* ── Initial query bubble ── */}
                <div className="flex justify-end">
                  <div className="max-w-[74%] rounded-2xl rounded-br-sm bg-linear-to-br from-emerald-600 to-teal-700 px-4 py-3 text-sm leading-[1.7] text-white">
                    {entry.query}
                  </div>
                </div>

                {/* ── Agent response bubble ── */}
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-teal-500 text-sm shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
                    📊
                  </div>
                  <div className="flex-1 rounded-2xl rounded-bl-sm border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-md">

                    {/* Steps log — always visible, dimmed when done */}
                    <div className="space-y-1.5 mb-2">
                      {entry.steps.map((step, si) => (
                        <div
                          key={si}
                          className={`flex items-center gap-2 text-[13px] ${
                            entry.status === "done" ? "text-slate-600" : "text-slate-400"
                          }`}
                        >
                          <span className="shrink-0">{step}</span>
                        </div>
                      ))}
                      {entry.status === "running" && (
                        <div className="flex items-center gap-1.25 pt-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-blink" />
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-blink [animation-delay:0.18s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-blink [animation-delay:0.36s]" />
                        </div>
                      )}
                    </div>

                    {/* Fetching report loading state */}
                    {entry.fetchingReport && (
                      <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/6 px-3.5 py-2.5">
                        <SpinnerIcon />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px] font-medium text-emerald-400">
                            Đang tổng hợp báo cáo từ model…
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {entry.fetchElapsed < 60
                              ? `${entry.fetchElapsed}s (model local có thể mất vài phút)`
                              : `${Math.floor(entry.fetchElapsed / 60)}m ${entry.fetchElapsed % 60}s — vẫn đang xử lý…`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Final report */}
                    {entry.status === "done" && entry.result?.result_md && (
                      <div className="mt-4 border-t border-white/8 pt-4 text-sm leading-[1.7] text-slate-100">
                        <Markdown content={entry.result.result_md} />
                      </div>
                    )}

                    {/* Error */}
                    {entry.status === "error" && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-[13px] text-red-400 mt-3">
                        ⚠️ {entry.result?.error_message ?? "Đã xảy ra lỗi trong quá trình nghiên cứu."}
                      </div>
                    )}

                    {/* Done meta */}
                    {entry.status === "done" && (
                      <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-2.5 text-[11px] text-slate-600">
                        <span>✅ Hoàn thành</span>
                        {entry.steps.length > 0 && (
                          <span>· {entry.steps.length} bước</span>
                        )}
                        <span className="ml-auto text-emerald-700/70 text-[10px]">
                          Câu hỏi tiếp theo sẽ dùng lại ngữ cảnh này
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Follow-up Q&A pairs ── */}
                {entry.followUps.map((fup, fi) => (
                  <div key={fi} className="flex flex-col gap-3 pl-11">
                    {/* Follow-up question */}
                    <div className="flex justify-end">
                      <div className="max-w-[74%] rounded-2xl rounded-br-sm bg-linear-to-br from-emerald-600/70 to-teal-700/70 px-4 py-2.5 text-sm leading-[1.7] text-white/90">
                        {fup.question}
                      </div>
                    </div>

                    {/* Follow-up answer */}
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500/70 to-teal-500/70 text-xs">
                        💬
                      </div>
                      <div className="flex-1 rounded-2xl rounded-bl-sm border border-white/8 bg-white/4 px-4 py-3 text-sm leading-[1.7] backdrop-blur-md">
                        {fup.answer === null || (fup.streaming && !fup.answer) ? (
                          <div className="flex items-center gap-2.5">
                            <SpinnerIcon />
                            <span className="text-[13px] text-slate-500">
                              Đang phân tích ngữ cảnh…
                            </span>
                          </div>
                        ) : (
                          <div className="text-slate-100">
                            <Markdown content={fup.answer ?? ""} />
                            {fup.streaming && (
                              <span className="inline-block h-4 w-0.5 animate-blink bg-emerald-400 ml-0.5 align-middle" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </main>

      {/* ── Input ── */}
      <div className="shrink-0 border-t border-white/8 px-5 pb-5.5 pt-3.5">
        {error && (
          <div className="mb-2.5 flex animate-fade-up items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/8 px-3.5 py-2.5 text-[13px] text-red-400 [animation-duration:0.22s]" id="research-error-toast">
            ⚠️ {error}
          </div>
        )}

        {/* Context hint when last entry is done */}
        {entries.length > 0 && entries[entries.length - 1].status === "done" && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/50" />
            Câu hỏi liên quan sẽ dùng lại báo cáo vừa tổng hợp · nhập chủ đề mới để research lại
          </div>
        )}

        <form
          className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/6 p-2.5 pl-4 transition-[border-color,box-shadow] duration-200 focus-within:border-emerald-500/40 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          id="research-form"
        >
          <textarea
            ref={textareaRef}
            id="research-input"
            className="min-h-6 max-h-40 flex-1 resize-none border-none bg-transparent p-0 text-sm leading-[1.6] text-slate-50 outline-none placeholder-slate-600"
            rows={1}
            placeholder={
              entries.length > 0 && entries[entries.length - 1].status === "done"
                ? "Hỏi thêm về báo cáo, hoặc nhập chủ đề mới để research lại…"
                : "Nhập chủ đề nghiên cứu… (Enter để bắt đầu)"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            type="submit"
            id="research-submit-btn"
            className="flex h-9.5 w-9.5 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-linear-to-br from-emerald-500 to-teal-600 text-white transition-[transform,box-shadow,opacity] duration-180 hover:enabled:scale-[1.06] hover:enabled:shadow-[0_4px_18px_rgba(16,185,129,0.4)] active:enabled:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!input.trim() || loading}
            aria-label="Bắt đầu nghiên cứu"
          >
            {loading
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white [animation-duration:0.65s]" />
              : <SearchIcon />}
          </button>
        </form>

        <p className="mt-2 text-center text-[11px] text-slate-700">
          Agent sẽ đọc các nguồn đã cấu hình. Model local có thể mất vài phút.
        </p>
      </div>
    </div>
  );
}
