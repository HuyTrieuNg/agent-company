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
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-2xl bg-[#0c0c14] border-white/10 p-0 text-slate-100">
        {/* Header */}
        <div className="border-b border-white/10 p-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="default" className="bg-violet-600/20 text-violet-300 border-violet-500/30 uppercase tracking-wider">
              {article.site || "Tin tức"}
            </Badge>
            {article.category && (
              <Badge variant="secondary" className="text-slate-400">
                {article.category}
              </Badge>
            )}
            {article.published_at && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
                <Calendar className="h-3 w-3" />
                {article.published_at}
              </span>
            )}
          </div>

          <SheetTitle className="text-lg font-bold leading-snug text-slate-50">
            {article.title}
          </SheetTitle>

          {article.author && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span>Tác giả: {article.author}</span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading && !fullContent ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500" />
              <p className="text-xs">Đang tải toàn bộ nội dung từ Vector DB...</p>
            </div>
          ) : (
            <div className="space-y-4 text-xs md:text-sm text-slate-300 leading-relaxed">
              {article.sapo && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-3.5 font-medium text-slate-200 leading-relaxed italic">
                  {article.sapo}
                </div>
              )}

              <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-line">
                {fullContent ? (
                  <Markdown content={fullContent} />
                ) : (
                  <p>{article.sapo || "Không có nội dung chi tiết."}</p>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="border-t border-white/10 bg-[#08080e] p-4 px-6 flex flex-wrap items-center justify-between gap-3">
          {article.url ? (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Bài gốc</span>
            </a>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant={pinned ? "destructive" : "default"}
              size="sm"
              onClick={handleTogglePin}
              className="gap-1.5"
            >
              {pinned ? (
                <>
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Bỏ ghim Context</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>+ Ghim vào Context</span>
                </>
              )}
            </Button>

            <Button
              variant="gradient"
              size="sm"
              onClick={handleChatAboutThis}
              className="gap-1.5"
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
