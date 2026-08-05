import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tỷ Giá Ngoại Tệ — Agent Company",
  description: "Bảng tỷ giá ngoại tệ ngân hàng: USD, EUR, JPY, GBP, AUD, CAD, SGD, CNY",
};

export default function ForexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
