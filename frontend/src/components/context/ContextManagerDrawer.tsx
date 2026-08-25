"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useContextStore } from "@/stores/contextStore";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bookmark,
  CheckSquare,
  Square,
  Trash2,
  ArrowRight,
  Eye,
  X,
  Sparkles,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export default function ContextManagerDrawer() {
  const router = useRouter();
  const {
    pinnedArticles,
    removePinnedArticle,
    clearPinnedArticles,
    toggleArticleActive,
    setAllArticlesActive,
  } = useContextStore();
  const {
    isContextDrawerOpen,
    setContextDrawerOpen,
    openArticleSheet,
  } = useUiStore();

  const total = pinnedArticles.length;
  const activeCount = pinnedArticles.filter((a) => a.isActiveInPrompt !== false).length;

  const handleStartChat = () => {
    setContextDrawerOpen(false);
    router.push("/");
  };

  const handleClearAll = () => {
    clearPinnedArticles();
    toast.info("Đã làm trống danh sách bài báo trong Context");
    setContextDrawerOpen(false);
  };

  return (
    <>
      {/* Floating Trigger Dock Bar */}
      {total > 0 && (
        <aside
          aria-label="Thanh quản lý Context bài báo"
          className="fixed bottom-4 left-20 right-4 md:left-72 md:right-10 z-40 animate-fade-up"
        >
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-[#0f0e1a]/95 p-2.5 px-4 shadow-[0_8px_32px_rgba(139,92,246,0.25)] backdrop-blur-xl">
            {/* Left info & list preview */}
            <div
              className="flex flex-1 items-center gap-3 overflow-hidden cursor-pointer"
              onClick={() => setContextDrawerOpen(true)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-indigo-600 text-white font-bold text-xs shadow-md shadow-violet-500/30">
                <Bookmark className="h-4 w-4" />
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-50">
                    Context Chatbot ({activeCount}/{total} bài kích hoạt)
                  </span>
                  <Badge variant="default" className="bg-violet-600/20 text-violet-300 text-[10px] py-0 px-1.5">
                    Click để quản lý
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 overflow-hidden text-[11px] text-slate-400">
                  {pinnedArticles.slice(0, 2).map((a) => (
                    <span key={a.url_hash || a.url} className="truncate max-w-35 md:max-w-50">
                      • {a.title}
                    </span>
                  ))}
                  {total > 2 && <span>+{total - 2} bài khác</span>}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setContextDrawerOpen(true)}
                className="hidden sm:inline-flex text-xs"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Chi tiết</span>
              </Button>

              <Button
                variant="gradient"
                size="sm"
                onClick={handleStartChat}
                className="gap-1.5 text-xs font-bold shadow-md shadow-violet-500/30"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Chat ngay</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </aside>
      )}

      {/* Full Modal Management Dialog */}
      <Dialog open={isContextDrawerOpen} onOpenChange={setContextDrawerOpen}>
        <DialogContent className="max-w-2xl bg-[#0c0c14] border-white/10 p-0 text-slate-100">
          <DialogHeader className="border-b border-white/10 p-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold text-slate-50 flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-violet-400" />
                  Quản lý Ngữ Cảnh (Chat Context)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-1">
                  Chọn các bài báo muốn truyền làm context để Gemini phân tích và trả lời chính xác nhất.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Controls bar */}
          <div className="flex items-center justify-between border-b border-white/5 bg-white/2 px-5 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Button
                variant="link"
                size="sm"
                onClick={() => setAllArticlesActive(true)}
                className="h-auto p-0 text-violet-400 hover:underline font-medium text-xs"
              >
                Chọn tất cả ({total})
              </Button>
              <span className="text-slate-600">•</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => setAllArticlesActive(false)}
                className="h-auto p-0 text-slate-400 hover:text-white text-xs"
              >
                Bỏ chọn tất cả
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-auto p-1 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa toàn bộ</span>
            </Button>
          </div>

          {/* List items */}
          <ScrollArea className="max-h-[50vh] p-5">
            {total === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Chưa có bài báo nào được ghim vào Context.
              </div>
            ) : (
              <div className="space-y-2.5">
                {pinnedArticles.map((art) => {
                  const key = art.url_hash || art.url || "";
                  const isActive = art.isActiveInPrompt !== false;
                  return (
                    <div
                      key={key}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all ${isActive
                          ? "border-violet-500/40 bg-violet-950/15 text-slate-100"
                          : "border-white/5 bg-white/2 opacity-60 text-slate-400"
                        }`}
                    >
                      {/* Checkbox toggle active */}
                      <button
                        onClick={() => toggleArticleActive(key)}
                        className="mt-0.5 text-violet-400 hover:text-violet-300 cursor-pointer"
                        title={isActive ? "Tắt khỏi prompt" : "Bật đưa vào prompt"}
                      >
                        {isActive ? (
                          <CheckSquare className="h-4 w-4 text-violet-400" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-500" />
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px] font-semibold uppercase">
                            {art.site || "Tin tức"}
                          </Badge>
                          {art.published_at && (
                            <span className="text-[10px] text-slate-500">{art.published_at}</span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold leading-tight line-clamp-2 text-slate-200">
                          {art.title}
                        </h4>

                        {art.sapo && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {art.sapo}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            openArticleSheet(art);
                          }}
                          className="h-7 w-7 text-slate-400 hover:bg-white/10 hover:text-white"
                          title="Xem toàn văn bài báo"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            removePinnedArticle(key);
                            toast.info("Đã xóa bài báo khỏi context");
                          }}
                          className="h-7 w-7 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                          title="Bỏ ghim bài này"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-white/10 bg-[#08080e] p-4 px-5 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Đang chọn: <strong className="text-slate-50">{activeCount}</strong>/{total} bài
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setContextDrawerOpen(false)}
              >
                Đóng
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={handleStartChat}
                className="gap-1.5"
              >
                <span>Bắt đầu Chat</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
