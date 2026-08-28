"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUiStore } from "@/stores/uiStore";
import { useContextStore } from "@/stores/contextStore";
import { useFullArticle } from "@/hooks/useNews";
import { FullArticleItem, NewsArticleItem } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Markdown from "@/components/Markdown";
import { Bookmark, BookmarkCheck, ExternalLink, MessageSquare, User, Calendar } from "lucide-react";

export default function ArticleDetailSheet() {
  const router = useRouter();
  const { isArticleSheetOpen, closeArticleSheet, selectedArticleForSheet } = useUiStore();
  const { isPinned, togglePinArticle } = useContextStore();

  const urlHash = selectedArticleForSheet?.url_hash;
  const { data: fullArticle, isLoading } = useFullArticle(urlHash);

  if (!selectedArticleForSheet) return null;

  const article: NewsArticleItem = (fullArticle as FullArticleItem) || selectedArticleForSheet;
  const fullContent: string = (fullArticle as FullArticleItem)?.content || (selectedArticleForSheet as FullArticleItem)?.content || "";
  const pinned = isPinned(article);

  const handleTogglePin = () => {
    const added = togglePinArticle(article);
    if (added) {
      toast.success("Đã ghim bài báo vào Context Chatbot", {
        description: article.title,
      });
    } else {
      toast.info("Đã bỏ ghim bài báo khỏi Context", {
        description: article.title,
      });
    }
  };

  const handleChatAboutThis = () => {
    if (!pinned) {
      togglePinArticle(article);
    }
    closeArticleSheet();
    router.push("/");
  };

  return (
    <Sheet open={isArticleSheetOpen} onOpenChange={(open) => !open && closeArticleSheet()}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-2xl bg-(--bg-surface) border-(--border-default) p-0 text-(--text-primary)">
        {/* Header */}
        <div className="border-b border-(--border-default) p-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" className="bg-(--bg-subtle) text-(--text-primary) uppercase tracking-wider font-semibold">
              {article.site || "Tin tức"}
            </Badge>
            {article.category && (
              <Badge variant="secondary" className="text-(--text-secondary) bg-(--bg-subtle)">
                {article.category}
              </Badge>
            )}
            {article.published_at && (
              <span className="flex items-center gap-1 text-[11px] text-(--text-tertiary) ml-auto">
                <Calendar className="h-3 w-3" />
                {article.published_at}
              </span>
            )}
          </div>

          <SheetTitle className="text-lg font-bold leading-snug text-(--text-primary)">
            {article.title}
          </SheetTitle>

          {article.author && (
            <div className="flex items-center gap-1.5 text-xs text-(--text-tertiary) mt-2">
              <User className="h-3.5 w-3.5" />
              <span>Tác giả: {article.author}</span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading && !fullContent ? (
            <div className="flex flex-col items-center justify-center py-20 text-(--text-tertiary) gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-(--border-default) border-t-(--action-primary)" />
              <p className="text-xs">Đang tải toàn bộ nội dung từ Vector DB...</p>
            </div>
          ) : (
            <div className="space-y-4 text-xs md:text-sm text-(--text-primary) leading-relaxed">
              {article.sapo && (
                <div className="rounded-lg border border-(--border-default) bg-(--bg-subtle) p-3.5 font-medium text-(--text-secondary) leading-relaxed italic">
                  {article.sapo}
                </div>
              )}

              <div className="max-w-none text-(--text-primary) leading-relaxed whitespace-pre-line">
                {fullContent ? (
                  <Markdown content={fullContent} />
                ) : (
                  <p className="text-(--text-secondary)">{article.sapo || "Không có nội dung chi tiết."}</p>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="border-t border-(--border-default) bg-(--bg-subtle) p-4 px-6 flex flex-wrap items-center justify-between gap-3">
          {article.url ? (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--action-primary) transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Mở bài gốc</span>
            </a>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant={pinned ? "destructive" : "outline"}
              size="sm"
              onClick={handleTogglePin}
              className="gap-1.5 text-xs"
            >
              {pinned ? (
                <>
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Bỏ ghim Context</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>+ Thêm vào ngữ cảnh AI</span>
                </>
              )}
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleChatAboutThis}
              className="gap-1.5 text-xs font-semibold"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Hỏi Chatbot</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
