"use client";

import React, { useEffect } from "react";
import QueryProvider from "@/providers/QueryProvider";
import Sidebar from "@/components/Sidebar";
import ContextManagerDrawer from "@/components/context/ContextManagerDrawer";
import ArticleDetailSheet from "@/components/news/ArticleDetailSheet";
import UserPreferenceModal from "@/components/UserPreferenceModal";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useContextStore } from "@/stores/contextStore";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function GlobalModals() {
  const { isPrefModalOpen, setIsPrefModalOpen } = useChatStore();
  return (
    <>
      <UserPreferenceModal
        isOpen={isPrefModalOpen}
        onClose={() => setIsPrefModalOpen(false)}
      />
      <ContextManagerDrawer />
      <ArticleDetailSheet />
      <Toaster position="top-right" richColors />
    </>
  );
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const { isSidebarCollapsed } = useUiStore();

  /* Rehydrate persisted stores after mount so the first client render
     matches the server HTML (prevents hydration mismatch) */
  useEffect(() => {
    useUiStore.persist.rehydrate();
    useContextStore.persist.rehydrate();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <QueryProvider>
        <TooltipProvider delayDuration={200}>
          <div className="flex h-screen overflow-hidden bg-[#07070a] text-slate-100 antialiased">
            <Sidebar />
            {/* Main content — offset by sidebar width */}
            <div
              className={cn(
                "flex flex-1 flex-col overflow-y-auto pl-15 transition-[padding] duration-200 ease-in-out",
                !isSidebarCollapsed && "md:pl-60"
              )}
            >
              {children}
            </div>
          </div>
          <GlobalModals />
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

