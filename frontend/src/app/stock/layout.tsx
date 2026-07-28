import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Dashboard — Agent Company",
  description: "Phân tích dữ liệu chứng khoán doanh nghiệp: Giá, Kỹ thuật, Tài chính, Tin tức",
};

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
