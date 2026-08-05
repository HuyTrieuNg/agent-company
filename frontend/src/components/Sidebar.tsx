"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChatContext } from "@/lib/ChatContext";

const NAV_ITEMS = [
  {
    href: "/",
    id: "nav-chat",
    label: "Chat AI",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    href: "/news",
    id: "nav-news",
    label: "Tin tức báo chí",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-3.375M16.5 4.5v15M6 4.5h9.75a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5v-12A1.5 1.5 0 016 4.5z" />
      </svg>
    ),
  },
  {
    href: "/stock",
    id: "nav-stock",
    label: "Chứng khoán",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    href: "/gold",
    id: "nav-gold",
    label: "Giá vàng",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-6h6m4 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/forex",
    id: "nav-forex",
    label: "Ngoại tệ",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 8v2m0-6c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    sessions,
    activeSessionId,
    pinnedArticles,
    selectSession,
    createNewSession,
    handleDeleteSession,
    setIsPrefModalOpen,
  } = useChatContext();

  const handleSelectSession = async (sessionId: string) => {
    await selectSession(sessionId);
    if (pathname !== "/") {
      router.push("/");
    }
  };

  const handleCreateSession = () => {
    createNewSession();
    if (pathname !== "/") {
      router.push("/");
    }
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-15 flex-col items-center border-r border-white/8 bg-[#0a0a0f] py-4 md:w-60 md:items-stretch md:px-3">
      {/* Logo */}
      <div className="mb-4 flex items-center justify-center gap-2.5 md:justify-start md:px-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#8b5cf6] to-[#06b6d4] text-base shadow-[0_2px_12px_rgba(139,92,246,0.35)] animate-pulse-glow">
          ✦
        </div>
        <div className="hidden md:block">
          <p className="text-sm font-bold bg-linear-to-r from-white to-[#8b5cf6] bg-clip-text text-transparent leading-tight">
            Agent Company
          </p>
          <p className="text-[10px] text-slate-600">powered by Gemini</p>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex flex-col gap-1 mb-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const isNews = item.href === "/news";
          return (
            <Link
              key={item.href}
              href={item.href}
              id={item.id}
              className={`group relative flex h-9.5 items-center justify-center gap-3 rounded-[10px] transition-all duration-150 md:justify-start md:px-3 ${
                isActive
                  ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/25"
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-200 border border-transparent"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="hidden text-[13px] font-medium md:block">
                {item.label}
              </span>
              {isNews && pinnedArticles.length > 0 && (
                <span className="ml-auto hidden rounded-full bg-[#8b5cf6] px-1.5 py-0.5 text-[10px] font-bold text-white md:block">
                  {pinnedArticles.length}
                </span>
              )}
              {isActive && !isNews && (
                <span className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-[#8b5cf6] md:block" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Chat History Sessions (Always Visible) */}
      <div className="hidden flex-1 flex-col overflow-hidden border-t border-white/8 pt-3 md:flex">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            Lịch sử hội thoại
          </span>
          <button
            onClick={handleCreateSession}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-slate-300 hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/20 hover:text-white cursor-pointer"
            title="Tạo cuộc trò chuyện mới"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {sessions.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-600">
              Chưa có lịch sử chat
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = activeSessionId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={`group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#8b5cf6]/20 text-[#c4b5fd] font-medium"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <span className="shrink-0 text-slate-500">💬</span>
                  <span className="truncate flex-1">{s.title}</span>
                  <button
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400 p-0.5 rounded cursor-pointer"
                    title="Xóa cuộc trò chuyện này"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>


      {/* Bottom User Preference Button & Status */}
      <div className="mt-auto border-t border-white/8 pt-3 flex flex-col gap-2">
        <button
          onClick={() => setIsPrefModalOpen(true)}
          className="flex h-9 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/4 px-2 text-xs font-medium text-slate-300 hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/10 hover:text-white transition-all cursor-pointer md:justify-start md:px-3"
          title="Cài đặt Context & Preference người dùng"
        >
          <span>⚙️</span>
          <span className="hidden md:inline">Cài đặt Context</span>
        </button>

        <div className="hidden items-center gap-1.5 rounded-lg px-2 py-1 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          <span className="text-[11px] text-slate-600">Online</span>
        </div>
      </div>
    </aside>
  );
}
