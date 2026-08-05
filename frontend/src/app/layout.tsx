import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ChatProvider } from "@/lib/ChatContext";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Company",
  description: "Multi-agent AI platform powered by Google Gemini & LangGraph",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-[#0a0a0f] text-slate-50 antialiased min-h-screen`}>
        <ChatProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            {/* Main content — offset by sidebar width */}
            <div className="flex flex-1 flex-col overflow-y-auto pl-15 md:pl-60">
              {children}
            </div>

          </div>
        </ChatProvider>
      </body>
    </html>
  );
}
