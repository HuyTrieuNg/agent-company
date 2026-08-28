import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/AppProviders";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Company - Trợ Lý AI Tài Chính & Tin Tức",
  description: "Multi-agent AI platform powered by Google Gemini & Qdrant Vector DB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-(--bg-canvas) text-(--text-primary)`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
