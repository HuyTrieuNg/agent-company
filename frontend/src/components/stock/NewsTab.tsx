"use client";

import { NewsResponse, StockNewsItem } from "@/lib/stockApi";
import { useContextStore } from "@/stores/contextStore";
import { NewsArticleItem } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Calendar,
  Newspaper,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return "Hôm nay";
    if (days === 1) return "Hôm qua";
    if (days < 7) return `${days} ngày trước`;
    if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
    return d.toLocaleDateString("vi-VN");
  } catch {
    return dateStr;
  }
}

function convertToNewsArticle(item: StockNewsItem, defaultSite = "Chứng khoán"): NewsArticleItem {
  return {
    title: String(item.title || item.news_title || item.headline || "").trim() || "Tin tức",
    url: String(item.url || item.news_url || item.link || "").trim(),
    site: String(item.source || item.news_source || defaultSite).trim(),
    published_at: String(item.published_date || item.publish_date || item.date || "").trim(),
    sapo: String(item.summary || item.content || item.description || "").trim(),
  };
}

function StockNewsCard({
  item,
  index,
  symbol,
}: {
  item: StockNewsItem;
  index: number;
  symbol: string;
}) {
  const { isPinned, togglePinArticle } = useContextStore();

  const article = convertToNewsArticle(item, `Stock ${symbol}`);
  const pinned = isPinned(article);

  const handleTogglePin = () => {
    const added = togglePinArticle(article);
    if (added) {
      toast.success(`Đã ghim tin tức mã ${symbol} vào Context`, {
        description: article.title,
      });
    } else {
      toast.info("Đã bỏ ghim khỏi Context", {
        description: article.title,
      });
    }
  };

  return (
    <Card
      id={`stock-news-${index}`}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border transition-colors duration-150",
        pinned
          ? "border-(--action-primary) bg-(--bg-selected)/25"
          : "border-(--border-default) bg-(--bg-surface) hover:border-(--border-strong)"
      )}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2 text-[11px] mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {article.site && (
              <Badge variant="secondary" className="text-[10px] font-semibold uppercase">
                {article.site}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] font-mono">
              {symbol}
            </Badge>
          </div>

          {article.published_at && (
            <span className="flex items-center gap-1 text-[11px] text-(--text-tertiary)">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {timeAgo(article.published_at)}
            </span>
          )}
        </div>

        <CardTitle className="text-sm font-semibold text-(--text-primary) group-hover:text-(--action-primary) transition-colors line-clamp-2 leading-snug">
          {article.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-0 flex-1">
        {article.sapo && article.sapo !== article.title && (
          <p className="text-xs text-(--text-secondary) leading-relaxed line-clamp-3">
            {article.sapo}
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-2.5 border-t border-(--border-default) flex items-center justify-between gap-2">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-(--action-primary) hover:underline"
          >
            <span>Xem nguồn</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : (
          <div />
        )}

        <Button
          variant={pinned ? "default" : "secondary"}
          size="sm"
          onClick={handleTogglePin}
          className="gap-1.5 text-xs font-medium"
        >
          {pinned ? (
            <>
              <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Đã ghim</span>
            </>
          ) : (
            <>
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              <span>+ Ghim Context</span>
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function NewsTab({
  data,
  loading,
}: {
  data: NewsResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-(--border-default) bg-(--bg-surface) p-4 space-y-2.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
            <Skeleton className="h-5 w-full rounded" />
            <Skeleton className="h-10 w-full rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 border border-(--border-default) bg-(--bg-surface) text-(--text-tertiary) space-y-2 rounded-xl">
        <Newspaper className="h-8 w-8 text-(--text-tertiary)" aria-hidden="true" />
        <p className="text-xs">Không có tin tức liên quan đến mã chứng khoán này</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
          Tin tức thị trường — Mã {data.symbol}
        </h3>
        <Badge variant="secondary" className="text-xs text-(--text-secondary)">
          {data.count} bài viết
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.data.map((item, i) => (
          <StockNewsCard key={i} item={item} index={i} symbol={data.symbol} />
        ))}
      </div>
    </div>
  );
}
