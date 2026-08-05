import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Giá Vàng — Agent Company",
  description: "Bảng giá vàng SJC, PNJ, DOJI, Vàng 9999 & Vàng Thế Giới (XAU/USD)",
};

export default function GoldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
