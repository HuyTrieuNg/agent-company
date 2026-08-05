"use client";

import { useEffect, useState } from "react";
import {
  fetchForexOverview,
  fetchForexHistory,
  fetchForexNews,
  ForexOverviewResponse,
  ForexHistoryResponse,
  ForexNewsItem,
  ForexItem,
} from "@/lib/forexApi";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";

function formatRate(val: number | undefined | null, code?: string): string {
  if (val == null || isNaN(val)) return "—";
  if (code === "JPY") {
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(val);
  }
  return new Intl.NumberFormat("vi-VN").format(val);
}

export default function ForexPage() {
  const [overview, setOverview] = useState<ForexOverviewResponse | null>(null);
  const [history, setHistory] = useState<ForexHistoryResponse | null>(null);
  const [news, setNews] = useState<ForexNewsItem[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>("USD");
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
          fetchForexOverview(),
          fetchForexNews(),
        ]);
        setOverview(overviewRes);
        setNews(newsRes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi khi kết nối hệ thống tỷ giá");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Load history when selectedPair or timeframe changes
  useEffect(() => {
    async function loadHistory() {
      try {
        setHistoryLoading(true);
        const historyRes = await fetchForexHistory(selectedPair, timeframe);
        setHistory(historyRes);
      } catch (err) {
        console.error("Lỗi tải lịch sử tỷ giá ngoại tệ:", err);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, [selectedPair, timeframe]);

  const activeForexItem: ForexItem | undefined = overview?.items.find(
    (item) => item.code === selectedPair
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0a0a0f] text-slate-100 p-4 md:p-8 space-y-6">
      {/* ── Page Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl shadow-[0_4px_20px_rgba(6,182,212,0.4)]">
            💱
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-200 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Tỷ Giá Ngoại Tệ & Thị Trường Ngoại Hối
            </h1>
            <p className="text-xs text-slate-400">
              Tra cứu tỷ giá niêm yết thương mại: USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY
            </p>
          </div>
        </div>

        {overview?.updated_at && (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
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
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <span>Đang tải thông tin tỷ giá ngoại tệ...</span>
          </div>
        </div>
      ) : (
        <>
          {/* ── Currency Pair Selection Tabs ── */}
          <div className="flex flex-wrap gap-2 border-b border-white/8 pb-2">
            {overview?.items.map((item) => {
              const isSelected = item.code === selectedPair;
              return (
                <button
                  key={item.code}
                  onClick={() => setSelectedPair(item.code)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isSelected
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-[0_4px_15px_rgba(6,182,212,0.35)]"
                      : "border border-white/8 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-slate-100"
                  }`}
                >
                  <span className="font-mono text-xs opacity-75">{item.symbol}</span>
                  <span>{item.code}</span>
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
          {activeForexItem && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-emerald-400 mb-1">Mua Tiền Mặt</p>
                <p className="text-xl md:text-2xl font-bold text-slate-50">
                  {formatRate(activeForexItem.cash_buy, activeForexItem.code)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">VND / {activeForexItem.code}</p>
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-cyan-400 mb-1">Mua Chuyển Khoản</p>
                <p className="text-xl md:text-2xl font-bold text-slate-50">
                  {formatRate(activeForexItem.transfer_buy, activeForexItem.code)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">VND / {activeForexItem.code}</p>
              </div>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-red-400 mb-1">Giá Bán Ra</p>
                <p className="text-xl md:text-2xl font-bold text-slate-50">
                  {formatRate(activeForexItem.sell, activeForexItem.code)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">VND / {activeForexItem.code}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <p className="text-xs font-semibold text-slate-400 mb-1">Biến Động 24H</p>
                <p
                  className={`text-xl md:text-2xl font-bold ${
                    activeForexItem.change_percent >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {activeForexItem.change_percent >= 0 ? "▲ +" : "▼ "}
                  {activeForexItem.change_percent}%
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Chênh lệch: {formatRate(activeForexItem.spread, activeForexItem.code)} đ
                </p>
              </div>
            </div>
          )}

          {/* ── Interactive Historical Exchange Rate Chart ── */}
          <div className="space-y-3">
            {historyLoading ? (
              <div className="h-72 rounded-2xl border border-white/8 bg-white/4 flex items-center justify-center text-slate-500">
                <span>Đang cập nhật biểu đồ tỷ giá...</span>
              </div>
            ) : history?.data && history.data.length > 0 ? (
              <InteractivePriceChart
                data={history.data}
                series={[
                  { key: "buy", label: "Tỷ Giá Mua CK", color: "#06b6d4" },
                  { key: "sell", label: "Tỷ Giá Bán", color: "#ef4444" },
                ]}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                unit="đ"
                title={`Biểu đồ lịch sử tỷ giá ${history.name}`}
                height={300}
              />
            ) : (
              <div className="h-72 rounded-2xl border border-white/8 bg-white/4 flex items-center justify-center text-slate-500">
                Không tìm thấy dữ liệu lịch sử tỷ giá
              </div>
            )}
          </div>

          {/* ── Currency Rate Table ── */}
          <div className="rounded-2xl border border-white/8 bg-white/4 p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200">
              Bảng Tỷ Giá Ngoại Tệ Niêm Yết Ngân Hàng
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-semibold text-slate-400 uppercase">
                    <th className="py-3 px-4">Tên Ngoại Tệ</th>
                    <th className="py-3 px-4 text-center">Mã</th>
                    <th className="py-3 px-4 text-right">Mua Tiền Mặt</th>
                    <th className="py-3 px-4 text-right">Mua Chuyển Khoản</th>
                    <th className="py-3 px-4 text-right">Bán Ra</th>
                    <th className="py-3 px-4 text-right">Spread</th>
                    <th className="py-3 px-4 text-right">Thay Đổi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6 text-slate-200">
                  {overview?.items.map((item) => (
                    <tr
                      key={item.code}
                      onClick={() => setSelectedPair(item.code)}
                      className={`cursor-pointer hover:bg-white/5 transition-colors ${
                        item.code === selectedPair ? "bg-cyan-500/10 font-semibold" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 font-medium">{item.name}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-cyan-300">
                          {item.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-emerald-400 font-medium">
                        {formatRate(item.cash_buy, item.code)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-cyan-400 font-medium">
                        {formatRate(item.transfer_buy, item.code)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-red-400 font-medium">
                        {formatRate(item.sell, item.code)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-400">
                        {formatRate(item.spread, item.code)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-medium ${
                          item.change_percent >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {item.change_percent >= 0 ? "+" : ""}
                        {item.change_percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Forex News ── */}
          <div className="rounded-2xl border border-white/8 bg-white/4 p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span>📰</span>
              <span>Tin Tức Tỷ Giá & Thị Trường Tài Chính Quốc Tế</span>
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
                    className="group rounded-xl border border-white/8 bg-white/4 p-4 space-y-2 hover:border-cyan-500/40 hover:bg-white/6 transition-all duration-200 block"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-cyan-400 flex items-center gap-1">
                        <span>{item.source}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </span>
                      <span>{item.published_at}</span>
                    </div>
                    <h3 className="font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{item.summary}</p>
                    <div className="pt-1 text-[11px] text-cyan-400/80 font-medium group-hover:text-cyan-300 flex items-center gap-1">
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
