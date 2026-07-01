"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/",
    id: "nav-chat",
    label: "Chat",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    href: "/research",
    id: "nav-research",
    label: "Research",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    href: "/sources",
    id: "nav-sources",
    label: "Nguồn tin",
    icon: (
      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-15 flex-col items-center border-r border-white/8 bg-[#0a0a0f] py-4 md:w-50 md:items-stretch md:px-3">
      {/* Logo */}
      <div className="mb-6 flex items-center justify-center gap-2.5 md:justify-start md:px-1">
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

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              id={item.id}
              className={`group flex h-10 items-center justify-center gap-3 rounded-[10px] transition-all duration-150 md:justify-start md:px-3 ${
                isActive
                  ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/25"
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-200 border border-transparent"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="hidden text-[13px] font-medium md:block">
                {item.label}
              </span>
              {isActive && (
                <span className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-[#8b5cf6] md:block" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom status */}
      <div className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 md:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
        <span className="text-[11px] text-slate-600">Online</span>
      </div>
    </aside>
  );
}
