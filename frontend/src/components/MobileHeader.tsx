"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import { useContextStore } from "@/stores/contextStore";
import { useChatSessions, useDeleteSession } from "@/hooks/useChat";
import { fetchSessionDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import {
  Menu,
  MessageSquare,
  TrendingUp,
  Plus,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { NAV_ITEMS } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";

export default function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

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

  const closeMenu = () => setIsOpen(false);

  const handleSelectSession = async (sessionId: string) => {
    if (activeSessionId === sessionId) {
      closeMenu();
      return;
    }
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
    closeMenu();
  };

  const handleCreateSession = () => {
    createNewSession();
    if (pathname !== "/") {
      router.push("/");
    }
    closeMenu();
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSessionMutation.mutate(sessionId);
    if (activeSessionId === sessionId) {
      createNewSession();
    }
  };

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-11 items-center justify-between border-b border-(--border-default) bg-(--bg-surface) px-2">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[85%] flex-col p-4 sm:max-w-md">
          <SheetTitle className="sr-only">Menu Điều Hướng</SheetTitle>
          <div className="flex items-center gap-2.5 overflow-hidden pb-4 pt-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--bg-selected) text-(--action-primary)">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="whitespace-nowrap text-sm font-bold leading-tight text-(--text-primary)">
                Agent Company
              </p>
              <p className="whitespace-nowrap text-[10px] text-(--text-tertiary)">Financial intelligence</p>
            </div>
          </div>

          <nav className="flex w-full flex-col gap-1 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const isNews = item.href === "/news";
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  id={item.id}
                  onClick={closeMenu}
                  className={cn(
                    "group relative flex min-h-[44px] items-center overflow-hidden rounded-lg border border-transparent px-3 transition-colors duration-150",
                    isActive
                      ? "border-(--border-default) bg-(--bg-selected) font-semibold text-(--text-primary)"
                      : "text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="ml-3 text-sm font-medium">
                    {item.label}
                  </span>
                  {isNews && pinnedArticles.length > 0 && (
                    <Badge
                      variant="default"
                      className="ml-auto rounded-full bg-(--bg-subtle) px-2 py-0.5 text-xs font-bold text-(--text-secondary)"
                    >
                      {pinnedArticles.length}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-1 flex-col overflow-hidden border-t border-(--border-default) pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="whitespace-nowrap text-[10px] font-bold tracking-wider text-(--text-tertiary) uppercase">
                Lịch sử trò chuyện
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCreateSession}
                className="h-9 w-9 min-h-[44px] min-w-[44px] border border-(--border-default) bg-(--bg-surface) text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary)"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {loadingSessions ? (
                <div className="py-4 text-center text-sm text-(--text-tertiary) animate-pulse">
                  Đang tải lịch sử...
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-4 text-center text-sm text-(--text-tertiary)">
                  Chưa có lịch sử chat
                </div>
              ) : (
                sessions.map((s) => {
                  const isActive = activeSessionId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`group relative flex min-h-[44px] items-center gap-1 rounded-lg border px-1 transition-colors ${
                        isActive
                          ? "border-(--border-default) bg-(--bg-selected)"
                          : "border-transparent hover:bg-(--bg-subtle)"
                      }`}
                    >
                      <button
                        onClick={() => handleSelectSession(s.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "flex flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors text-left min-w-0",
                          isActive
                            ? "font-semibold text-(--text-primary)"
                            : "text-(--text-secondary) hover:text-(--text-primary)"
                        )}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-(--text-tertiary) group-hover:text-(--action-primary)" aria-hidden="true" />
                        <span className="truncate flex-1">{s.title}</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-(--text-tertiary) hover:text-(--status-negative) min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1 rounded shrink-0 focus-visible:opacity-100"
                        aria-label={`Xóa cuộc hội thoại: ${s.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 border-t border-(--border-default) pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setIsPrefModalOpen(true);
                closeMenu();
              }}
              className="flex min-h-[44px] w-full items-center justify-start gap-3 rounded-lg border border-(--border-default) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-subtle) hover:text-(--text-primary) transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4 text-(--action-primary) shrink-0" />
              <span>Cài đặt Context</span>
            </Button>
            <div className="flex items-center justify-between whitespace-nowrap px-1 py-2 text-xs text-(--text-tertiary)">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-(--status-positive)" />
                Hệ thống sẵn sàng
              </span>
              {pinnedArticles.length > 0 && (
                <Badge variant="secondary" className="text-(--text-secondary) px-2 py-0.5">
                  {pinnedArticles.length} context
                </Badge>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      
      <div className="flex flex-1 items-center justify-center font-bold text-sm text-(--text-primary) truncate px-2">
        Agent Company
      </div>

      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <ThemeToggle collapsed={true} />
      </div>
    </header>
  );
}
