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
  ArrowRight,
  Database,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Tóm tắt tin tức kinh tế tài chính hôm nay",
  "Tìm các bài báo về giá vàng trên CafeF",
  "Phân tích tình hình lãi suất ngân hàng hiện nay",
  "Nhận định diễn biến thị trường chứng khoán hôm nay",
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
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
          isModel
            ? "bg-(--bg-selected) text-(--action-primary)"
            : "bg-(--bg-subtle) text-(--text-secondary)"
        }`}
        aria-hidden="true"
      >
        {isModel ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>

      <div className="flex flex-col gap-1.5 max-w-[88%] md:max-w-[80%]">
        <div
          className={`relative rounded-lg px-4 py-3 text-xs md:text-sm leading-relaxed break-words ${
            !isModel
              ? "rounded-tr-xs bg-(--action-primary) text-(--action-on-primary)"
              : "rounded-tl-xs border border-(--border-default) bg-(--bg-surface) text-(--text-primary)"
          }`}
        >
          {isModel ? (
            <Markdown content={msg.content} />
          ) : (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          )}
        </div>

        {/* Action strip on model message */}
        {isModel && (
          <div className="flex items-center gap-2 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-6 px-1.5 text-[11px] text-(--text-tertiary) hover:text-(--text-primary) gap-1"
                  aria-label="Sao chép nội dung"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-(--status-positive)" />
                      <span className="text-(--status-positive)">Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Sao chép</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Sao chép nội dung câu trả lời</p>
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
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="grid w-full max-w-4xl grid-cols-1 md:grid-cols-2 gap-8 items-center rounded-xl border border-(--border-default) bg-(--bg-surface) p-6 md:p-8 animate-fade-up">
            {/* Left Column: Greeting & Info */}
            <div className="space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-(--text-primary)">
                  Trợ lý phân tích tài chính
                </h1>
                <p className="text-xs md:text-sm leading-relaxed text-(--text-secondary)">
                  Hỗ trợ tra cứu dữ liệu thị trường, phân tích xu hướng kinh tế vĩ mô và đối chiếu bài báo từ kho tin tức tài chính.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-(--text-tertiary)">
                <span className="inline-flex items-center gap-1 rounded-md bg-(--bg-subtle) px-2 py-1">
                  <Database className="h-3 w-3 text-(--action-primary)" />
                  Qdrant Vector DB
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-(--bg-subtle) px-2 py-1">
                  <Sparkles className="h-3 w-3 text-(--action-primary)" />
                  Google Gemini RAG
                </span>
              </div>
            </div>

            {/* Right Column: Suggestion Prompts */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-(--text-secondary) mb-2">
                Gợi ý câu hỏi bắt đầu:
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSuggestionClick(s)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-(--border-default) bg-(--bg-surface) p-3 text-left text-xs text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary) transition-colors cursor-pointer"
                >
                  <span className="leading-snug">{s}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-(--text-tertiary) group-hover:text-(--action-primary) transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {history.map((msg, i) => (
            <MessageItem key={i} msg={msg} index={i} />
          ))}

          {loading && (
            <div className="flex gap-3 animate-fade-up" id="typing-indicator">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
              </div>
              <div className="rounded-lg rounded-tl-xs border border-(--border-default) bg-(--bg-surface) px-4 py-2.5 text-xs text-(--text-secondary)">
                <div className="flex items-center gap-1.5 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--action-primary) animate-blink" />
                  <span className="h-1.5 w-1.5 rounded-full bg-(--action-primary) animate-blink [animation-delay:0.18s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-(--action-primary) animate-blink [animation-delay:0.36s]" />
                  <span className="text-xs text-(--text-tertiary) ml-2">Đang suy nghĩ...</span>
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
  const [isContextExpanded, setIsContextExpanded] = useState(false);

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
    <div className="flex h-full flex-col bg-(--bg-canvas) text-(--text-primary)">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-(--border-default) bg-(--bg-surface) px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-(--text-primary) leading-tight">
              Trợ lý phân tích
            </h1>
            <p className="text-[11px] text-(--text-tertiary)">Nguồn dữ liệu: Qdrant · Google Gemini</p>
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
                  className="gap-1.5 text-xs text-(--text-secondary) hover:text-(--text-primary)"
                >
                  <Bookmark className="h-3.5 w-3.5 text-(--action-primary)" />
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
                className="gap-1.5 text-xs text-(--text-secondary) hover:text-(--text-primary)"
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
                className="h-8 w-8 text-(--text-secondary) hover:text-(--text-primary)"
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
          <div className="flex flex-1 items-center justify-center py-20 text-(--text-tertiary)">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-(--border-default) border-t-(--action-primary)" />
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
      <div className="shrink-0 border-t border-(--border-default) bg-(--bg-surface) px-4 md:px-8 pb-5 pt-3">
        {error && (
          <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--status-negative)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-negative)_10%,transparent)] px-3.5 py-2.5 text-xs text-(--status-negative)">
            <AlertCircle className="h-4 w-4 shrink-0 text-(--status-negative)" />
            <span>{error}</span>
          </div>
        )}

        {/* Evidence / Pinned Context Tray above Input */}
        {pinnedArticles.length > 0 && (() => {
          const maxCollapsed = 2;
          const visibleArticles = isContextExpanded
            ? pinnedArticles
            : pinnedArticles.slice(0, maxCollapsed);
          const remainingCount = pinnedArticles.length - visibleArticles.length;

          return (
            <Card
              className={`mb-3 flex rounded-lg border border-(--border-default) bg-(--bg-subtle) p-2 px-3.5 transition-all ${
                isContextExpanded
                  ? "flex-col sm:flex-row sm:items-start justify-between gap-2.5"
                  : "items-center justify-between gap-2"
              }`}
            >
              <div
                className={`min-w-0 flex-1 flex items-center gap-1.5 ${
                  isContextExpanded ? "flex-wrap" : "overflow-hidden flex-nowrap"
                }`}
              >
                <span className="text-[11px] font-semibold text-(--text-secondary) flex items-center gap-1 shrink-0">
                  <Bookmark className="h-3 w-3 text-(--action-primary)" />
                  Ngữ cảnh ({activePinned.length} bài):
                </span>

                {visibleArticles.map((art) => {
                  const key = art.url_hash || art.url || "";
                  const isActive = art.isActiveInPrompt !== false;
                  return (
                    <Badge
                      key={key}
                      variant={isActive ? "default" : "secondary"}
                      className={`gap-1 text-[10px] py-0.5 px-2 font-normal rounded-md shrink-0 ${
                        isActive
                          ? "bg-(--bg-surface) text-(--text-primary) border border-(--border-default)"
                          : "opacity-50 line-through bg-(--bg-subtle) text-(--text-tertiary)"
                      }`}
                    >
                      <span className="max-w-[120px] md:max-w-[160px] truncate">{art.title}</span>
                      <button
                        onClick={() => removePinnedArticle(key)}
                        className="text-(--text-tertiary) hover:text-(--status-negative) ml-1 cursor-pointer"
                        title="Gỡ bài báo này"
                        aria-label={`Gỡ bài báo ${art.title}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}

                {!isContextExpanded && remainingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsContextExpanded(true)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-(--bg-surface) px-2 py-0.5 text-[10px] font-medium text-(--action-primary) border border-(--border-default) hover:bg-(--bg-subtle) hover:border-(--border-strong) cursor-pointer transition-colors"
                    title="Xem tất cả bài báo trong ngữ cảnh"
                  >
                    +{remainingCount} bài khác
                    <ChevronDown className="h-3 w-3" />
                  </button>
                )}

                {isContextExpanded && pinnedArticles.length > maxCollapsed && (
                  <button
                    type="button"
                    onClick={() => setIsContextExpanded(false)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-(--bg-surface) px-2 py-0.5 text-[10px] font-medium text-(--text-secondary) border border-(--border-default) hover:bg-(--bg-subtle) hover:text-(--text-primary) cursor-pointer transition-colors"
                    title="Thu gọn danh sách"
                  >
                    Thu gọn
                    <ChevronUp className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-center sm:self-auto">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setContextDrawerOpen(true)}
                  className="h-auto p-0 text-[11px] text-(--action-primary) hover:underline cursor-pointer"
                >
                  Quản lý
                </Button>
                <span className="text-(--border-default) text-xs">•</span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={clearPinnedArticles}
                  className="h-auto p-0 text-[11px] text-(--text-tertiary) hover:text-(--status-negative) cursor-pointer"
                >
                  <Trash2 className="h-3 w-3 mr-0.5" />
                  Xóa hết
                </Button>
              </div>
            </Card>
          );
        })()}

        {/* Input Form */}
        <form
          className="flex items-center gap-2.5 rounded-lg border border-(--border-default) bg-(--bg-canvas) p-2 pl-3.5 transition-all focus-within:border-(--border-strong) focus-within:ring-2 focus-within:ring-(--focus-ring)/20"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          id="chat-form"
        >
          <textarea
            ref={textareaRef}
            id="chat-input"
            className="min-h-6 max-h-36 flex-1 resize-none border-none bg-transparent p-0 text-xs md:text-sm leading-relaxed text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
            rows={1}
            placeholder="Nhập tin nhắn… (Enter để gửi · Shift+Enter xuống dòng)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || loadingHistory}
            aria-label="Nội dung tin nhắn gửi tới trợ lý AI"
          />

          <Button
            type="submit"
            id="send-button"
            variant="default"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            disabled={!input.trim() || loading || loadingHistory}
            aria-label="Gửi tin nhắn"
          >
            {loading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </form>

        <p className="mt-2 text-center text-[11px] text-(--text-tertiary)">
          Google Gemini có thể mắc lỗi. Vui lòng kiểm tra thông tin quan trọng trước khi ra quyết định đầu tư.
        </p>
      </div>
    </div>
  );
}

