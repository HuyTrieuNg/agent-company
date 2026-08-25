"use client";

import {
  useRef,
  useState,
  useEffect,
  KeyboardEvent,
  memo,
} from "react";
import { sendMessage, ChatMessage } from "@/lib/api";
import Markdown from "@/components/Markdown";
import { useChatStore } from "@/stores/chatStore";
import { useContextStore } from "@/stores/contextStore";
import { useUiStore } from "@/stores/uiStore";
import { useChatSessions } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Send,
  RotateCcw,
  SlidersHorizontal,
  Bookmark,
  User,
  AlertCircle,
  Copy,
  Check,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Tóm tắt tin tức kinh tế hôm nay",
  "Tìm các bài báo về giá vàng trên CafeF",
  "Phân tích tình hình lãi suất ngân hàng hiện nay",
  "Nhận định thị trường chứng khoán hôm nay",
];

const MessageItem = memo(function MessageItem({
  msg,
  index,
}: {
  msg: ChatMessage;
  index: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      toast.success("Đã sao chép phản hồi vào clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  const isModel = msg.role === "model";

  return (
    <div
      id={`msg-${index}`}
      className={`group flex gap-3 animate-fade-up ${!isModel ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
          isModel
            ? "bg-linear-to-br from-violet-600 to-cyan-500 text-white shadow-md shadow-violet-500/25"
            : "border border-white/10 bg-white/8 text-slate-200"
        }`}
      >
        {isModel ? <Sparkles className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[80%]">
        <div
          className={`relative rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed break-words ${
            !isModel
              ? "rounded-br-sm bg-linear-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20"
              : "rounded-bl-sm border border-white/10 bg-[#0e0e18] text-slate-100 shadow-lg"
          }`}
        >
          {isModel ? (
            <Markdown content={msg.content} />
          ) : (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          )}
        </div>

        {/* Copy action on model message */}
        {isModel && (
          <div className="flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="h-6 w-6 text-slate-500 hover:text-slate-200"
                  aria-label="Sao chép nội dung"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-[10px]">{copied ? "Đã sao chép" : "Sao chép câu trả lời"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
});

const MessageList = memo(function MessageList({
  history,
  loading,
  onSuggestionClick,
}: {
  history: ChatMessage[];
  loading: boolean;
  onSuggestionClick: (s: string) => void;
}) {
  return (
    <>
      {history.length === 0 && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center animate-fade-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-violet-600 to-cyan-500 text-white shadow-xl shadow-violet-500/25">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight bg-linear-to-r from-white via-slate-100 to-violet-300 bg-clip-text text-transparent">
            Xin chào! Tôi có thể giúp gì cho bạn?
          </h1>
          <p className="max-w-md text-xs md:text-sm leading-relaxed text-slate-400">
            Tôi là trợ lý AI phân tích tài chính & tin tức, kết nối trực tiếp với cơ sở dữ liệu vector Qdrant và Google Gemini.
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-xl">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="rounded-xl border-white/10 bg-white/4 text-xs text-slate-300 hover:border-violet-500/50 hover:bg-violet-600/10 hover:text-white transition-all duration-200"
                onClick={() => onSuggestionClick(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {history.map((msg, i) => (
            <MessageItem key={i} msg={msg} index={i} />
          ))}

          {loading && (
            <div className="flex gap-3 animate-fade-up" id="typing-indicator">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-cyan-500 text-white shadow-md shadow-violet-500/25">
                <Sparkles className="h-4 w-4 animate-spin" />
              </div>
              <div className="max-w-[75%] rounded-2xl rounded-bl-sm border border-white/10 bg-[#0e0e18] px-4 py-3 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-blink" />
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-blink [animation-delay:0.18s]" />
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-blink [animation-delay:0.36s]" />
                  <span className="text-xs text-slate-400 ml-2">Đang suy nghĩ...</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
});

export default function ChatPage() {
  const {
    history,
    setHistory,
    cachedArticles,
    setCachedArticles,
    activeSessionId,
    setActiveSessionId,
    createNewSession,
    loadingHistory,
    setIsPrefModalOpen,
  } = useChatStore();

  const {
    pinnedArticles,
    getActiveArticles,
    removePinnedArticle,
    clearPinnedArticles,
  } = useContextStore();

  const { setContextDrawerOpen } = useUiStore();
  const { refetch: refetchSessions } = useChatSessions();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activePinned = getActiveArticles();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading, loadingHistory]);

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
      const res = await sendMessage(
        msg,
        history,
        cachedArticles,
        activeSessionId || undefined,
        activePinned
      );
      setHistory(res.history);
      if (res.session_id && activeSessionId !== res.session_id) {
        setActiveSessionId(res.session_id);
      }
      refetchSessions();

      if (res.cached_articles?.length) {
        setCachedArticles(res.cached_articles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi gửi tin nhắn.");
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
    <div className="flex h-full flex-col bg-[#07070a] text-slate-100">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-3.5 bg-[#07070a]/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-cyan-500 text-white shadow-md shadow-violet-500/25 animate-pulse-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold bg-linear-to-r from-white via-slate-200 to-violet-300 bg-clip-text text-transparent">
              Trợ Lý AI Thông Minh
            </p>
            <p className="text-[10px] text-slate-500">Google Gemini & Qdrant RAG</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pinnedArticles.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContextDrawerOpen(true)}
                  className="gap-1.5 text-xs text-violet-300 border-violet-500/30 bg-violet-950/20 hover:bg-violet-900/30"
                >
                  <Bookmark className="h-3.5 w-3.5 text-violet-400" />
                  <span>
                    {activePinned.length}/{pinnedArticles.length} Context
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Quản lý ngữ cảnh bài báo đính kèm</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPrefModalOpen(true)}
                className="gap-1 text-xs text-slate-300 hover:text-white"
                aria-label="Cài đặt Context & Persona"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cài đặt</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Cài đặt vai trò và phong cách trả lời</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={createNewSession}
                className="h-8 w-8 text-slate-400 hover:text-white"
                aria-label="Tạo cuộc hội thoại mới"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Tạo cuộc hội thoại mới</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Messages View */}
      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 md:px-8 py-6" id="messages-area">
        {loadingHistory ? (
          <div className="flex flex-1 items-center justify-center py-20 text-slate-500">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-violet-500" />
          </div>
        ) : (
          <MessageList
            history={history}
            loading={loading}
            onSuggestionClick={(s) => {
              setInput(s);
              textareaRef.current?.focus();
            }}
          />
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="shrink-0 border-t border-white/8 px-4 md:px-8 pb-5 pt-3 bg-[#07070a]">
        {error && (
          <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Pinned Context Banner above Input */}
        {pinnedArticles.length > 0 && (
          <Card className="mb-3 flex items-center justify-between rounded-xl border-violet-500/30 bg-violet-950/20 p-2 px-3.5">
            <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
              <span className="text-[11px] font-bold text-violet-300 flex items-center gap-1 shrink-0">
                <Bookmark className="h-3 w-3" />
                Context gửi kèm ({activePinned.length} bài):
              </span>
              {pinnedArticles.map((art) => {
                const key = art.url_hash || art.url || "";
                const isActive = art.isActiveInPrompt !== false;
                return (
                  <Badge
                    key={key}
                    variant={isActive ? "default" : "secondary"}
                    className={`gap-1 text-[10px] py-0.5 px-2 font-normal ${
                      isActive ? "bg-violet-600/30 text-violet-200 border-violet-500/40" : "opacity-50 line-through"
                    }`}
                  >
                    <span className="max-w-[130px] truncate">{art.title}</span>
                    <button
                      onClick={() => removePinnedArticle(key)}
                      className="text-slate-400 hover:text-red-400 ml-1 cursor-pointer"
                      title="Gỡ bài báo này"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <Button
                variant="link"
                size="sm"
                onClick={() => setContextDrawerOpen(true)}
                className="h-auto p-0 text-[11px] text-violet-400 hover:underline"
              >
                Quản lý
              </Button>
              <span className="text-slate-600 text-xs">•</span>
              <Button
                variant="link"
                size="sm"
                onClick={clearPinnedArticles}
                className="h-auto p-0 text-[11px] text-slate-400 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3 mr-0.5" />
                Xóa hết
              </Button>
            </div>
          </Card>
        )}

        {/* Input Form */}
        <form
          className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-2 pl-4 transition-all focus-within:border-violet-500 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          id="chat-form"
        >
          <textarea
            ref={textareaRef}
            id="chat-input"
            className="min-h-6 max-h-36 flex-1 resize-none border-none bg-transparent p-0 text-xs md:text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
            rows={1}
            placeholder="Nhập tin nhắn… (Enter gửi · Shift+Enter xuống dòng)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || loadingHistory}
          />

          <Button
            type="submit"
            id="send-button"
            variant="gradient"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            disabled={!input.trim() || loading || loadingHistory}
            aria-label="Gửi tin nhắn"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        <p className="mt-2 text-center text-[10px] text-slate-600">
          Google Gemini có thể mắc lỗi. Vui lòng kiểm tra thông tin quan trọng trước khi ra quyết định đầu tư.
        </p>
      </div>
    </div>
  );
}

