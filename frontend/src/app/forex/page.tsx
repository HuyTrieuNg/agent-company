"use client";

import { useState } from "react";
import { useForexOverview, useForexHistory, useForexNews } from "@/hooks/useForex";
import { ForexItem, ForexNewsItem } from "@/lib/forexApi";
import { NewsArticleItem } from "@/lib/api";
import InteractivePriceChart from "@/components/common/InteractivePriceChart";
import MarketPage, {
  ChangeBadge,
  type MarketColumn,
  type MarketMetric,
  type MarketTheme,
} from "@/components/common/MarketPage";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign } from "lucide-react";

const THEME: MarketTheme = {
  iconGradient: "bg-linear-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/25",
  titleGradient: "from-cyan-200 via-cyan-400 to-blue-400",
  liveBadgeClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  liveDotClass: "bg-cyan-400",
  activePillClass: "bg-linear-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/25",
  selectedRowClass: "bg-cyan-500/10",
  newsHeadingIconClass: "text-cyan-400",
  newsSourceBadgeClass: "bg-cyan-500/15 text-cyan-300",
  newsTitleHoverClass: "group-hover:text-cyan-300",
  sourceLinkClass: "text-cyan-400 hover:text-cyan-300",
  pinBtnActiveClass: "bg-cyan-600 text-white shadow-md shadow-cyan-500/25 hover:bg-cyan-700",
  pinBtnHoverClass: "hover:bg-cyan-600/20 hover:text-cyan-300",
  pinnedCardClass: "border-cyan-500/50 bg-linear-to-b from-cyan-950/20 to-[#0d0d16] shadow-md shadow-cyan-500/10",
};

function formatRate(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("vi-VN").format(val);
}

function convertNewsToArticle(item: ForexNewsItem): NewsArticleItem {
  return {
    title: item.title,
    url:
      item.url && item.url !== "#"
        ? item.url
        : `https://www.google.com/search?q=${encodeURIComponent(item.title)}`,
    site: item.source || "Tỷ giá Ngoại tệ",
    published_at: item.published_at,
    sapo: item.summary,
  };
}

function buildMetrics(item: ForexItem): MarketMetric[] {
  const up = item.change_percent >= 0;
  return [
    {
      key: "cash_buy",
      label: "Mua Tiền Mặt",
      value: formatRate(item.cash_buy),
      sub: `VND / ${item.code}`,
      tooltip: "Tỷ giá ngân hàng mua vào bằng tiền mặt trực tiếp",
      tone: "emerald",
    },
    {
      key: "transfer_buy",
      label: "Mua Chuyển Khoản",
      value: formatRate(item.transfer_buy),
      sub: `VND / ${item.code}`,
      tooltip: "Tỷ giá mua vào áp dụng giao dịch chuyển khoản",
      tone: "cyan",
    },
    {
      key: "sell",
      label: "Giá Bán Ra",
      value: formatRate(item.sell),
      sub: `VND / ${item.code}`,
      tooltip: "Tỷ giá ngân hàng bán ra cho khách hàng",
      tone: "red",
    },
    {
      key: "change",
      label: "Biến Động 24H",
      value: `${up ? "+" : ""}${item.change_percent}%`,
      sub: `Chênh lệch: ${formatRate(item.spread)} đ`,
      tone: "neutral",
      trend: up ? "up" : "down",
      valueClass: up ? "text-emerald-400" : "text-red-400",
    },
  ];
}

const COLUMNS: MarketColumn<ForexItem>[] = [
  {
    key: "name",
    header: "Tên Ngoại Tệ",
    align: "left",
    render: (item) => <span className="font-medium text-slate-50">{item.name}</span>,
  },
  {
    key: "code",
    header: "Mã",
    align: "center",
    render: (item) => (
      <Badge variant="cyan" className="font-mono text-[10px]">
        {item.code}
      </Badge>
    ),
  },
  {
    key: "cash_buy",
    header: "Mua Tiền Mặt",
    align: "right",
    render: (item) => (
      <span className="font-semibold text-emerald-400">{formatRate(item.cash_buy)}</span>
    ),
  },
  {
    key: "transfer_buy",
    header: "Mua Chuyển Khoản",
    align: "right",
    className: "hidden sm:table-cell",
    render: (item) => (
      <span className="font-semibold text-cyan-400">{formatRate(item.transfer_buy)}</span>
    ),
  },
  {
    key: "sell",
    header: "Bán Ra",
    align: "right",
    render: (item) => (
      <span className="font-semibold text-red-400">{formatRate(item.sell)}</span>
    ),
  },
  {
    key: "spread",
    header: "Spread",
    align: "right",
    className: "hidden lg:table-cell",
    render: (item) => <span className="text-slate-400">{formatRate(item.spread)}</span>,
  },
  {
    key: "change",
    header: "Thay Đổi",
    align: "right",
    render: (item) => <ChangeBadge percent={item.change_percent} />,
  },
];

export default function ForexPage() {
  const [selectedPair, setSelectedPair] = useState<string>("USD");
  const [timeframe, setTimeframe] = useState<string>("1M");

  const { data: overview, isLoading: loadingOverview, error: overviewError } = useForexOverview();
  const { data: history, isLoading: historyLoading } = useForexHistory(selectedPair, timeframe);
  const { data: news = [] } = useForexNews();

  const activeForexItem: ForexItem | undefined = overview?.items.find(
    (item) => item.code === selectedPair
  );

  return (
    <MarketPage<ForexItem>
      theme={THEME}
      icon={DollarSign}
      title="Tỷ Giá Ngoại Tệ & Ngoại Hối"
      subtitle="Tra cứu tỷ giá niêm yết thương mại: USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY"
      loading={loadingOverview}
      error={overviewError}
      errorLabel="Lỗi khi kết nối hệ thống tỷ giá"
      updatedAt={overview?.updated_at}
      items={overview?.items ?? []}
      getItemCode={(item) => item.code}
      selectedCode={selectedPair}
      onSelectCode={setSelectedPair}
      renderPill={(item, selected) => (
        <>
          <span className="font-mono text-[10px] opacity-75">{item.symbol}</span>
          <span>{item.code}</span>
          <ChangeBadge percent={item.change_percent} selected={selected} />
        </>
      )}
      metrics={activeForexItem ? buildMetrics(activeForexItem) : []}
      range={
        activeForexItem
          ? {
              low: activeForexItem.low_24h,
              high: activeForexItem.high_24h,
              current: activeForexItem.sell,
              format: (n) => formatRate(n),
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
          <Card className="flex h-72 items-center justify-center rounded-2xl border-white/8 bg-[#0c0c14] text-xs text-slate-500">
            Không tìm thấy dữ liệu lịch sử tỷ giá
          </Card>
        )
      }
      tableTitle="Bảng Tỷ Giá Ngoại Tệ Niêm Yết Ngân Hàng"
      tableCountLabel="cặp ngoại tệ"
      columns={COLUMNS}
      newsTitle="Tin Tức Tỷ Giá & Thị Trường Ngoại Hối"
      news={news}
      toArticle={convertNewsToArticle}
      pinToastLabels={{
        added: "Đã ghim tin tức tỷ giá ngoại tệ vào Context",
        removed: "Đã bỏ ghim khỏi Context",
      }}
    />
  );
}
