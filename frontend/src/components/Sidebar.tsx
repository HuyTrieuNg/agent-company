"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import { useContextStore } from "@/stores/contextStore";
import { useUiStore } from "@/stores/uiStore";
import { useChatSessions, useDeleteSession } from "@/hooks/useChat";
import { fetchSessionDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import {
  MessageSquare,
  Newspaper,
  TrendingUp,
  Coins,
  DollarSign,
  Plus,
  Trash2,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export const NAV_ITEMS = [
  {
    href: "/",
    id: "nav-chat",
    label: "Chat AI",
    icon: MessageSquare,
  },
  {
    href: "/news",
    id: "nav-news",
    label: "Tin tức báo chí",
    icon: Newspaper,
  },
  {
    href: "/stock",
    id: "nav-stock",
    label: "Chứng khoán",
    icon: TrendingUp,
  },
  {
    href: "/gold",
    id: "nav-gold",
    label: "Giá vàng",
    icon: Coins,
  },
  {
    href: "/forex",
    id: "nav-forex",
    label: "Ngoại tệ",
    icon: DollarSign,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const { isSidebarCollapsed: collapsed, toggleSidebar } = useUiStore();

  const {
    activeSessionId,
    setActiveSessionId,
    setHistory,
    setCachedArticles,
    setLoadingHistory,
    createNewSession,
    setIsPrefModalOpen,
  } = useChatStore();

  const { pinnedArticles } = useContextStore();

  const { data: sessions = [], isLoading: loadingSessions } = useChatSessions();
  const deleteSessionMutation = useDeleteSession();

  const handleSelectSession = async (sessionId: string) => {
    if (activeSessionId === sessionId) return;
    setActiveSessionId(sessionId);
    setLoadingHistory(true);
    try {
      const detail = await fetchSessionDetail(sessionId);
      setHistory(detail.messages || []);
      setCachedArticles([]);
    } catch (err) {
      console.error("Failed to fetch session detail:", err);
    } finally {
      setLoadingHistory(false);
    }
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

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSessionMutation.mutate(sessionId);
    if (activeSessionId === sessionId) {
      createNewSession();
    }
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 hidden md:flex h-screen flex-col border-r border-(--border-default) bg-(--bg-surface) py-4 transition-[width] duration-200 ease-in-out",
        collapsed
          ? "w-15 items-center"
          : "w-15 items-center md:w-60 md:items-stretch md:px-3"
      )}
    >
      {/* Logo + Collapse Toggle */}
      <div
        className={cn(
          "mb-5 flex items-center gap-2.5 overflow-hidden px-2",
          collapsed ? "flex-col" : "justify-center md:justify-start"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
        </div>
        <div
          className={cn(
            "hidden overflow-hidden transition-all duration-200 ease-in-out md:block",
            collapsed ? "h-0 w-0 opacity-0" : "opacity-100"
          )}
        >
          <p className="whitespace-nowrap text-sm font-bold leading-tight text-(--text-primary)">
            Agent Company
          </p>
          <p className="whitespace-nowrap text-[10px] text-(--text-tertiary)">Financial intelligence</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
              className={cn(
                "h-8 w-8 text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)",
                collapsed ? "" : "ml-auto hidden md:inline-flex"
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="text-xs">
              {collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Navigation items */}
      <nav className="mb-3 flex w-full flex-col gap-1 px-2 md:px-0">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const isNews = item.href === "/news";
          const Icon = item.icon;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  id={item.id}
                  className={cn(
                    "group relative flex h-9.5 items-center overflow-hidden rounded-lg border border-transparent transition-colors duration-150",
                    collapsed
                      ? "justify-center px-0"
                      : "justify-center md:justify-start md:px-3",
                    isActive
                      ? "border-(--border-default) bg-(--bg-selected) font-semibold text-(--text-primary)"
                      : "text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span
                    className={cn(
                      "hidden overflow-hidden whitespace-nowrap text-xs font-medium transition-all duration-200 ease-in-out md:block",
                      collapsed ? "w-0 opacity-0" : "ml-3 opacity-100"
                    )}
                  >
                    {item.label}
                  </span>
                  {isNews && pinnedArticles.length > 0 && (
                    collapsed ? (
                      <span className="absolute right-1 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-(--action-primary) px-1 text-[8px] font-bold leading-none text-(--action-on-primary)">
                        {pinnedArticles.length}
                      </span>
                    ) : (
                      <Badge
                        variant="default"
                        className="ml-auto hidden rounded-full bg-(--bg-subtle) px-1.5 py-0.2 text-[10px] font-bold text-(--text-secondary) md:inline-flex"
                      >
                        {pinnedArticles.length}
                      </Badge>
                    )
                  )}
                  {isActive && !isNews && !collapsed && (
                    <span className="ml-auto hidden h-4 w-0.5 shrink-0 rounded-full bg-(--action-primary) md:block" />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className={collapsed ? "" : "md:hidden"}>
                <p className="text-xs">{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Chat History Sessions — hidden while collapsed */}
      {!collapsed && (
        <div className="hidden flex-1 flex-col overflow-hidden border-t border-(--border-default) pt-3 md:flex">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="whitespace-nowrap text-[10px] font-bold tracking-wider text-(--text-tertiary) uppercase">
              Lịch sử trò chuyện
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCreateSession}
                  className="h-8 w-8 border border-(--border-default) bg-(--bg-surface) text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary)"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Tạo cuộc trò chuyện mới</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {loadingSessions ? (
              <div className="py-4 text-center text-xs text-(--text-tertiary) animate-pulse">
                Đang tải lịch sử...
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-4 text-center text-xs text-(--text-tertiary)">
                Chưa có lịch sử chat
              </div>
            ) : (
              sessions.map((s) => {
                const isActive = activeSessionId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`group relative flex items-center gap-1 rounded-lg border px-1 transition-colors ${
                      isActive
                        ? "border-(--border-default) bg-(--bg-selected)"
                        : "border-transparent hover:bg-(--bg-subtle)"
                    }`}
                  >
                    <button
                      onClick={() => handleSelectSession(s.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-xs transition-colors text-left min-w-0",
                        isActive
                          ? "font-semibold text-(--text-primary)"
                          : "text-(--text-secondary) hover:text-(--text-primary)"
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-(--text-tertiary) group-hover:text-(--action-primary)" aria-hidden="true" />
                      <span className="truncate flex-1 text-[11px]">{s.title}</span>
                    </button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => handleDeleteSession(s.id, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-(--text-tertiary) hover:text-(--status-negative) p-1 rounded shrink-0 focus-visible:opacity-100"
                          aria-label={`Xóa cuộc hội thoại: ${s.title}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">Xóa cuộc hội thoại</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom User Preference Button & Status */}
      <div
        className={cn(
          "mt-auto flex flex-col gap-2 border-t border-(--border-default) pt-3",
          collapsed ? "items-center w-full px-2" : ""
        )}
      >
        <ThemeToggle collapsed={collapsed} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              onClick={() => setIsPrefModalOpen(true)}
              className={cn(
                "h-9 items-center gap-0 overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-surface) text-xs font-medium text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary) transition-colors",
                collapsed
                  ? "w-full justify-center px-0"
                  : "flex w-full justify-center px-2 md:justify-start md:px-3"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-(--action-primary) shrink-0" />
              <span
                className={cn(
                  "hidden overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out md:block",
                  collapsed ? "w-0 opacity-0" : "ml-2.5 opacity-100"
                )}
              >
                Cài đặt Context
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className={collapsed ? "" : "md:hidden"}>
            <p className="text-xs">Cài đặt Context & Persona</p>
          </TooltipContent>
        </Tooltip>

        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-(--status-positive)" />
            {pinnedArticles.length > 0 && (
              <Badge variant="secondary" className="text-(--text-secondary) text-[9px] px-1.5 py-0">
                {pinnedArticles.length}
              </Badge>
            )}
          </div>
        ) : (
          <div className="hidden items-center justify-between whitespace-nowrap px-2 py-1 text-[10px] text-(--text-tertiary) md:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-(--status-positive)" />
              Hệ thống sẵn sàng
            </span>
            {pinnedArticles.length > 0 && (
              <Badge variant="secondary" className="text-(--text-secondary) text-[10px] px-1.5 py-0">
                {pinnedArticles.length} context
              </Badge>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
