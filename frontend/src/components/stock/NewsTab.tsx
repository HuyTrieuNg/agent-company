"use client";

import { NewsResponse, StockNewsItem } from "@/lib/stockApi";

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

function NewsCard({ item, index }: { item: StockNewsItem; index: number }) {
  const title =
    String(item.title || item.news_title || item.headline || "").trim() || "—";
  const source =
    String(item.source || item.news_source || "").trim();
  const url = String(item.url || item.news_url || item.link || "").trim();
  const date =
    String(item.published_date || item.publish_date || item.date || "").trim();
  const summary = String(item.summary || item.content || item.description || "").trim();

  return (
    <div
      id={`news-${index}`}
      className="group relative flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/4 p-4 transition-all duration-200 hover:border-[#8b5cf6]/30 hover:bg-white/6 hover:shadow-[0_0_20px_rgba(139,92,246,0.08)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 flex-1">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-slate-100 leading-tight line-clamp-2 hover:text-[#a78bfa] transition-colors"
            >
              {title}
            </a>
          ) : (
            <span className="text-sm font-semibold text-slate-100 leading-tight line-clamp-2">
              {title}
            </span>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {source && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                {source}
              </span>
            )}
            {date && (
              <span className="text-[10px] text-slate-600">{timeAgo(date)}</span>
            )}
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 text-slate-500 transition-all duration-150 hover:border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/10 hover:text-[#a78bfa]"
            title="Mở bài viết"
          >
            ↗
          </a>
        )}
      </div>

      {/* Summary */}
      {summary && summary !== title && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{summary}</p>
      )}

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/8" />
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-4xl mb-3">📰</span>
        <p>Không có tin tức</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">
          Tin tức — {data.symbol}
        </h3>
        <span className="text-xs text-slate-600">{data.count} bài viết</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.data.map((item, i) => (
          <NewsCard key={i} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}
