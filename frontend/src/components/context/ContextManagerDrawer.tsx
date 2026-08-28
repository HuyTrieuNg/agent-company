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
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-(--border-default) bg-(--bg-surface) p-2.5 px-4 shadow-(--shadow-overlay)">
            {/* Left info & list preview */}
            <div
              className="flex flex-1 items-center gap-3 overflow-hidden cursor-pointer"
              onClick={() => setContextDrawerOpen(true)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
                <Bookmark className="h-4 w-4" />
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-(--text-primary)">
                    Ngữ cảnh ({activeCount}/{total} bài kích hoạt)
                  </span>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-(--bg-subtle) text-(--text-secondary)">
                    Quản lý
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 overflow-hidden text-[11px] text-(--text-tertiary)">
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
                variant="default"
                size="sm"
                onClick={handleStartChat}
                className="gap-1.5 text-xs font-semibold"
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
        <DialogContent className="max-w-2xl bg-(--bg-surface) border-(--border-default) p-0 text-(--text-primary)">
          <DialogHeader className="border-b border-(--border-default) p-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold text-(--text-primary) flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-(--action-primary)" />
                  Quản lý Ngữ Cảnh (Chat Context)
                </DialogTitle>
                <DialogDescription className="text-xs text-(--text-secondary) mt-1">
                  Chọn các bài báo muốn truyền làm context để Gemini phân tích và trả lời chính xác nhất.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Controls bar */}
          <div className="flex items-center justify-between border-b border-(--border-default) bg-(--bg-subtle) px-5 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Button
                variant="link"
                size="sm"
                onClick={() => setAllArticlesActive(true)}
                className="h-auto p-0 text-(--action-primary) hover:underline font-medium text-xs"
              >
                Chọn tất cả ({total})
              </Button>
              <span className="text-(--border-strong)">•</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => setAllArticlesActive(false)}
                className="h-auto p-0 text-(--text-tertiary) hover:text-(--text-primary) text-xs"
              >
                Bỏ chọn tất cả
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-auto p-1 text-(--status-negative) hover:bg-[color-mix(in_srgb,var(--status-negative)_12%,transparent)] text-xs gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa toàn bộ</span>
            </Button>
          </div>

          {/* List items */}
          <ScrollArea className="max-h-[50vh] p-5">
            {total === 0 ? (
              <div className="py-12 text-center text-(--text-tertiary) text-xs">
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
                      className={`flex items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                        isActive
                          ? "border-(--border-strong) bg-(--bg-selected)"
                          : "border-(--border-default) bg-(--bg-subtle) opacity-70"
                      }`}
                    >
                      {/* Checkbox toggle active */}
                      <button
                        onClick={() => toggleArticleActive(key)}
                        className="mt-0.5 text-(--action-primary) hover:opacity-80 cursor-pointer"
                        title={isActive ? "Tắt khỏi prompt" : "Bật đưa vào prompt"}
                      >
                        {isActive ? (
                          <CheckSquare className="h-4 w-4 text-(--action-primary)" />
                        ) : (
                          <Square className="h-4 w-4 text-(--text-tertiary)" />
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px] font-semibold uppercase">
                            {art.site || "Tin tức"}
                          </Badge>
                          {art.published_at && (
                            <span className="text-[10px] text-(--text-tertiary)">{art.published_at}</span>
                          )}
                        </div>

                        <h4 className="text-xs font-semibold leading-tight line-clamp-2 text-(--text-primary)">
                          {art.title}
                        </h4>

                        {art.sapo && (
                          <p className="text-[11px] text-(--text-secondary) line-clamp-2 mt-1 leading-relaxed">
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
                          className="h-7 w-7 text-(--text-secondary) hover:text-(--text-primary)"
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
                          className="h-7 w-7 text-(--text-secondary) hover:text-(--status-negative)"
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
          <div className="border-t border-(--border-default) bg-(--bg-subtle) p-4 px-5 flex items-center justify-between">
            <span className="text-xs text-(--text-secondary)">
              Đang chọn: <strong className="text-(--text-primary)">{activeCount}</strong>/{total} bài
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
                variant="default"
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
