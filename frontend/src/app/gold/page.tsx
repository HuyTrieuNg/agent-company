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
} from "@/components/common/MarketPage";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins } from "lucide-react";

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
    },
    {
      key: "sell",
      label: "Giá Bán Ra",
      value: formatMoney(item.sell_price, item.unit),
      sub: item.unit,
      tooltip: "Giá doanh nghiệp bán ra cho khách hàng",
    },
    {
      key: "spread",
      label: "Chênh Lệch (Spread)",
      value: formatMoney(item.spread, item.unit),
      sub: "Biên độ Mua - Bán",
      tooltip: "Biên độ chênh lệch giữa giá Bán ra và Mua vào",
    },
    {
      key: "change",
      label: "Biến Động 24H",
      value: `${up ? "+" : ""}${item.change_percent}%`,
      sub: `${item.change_amount >= 0 ? "+" : ""}${formatMoney(item.change_amount, item.unit)}`,
      trend: up ? "up" : "down",
      valueClass: up ? "text-(--status-positive)" : "text-(--status-negative)",
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
        <Coins className="h-3.5 w-3.5 shrink-0 text-(--action-primary)" aria-hidden="true" />
        <span className="font-medium text-(--text-primary)">{item.name}</span>
      </span>
    ),
  },
  {
    key: "buy",
    header: "Giá Mua",
    align: "right",
    render: (item) => (
      <span className="font-medium tabular-nums text-(--text-primary)">
        {formatMoney(item.buy_price, item.unit)}
      </span>
    ),
  },
  {
    key: "sell",
    header: "Giá Bán",
    align: "right",
    render: (item) => (
      <span className="font-medium tabular-nums text-(--text-primary)">
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
      <span className="tabular-nums text-(--text-secondary)">
        {formatMoney(item.spread, item.unit)}
      </span>
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
    render: (item) => (
      <span className="text-xs text-(--text-tertiary)">{item.unit}</span>
    ),
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
          <Skeleton className="h-72 rounded-xl" />
        ) : history?.data && history.data.length > 0 ? (
          <InteractivePriceChart
            data={history.data}
            series={[
              { key: "buy", label: "Giá Mua", semanticColor: "positive" },
              { key: "sell", label: "Giá Bán", semanticColor: "negative" },
            ]}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            unit={history.unit}
            title={`Biểu đồ lịch sử giá ${history.name}`}
            height={300}
          />
        ) : (
          <Card className="flex h-72 items-center justify-center rounded-xl border border-(--border-default) bg-(--bg-surface) text-xs text-(--text-tertiary)">
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
