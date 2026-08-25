"use client";

import { useState } from "react";
import { useGoldOverview, useGoldHistory, useGoldNews } from "@/hooks/useGold";
import { GoldItem, GoldNewsItem } from "@/lib/goldApi";
import { NewsArticleItem } from "@/lib/api";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";
import MarketPage, {
  ChangeBadge,
  type MarketColumn,
  type MarketMetric,
  type MarketTheme,
} from "@/components/common/MarketPage";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins } from "lucide-react";

const THEME: MarketTheme = {
  iconGradient: "bg-linear-to-br from-amber-400 to-yellow-600 text-slate-950 shadow-amber-500/25",
  titleGradient: "from-amber-200 via-amber-400 to-yellow-400",
  liveBadgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  liveDotClass: "bg-amber-400",
  activePillClass: "bg-linear-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/25",
  selectedRowClass: "bg-amber-500/10",
  newsHeadingIconClass: "text-amber-400",
  newsSourceBadgeClass: "bg-amber-500/15 text-amber-300",
  newsTitleHoverClass: "group-hover:text-amber-300",
  sourceLinkClass: "text-amber-400 hover:text-amber-300",
  pinBtnActiveClass: "bg-amber-600 text-white shadow-md shadow-amber-500/25 hover:bg-amber-700",
  pinBtnHoverClass: "hover:bg-amber-600/20 hover:text-amber-300",
  pinnedCardClass: "border-amber-500/50 bg-linear-to-b from-amber-950/20 to-[#0d0d16] shadow-md shadow-amber-500/10",
};

function formatMoney(val: number | undefined | null, unit?: string): string {
  if (val == null || isNaN(val)) return "—";
  if (unit === "USD/oz" || val < 100000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(val);
  }
  return new Intl.NumberFormat("vi-VN").format(val);
}

function convertNewsToArticle(item: GoldNewsItem): NewsArticleItem {
  return {
    title: item.title,
    url:
      item.url && item.url !== "#"
        ? item.url
        : `https://www.google.com/search?q=${encodeURIComponent(item.title)}`,
    site: item.source || "Thị trường Vàng",
    published_at: item.published_at,
    sapo: item.summary,
  };
}

function buildMetrics(item: GoldItem): MarketMetric[] {
  const up = item.change_percent >= 0;
  return [
    {
      key: "buy",
      label: "Giá Mua Vào",
      value: formatMoney(item.buy_price, item.unit),
      sub: item.unit,
      tooltip: "Giá doanh nghiệp mua vào từ khách hàng",
      tone: "emerald",
    },
    {
      key: "sell",
      label: "Giá Bán Ra",
      value: formatMoney(item.sell_price, item.unit),
      sub: item.unit,
      tooltip: "Giá doanh nghiệp bán ra cho khách hàng",
      tone: "red",
    },
    {
      key: "spread",
      label: "Chênh Lệch (Spread)",
      value: formatMoney(item.spread, item.unit),
      sub: "Biên độ Mua - Bán",
      tooltip: "Biên độ chênh lệch giữa giá Bán ra và Mua vào",
      tone: "amber",
      valueClass: "text-amber-300",
    },
    {
      key: "change",
      label: "Biến Động 24H",
      value: `${up ? "+" : ""}${item.change_percent}%`,
      sub: `${item.change_amount >= 0 ? "+" : ""}${formatMoney(item.change_amount, item.unit)}`,
      tone: "neutral",
      trend: up ? "up" : "down",
      valueClass: up ? "text-emerald-400" : "text-red-400",
    },
  ];
}

const COLUMNS: MarketColumn<GoldItem>[] = [
  {
    key: "name",
    header: "Loại Vàng",
    align: "left",
    render: (item) => (
      <span className="flex items-center gap-2">
        <Coins className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
        <span className="font-semibold text-slate-50">{item.name}</span>
      </span>
    ),
  },
  {
    key: "buy",
    header: "Giá Mua",
    align: "right",
    render: (item) => (
      <span className="font-semibold text-emerald-400">
        {formatMoney(item.buy_price, item.unit)}
      </span>
    ),
  },
  {
    key: "sell",
    header: "Giá Bán",
    align: "right",
    render: (item) => (
      <span className="font-semibold text-red-400">
        {formatMoney(item.sell_price, item.unit)}
      </span>
    ),
  },
  {
    key: "spread",
    header: "Chênh Lệch",
    align: "right",
    className: "hidden md:table-cell",
    render: (item) => (
      <span className="text-slate-400">{formatMoney(item.spread, item.unit)}</span>
    ),
  },
  {
    key: "change",
    header: "Thay Đổi",
    align: "right",
    render: (item) => <ChangeBadge percent={item.change_percent} />,
  },
  {
    key: "unit",
    header: "Đơn Vị",
    align: "center",
    className: "hidden lg:table-cell",
    render: (item) => <span className="text-[11px] text-slate-500">{item.unit}</span>,
  },
];

export default function GoldPage() {
  const [selectedCode, setSelectedCode] = useState<string>("SJC");
  const [timeframe, setTimeframe] = useState<string>("1M");

  const { data: overview, isLoading: loadingOverview, error: overviewError } = useGoldOverview();
  const { data: history, isLoading: historyLoading } = useGoldHistory(selectedCode, timeframe);
  const { data: news = [] } = useGoldNews();

  const activeGoldItem: GoldItem | undefined = overview?.items.find(
    (item) => item.code === selectedCode
  );

  return (
    <MarketPage<GoldItem>
      theme={THEME}
      icon={Coins}
      title="Bảng Giá Vàng & Kim Loại Quý"
      subtitle="Cập nhật trực tuyến SJC, PNJ, DOJI, Vàng 9999 & Vàng Thế Giới (XAU/USD)"
      loading={loadingOverview}
      error={overviewError}
      errorLabel="Lỗi khi kết nối hệ thống giá vàng"
      updatedAt={overview?.updated_at}
      items={overview?.items ?? []}
      getItemCode={(item) => item.code}
      selectedCode={selectedCode}
      onSelectCode={setSelectedCode}
      renderPill={(item, selected) => (
        <>
          <span>{item.name}</span>
          <ChangeBadge percent={item.change_percent} selected={selected} />
        </>
      )}
      metrics={activeGoldItem ? buildMetrics(activeGoldItem) : []}
      range={
        activeGoldItem
          ? {
              low: activeGoldItem.low_24h,
              high: activeGoldItem.high_24h,
              current: activeGoldItem.sell_price,
              format: (n) => formatMoney(n, activeGoldItem.unit),
            }
          : null
      }
      chartSlot={
        historyLoading ? (
          <Skeleton className="h-72 rounded-2xl bg-white/4" />
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
          <Card className="flex h-72 items-center justify-center rounded-2xl border-white/8 bg-[#0c0c14] text-xs text-slate-500">
            Không tìm thấy dữ liệu lịch sử giá
          </Card>
        )
      }
      tableTitle="Bảng Tổng Hợp Tỷ Giá Vàng Trong Nước & Quốc Tế"
      tableCountLabel="thương hiệu"
      columns={COLUMNS}
      newsTitle="Tin Tức & Phân Tích Thị Trường Kim Loại Quý"
      news={news}
      toArticle={convertNewsToArticle}
      pinToastLabels={{
        added: "Đã ghim tin tức giá vàng vào Context",
        removed: "Đã bỏ ghim khỏi Context",
      }}
    />
  );
}
