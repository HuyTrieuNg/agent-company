"use client";

import {
  useRef,
  useState,
  useEffect,
  FormEvent,
  KeyboardEvent,
} from "react";
import { sendMessage, ChatMessage } from "@/lib/api";
import Markdown from "@/components/Markdown";

const SUGGESTIONS = [
  "Giải thích khái niệm AI là gì?",
  "Viết hàm Python sắp xếp danh sách",
  "Tóm tắt lịch sử Việt Nam ngắn gọn",
  "Giải bài: 2x + 5 = 15, tìm x",
];

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    setError(null);
    setLoading(true);

    // Optimistic: add user bubble immediately
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
    <div className="chat-layout">
      {/* ── Header ── */}
      <header className="chat-header">
        <div className="header-logo">✦</div>
        <div>
          <p className="header-title">Gemini Chatbot</p>
          <p className="header-subtitle">Powered by Google Gemini 2.0 Flash</p>
        </div>

        <span className="online-badge" style={{ marginLeft: "auto" }}>
          <span className="online-dot" />
          Online
        </span>

        {history.length > 0 && (
          <button
            id="clear-chat-btn"
            className="icon-btn"
            onClick={() => { setHistory([]); setError(null); }}
            title="Xoá hội thoại"
          >
            <ResetIcon />
          </button>
        )}
      </header>

      {/* ── Messages ── */}
      <main className="messages-area" id="messages-area">
        {history.length === 0 && !loading ? (
          <div className="welcome">
            <div className="welcome-icon">✦</div>
            <h1 className="welcome-title">Xin chào! Tôi có thể giúp gì?</h1>
            <p className="welcome-sub">
              Tôi là trợ lý AI thông minh được vận hành bởi Google Gemini.
              Hãy hỏi tôi bất kỳ điều gì — tôi hỗ trợ cả tiếng Việt lẫn
              tiếng Anh!
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chip"
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
                className={`message-row ${msg.role}`}
              >
                <div className={`avatar ${msg.role}`}>
                  {msg.role === "model" ? "✦" : "👤"}
                </div>

                <div className={`bubble ${msg.role}`}>
                  {msg.role === "model" ? (
                    <Markdown content={msg.content} />
                  ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message-row model" id="typing-indicator">
                <div className="avatar model">✦</div>
                <div className="bubble model">
                  <div className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* ── Input ── */}
      <div className="input-area">
        {error && (
          <div className="error-toast" id="error-toast">
            ⚠️ {error}
          </div>
        )}

        <form className="input-box" onSubmit={handleSubmit} id="chat-form">
          <textarea
            ref={textareaRef}
            id="chat-input"
            className="input-textarea"
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
            className="send-btn"
            disabled={!input.trim() || loading}
            aria-label="Gửi tin nhắn"
          >
            {loading ? <span className="spinner" /> : <SendIcon />}
          </button>
        </form>

        <p className="input-hint">
          Gemini có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.
        </p>
      </div>
    </div>
  );
}
