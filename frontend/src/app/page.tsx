"use client";

import {
  useRef,
  useState,
  useEffect,
  KeyboardEvent,
} from "react";
import { sendMessage, ChatMessage } from "@/lib/api";
import Markdown from "@/components/Markdown";

const SUGGESTIONS = [
  "Phân tích tình hình lãi suất ngân hàng hiện nay",
  "Giải thích khái niệm AI là gì?",
  "Viết hàm Python sắp xếp danh sách",
  "Tóm tắt lịch sử kinh tế Việt Nam",
];

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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

export default function ChatPage() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  async function handleSubmit() {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    setError(null);
    setLoading(true);
    setHistory((prev) => [...prev, { role: "user", content: msg }]);

    try {
      const res = await sendMessage(msg, history);
      setHistory(res.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
      setHistory((prev) => prev.slice(0, -1));
    } finally {
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#06b6d4] text-base shadow-[0_2px_12px_rgba(139,92,246,0.35)] animate-pulse-glow">
            ✦
          </div>
          <div>
            <p className="text-[15px] font-bold bg-gradient-to-r from-white via-slate-200 to-[#8b5cf6] bg-clip-text text-transparent tracking-tight">
              Chat AI
            </p>
            <p className="text-[11px] text-slate-500">Powered by Gemini</p>
          </div>
        </div>

        <span className="ml-auto flex items-center gap-1.25 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-medium text-emerald-500 whitespace-nowrap">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          Online
        </span>

        {history.length > 0 && (
          <button
            id="clear-chat-btn"
            className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/8 bg-transparent text-slate-600 transition-colors duration-200 hover:border-white/15 hover:bg-white/5 hover:text-slate-50 cursor-pointer"
            onClick={() => { setHistory([]); setError(null); }}
            title="Xóa hội thoại"
          >
            <ResetIcon />
          </button>
        )}
      </header>

      {/* ── Messages ── */}
      <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-7" id="messages-area">
        {history.length === 0 && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-16 text-center">
            <div className="text-[44px] leading-none filter drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]">✦</div>
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.5px] text-slate-50">
              Xin chào! Tôi có thể giúp gì?
            </h1>
            <p className="m-0 max-w-xs text-sm leading-[1.65] text-slate-500">
              Tôi là trợ lý AI thông minh được vận hành bởi Google Gemini.
              Hãy hỏi tôi bất kỳ điều gì hoặc dùng tính năng{" "}
              <a href="/research" className="text-[#a78bfa] hover:text-[#c4b5fd]">Research</a>{" "}
              để đọc tin tức kinh tế.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="cursor-pointer rounded-full border border-white/8 bg-white/4 px-4 py-2 text-[13px] text-slate-400 transition-all duration-200 ease-in-out hover:-translate-y-px hover:border-[#8b5cf6]/60 hover:bg-[#8b5cf6]/10 hover:text-slate-50"
                  id={`chip-${s.slice(0, 15).replace(/\s+/g, "-")}`}
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
            {history.map((msg, i) => (
              <div
                key={i}
                id={`msg-${i}`}
                className={`flex gap-3 animate-fade-up ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${msg.role === "model" ? "bg-gradient-to-br from-[#8b5cf6] to-[#06b6d4] shadow-[0_2px_12px_rgba(139,92,246,0.35)]" : "border border-white/8 bg-white/7"}`}>
                  {msg.role === "model" ? "✦" : "👤"}
                </div>

                <div className={`max-w-[74%] rounded-2xl px-4 py-3 text-sm leading-[1.7] break-words ${msg.role === "user" ? "rounded-br-sm bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] text-white" : "rounded-bl-sm border border-white/8 bg-white/5 text-slate-100 backdrop-blur-md"}`}>
                  {msg.role === "model" ? (
                    <Markdown content={msg.content} />
                  ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 animate-fade-up" id="typing-indicator">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#06b6d4] text-sm shadow-[0_2px_12px_rgba(139,92,246,0.35)]">✦</div>
                <div className="max-w-[74%] rounded-2xl rounded-bl-sm border border-white/8 bg-white/5 px-4 py-3 text-sm leading-[1.7] backdrop-blur-md">
                  <div className="flex items-center gap-1.25 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] animate-blink" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] animate-blink [animation-delay:0.18s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] animate-blink [animation-delay:0.36s]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* ── Input ── */}
      <div className="shrink-0 border-t border-white/8 px-5 pb-5.5 pt-3.5">
        {error && (
          <div className="mb-2.5 flex animate-fade-up items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/8 px-3.5 py-2.5 text-[13px] text-red-400 [animation-duration:0.22s]" id="error-toast">
            ⚠️ {error}
          </div>
        )}

        <form
          className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/6 p-2.5 pl-4 transition-[border-color,box-shadow] duration-200 focus-within:border-[#8b5cf6]/60 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.1)]"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          id="chat-form"
        >
          <textarea
            ref={textareaRef}
            id="chat-input"
            className="min-h-6 max-h-40 flex-1 resize-none border-none bg-transparent p-0 text-sm leading-[1.6] text-slate-50 outline-none placeholder-slate-600"
            rows={1}
            placeholder="Nhập tin nhắn… (Enter gửi · Shift+Enter xuống dòng)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            type="submit"
            id="send-button"
            className="flex h-9.5 w-9.5 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] text-white transition-[transform,box-shadow,opacity] duration-180 hover:enabled:scale-[1.06] hover:enabled:shadow-[0_4px_18px_rgba(139,92,246,0.45)] active:enabled:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!input.trim() || loading}
            aria-label="Gửi tin nhắn"
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white [animation-duration:0.65s]" /> : <SendIcon />}
          </button>
        </form>

        <p className="mt-2 text-center text-[11px] text-slate-700">
          Gemini có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.
        </p>
      </div>
    </div>
  );
}
