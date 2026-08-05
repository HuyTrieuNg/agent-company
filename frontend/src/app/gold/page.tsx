"use client";

import { useEffect, useState } from "react";
import {
  fetchGoldOverview,
  fetchGoldHistory,
  fetchGoldNews,
  GoldOverviewResponse,
  GoldHistoryResponse,
  GoldNewsItem,
  GoldItem,
} from "@/lib/goldApi";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";

function formatMoney(val: number | undefined | null, unit?: string): string {
  if (val == null || isNaN(val)) return "—";
  if (unit === "USD/oz" || val < 100000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(val);
  }
  return new Intl.NumberFormat("vi-VN").format(val);
}

export default function GoldPage() {
  const [overview, setOverview] = useState<GoldOverviewResponse | null>(null);
  const [history, setHistory] = useState<GoldHistoryResponse | null>(null);
  const [news, setNews] = useState<GoldNewsItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("SJC");
  const [timeframe, setTimeframe] = useState<string>("1M");
  const [loading, setLoading] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial overview and news
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [overviewRes, newsRes] = await Promise.all([
          fetchGoldOverview(),
          fetchGoldNews(),
        ]);
        setOverview(overviewRes);
        setNews(newsRes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi khi kết nối hệ thống");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Load history when selectedCode or timeframe changes
  useEffect(() => {
    async function loadHistory() {
      try {
        setHistoryLoading(true);
        const historyRes = await fetchGoldHistory(selectedCode, timeframe);
        setHistory(historyRes);
      } catch (err) {
        console.error("Lỗi tải lịch sử giá vàng:", err);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, [selectedCode, timeframe]);

  const activeGoldItem: GoldItem | undefined = overview?.items.find(
    (item) => item.code === selectedCode
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0a0a0f] text-slate-100 p-4 md:p-8 space-y-6">
      {/* ── Page Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 text-2xl shadow-[0_4px_20px_rgba(245,158,11,0.4)]">
            🪙
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
              Bảng Giá Vàng & Thị Trường Kim Loại Quý
            </h1>
            <p className="text-xs text-slate-400">
              Cập nhật trực tuyến SJC, PNJ, DOJI, Vàng 9999 & Vàng Thế Giới (XAU/USD)
            </p>
          </div>
        </div>

        {overview?.updated_at && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span>Cập nhật: {overview.updated_at}</span>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-slate-500">
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            <span>Đang tải thông tin thị trường vàng...</span>
          </div>
        </div>
      ) : (
        <>
          {/* ── Gold Selection Tabs ── */}
          <div className="flex flex-wrap gap-2 border-b border-white/8 pb-2">
            {overview?.items.map((item) => {
              const isSelected = item.code === selectedCode;
              return (
                <button
                  key={item.code}
                  onClick={() => setSelectedCode(item.code)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isSelected
                      ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-[0_4px_15px_rgba(245,158,11,0.35)]"
                      : "border border-white/8 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-slate-100"
                  }`}
                >
                  <span>{item.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md ${
                      item.change_percent >= 0
                        ? isSelected
                          ? "bg-black/20 text-slate-950"
                          : "bg-emerald-500/15 text-emerald-400"
                        : isSelected
                        ? "bg-black/20 text-slate-950"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {item.change_percent >= 0 ? "+" : ""}
                    {item.change_percent}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Key Metrics Cards ── */}
          {activeGoldItem && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-emerald-400 mb-1">Giá Mua Vào</p>
                <p className="text-xl md:text-2xl font-bold text-slate-50">
                  {formatMoney(activeGoldItem.buy_price, activeGoldItem.unit)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{activeGoldItem.unit}</p>
              </div>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-red-400 mb-1">Giá Bán Ra</p>
                <p className="text-xl md:text-2xl font-bold text-slate-50">
                  {formatMoney(activeGoldItem.sell_price, activeGoldItem.unit)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{activeGoldItem.unit}</p>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-amber-400 mb-1">Chênh Lệch (Spread)</p>
                <p className="text-xl md:text-2xl font-bold text-amber-300">
                  {formatMoney(activeGoldItem.spread, activeGoldItem.unit)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Biên độ Mua - Bán</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-slate-400 mb-1">Biến Động 24H</p>
                <p
                  className={`text-xl md:text-2xl font-bold ${
                    activeGoldItem.change_percent >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {activeGoldItem.change_percent >= 0 ? "▲ +" : "▼ "}
                  {activeGoldItem.change_percent}%
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {activeGoldItem.change_amount >= 0 ? "+" : ""}
                  {formatMoney(activeGoldItem.change_amount, activeGoldItem.unit)}
                </p>
              </div>
            </div>
          )}

          {/* ── Interactive Historical Price Chart ── */}
          <div className="space-y-3">
            {historyLoading ? (
              <div className="h-72 rounded-2xl border border-white/8 bg-white/4 flex items-center justify-center text-slate-500">
                <span>Đang cập nhật biểu đồ lịch sử...</span>
              </div>
            ) : history?.data && history.data.length > 0 ? (
              <InteractivePriceChart
                data={history.data}
                series={[
                  { key: "buy", label: "Giá Mua", color: "#10b981" },
                  { key: "sell", label: "Giá Bán", color: "#ef4444" },
                ]}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                unit={history.unit}
                title={`Biểu đồ lịch sử giá ${history.name}`}
                height={300}
              />
            ) : (
              <div className="h-72 rounded-2xl border border-white/8 bg-white/4 flex items-center justify-center text-slate-500">
                Không tìm thấy dữ liệu lịch sử giá
              </div>
            )}
          </div>

          {/* ── Comparison Table ── */}
          <div className="rounded-2xl border border-white/8 bg-white/4 p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200">
              Bảng Tổng Hợp Tỷ Giá Vàng Trong Nước & Quốc Tế
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-semibold text-slate-400 uppercase">
                    <th className="py-3 px-4">Loại Vàng</th>
                    <th className="py-3 px-4 text-right">Giá Mua</th>
                    <th className="py-3 px-4 text-right">Giá Bán</th>
                    <th className="py-3 px-4 text-right">Chênh Lệch</th>
                    <th className="py-3 px-4 text-right">Thay Đổi</th>
                    <th className="py-3 px-4 text-center">Đơn Vị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6 text-slate-200">
                  {overview?.items.map((item) => (
                    <tr
                      key={item.code}
                      onClick={() => setSelectedCode(item.code)}
                      className={`cursor-pointer hover:bg-white/5 transition-colors ${
                        item.code === selectedCode ? "bg-amber-500/10 font-semibold" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 flex items-center gap-2">
                        <span className="text-amber-400">🪙</span>
                        <span>{item.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-emerald-400">
                        {formatMoney(item.buy_price, item.unit)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-red-400">
                        {formatMoney(item.sell_price, item.unit)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-400">
                        {formatMoney(item.spread, item.unit)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-medium ${
                          item.change_percent >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {item.change_percent >= 0 ? "+" : ""}
                        {item.change_percent}%
                      </td>
                      <td className="py-3.5 px-4 text-center text-xs text-slate-500">
                        {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Gold Market News ── */}
          <div className="rounded-2xl border border-white/8 bg-white/4 p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span>📰</span>
              <span>Tin Tức & Phân Tích Thị Trường Kim Loại Quý</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {news.map((item) => {
                const linkUrl = item.url && item.url !== "#"
                  ? item.url
                  : `https://www.google.com/search?q=${encodeURIComponent(item.title)}`;
                return (
                  <a
                    key={item.id}
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-xl border border-white/8 bg-white/4 p-4 space-y-2 hover:border-amber-500/40 hover:bg-white/6 transition-all duration-200 block"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-amber-400 flex items-center gap-1">
                        <span>{item.source}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </span>
                      <span>{item.published_at}</span>
                    </div>
                    <h3 className="font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{item.summary}</p>
                    <div className="pt-1 text-[11px] text-amber-400/80 font-medium group-hover:text-amber-300 flex items-center gap-1">
                      <span>Đọc bài viết trên Google</span>
                      <span>↗</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
