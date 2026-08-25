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
} from "lucide-react";
import { toast } from "sonner";

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
      className={`group relative flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 ${
        pinned
          ? "border-violet-500/50 bg-gradient-to-b from-violet-950/20 to-[#0d0d16] shadow-md shadow-violet-500/10"
          : "border-white/8 bg-white/4 hover:border-white/20 hover:bg-white/6"
      }`}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2 text-[11px] mb-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {article.site && (
              <Badge variant="secondary" className="bg-white/8 text-slate-300 font-semibold uppercase text-[10px]">
                {article.site}
              </Badge>
            )}
            <Badge variant="cyan" className="text-[10px]">
              {symbol}
            </Badge>
          </div>

          {article.published_at && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Calendar className="h-3 w-3" />
              {timeAgo(article.published_at)}
            </span>
          )}
        </div>

        <CardTitle className="text-sm font-semibold text-slate-100 group-hover:text-violet-300 transition-colors line-clamp-2 leading-snug">
          {article.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-0 flex-1">
        {article.sapo && article.sapo !== article.title && (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
            {article.sapo}
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-2 border-t border-white/5 flex items-center justify-between gap-2">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <span>Bài gốc</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <div />
        )}

        <Button
          variant={pinned ? "default" : "secondary"}
          size="sm"
          onClick={handleTogglePin}
          className={`gap-1.5 text-xs font-semibold ${
            pinned
              ? "bg-violet-600 text-white shadow-md shadow-violet-500/25"
              : "text-slate-300 hover:bg-violet-600/20 hover:text-violet-300"
          }`}
        >
          {pinned ? (
            <>
              <BookmarkCheck className="h-3.5 w-3.5" />
              <span>Đã ghim</span>
            </>
          ) : (
            <>
              <Bookmark className="h-3.5 w-3.5" />
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-2.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-2">
        <span className="text-4xl">📰</span>
        <p className="text-xs">Không có tin tức liên quan đến mã chứng khoán này</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Tin tức thị trường — Mã {data.symbol}
        </h3>
        <span className="text-xs text-slate-500">{data.count} bài viết</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.data.map((item, i) => (
          <StockNewsCard key={i} item={item} index={i} symbol={data.symbol} />
        ))}
      </div>
    </div>
  );
}
