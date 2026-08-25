import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { FullArticleItem, NewsArticleItem } from "@/lib/api";

interface UiState {
  isContextDrawerOpen: boolean;
  selectedArticleForSheet: (FullArticleItem | NewsArticleItem) | null;
  isArticleSheetOpen: boolean;
  isSidebarCollapsed: boolean;

  setContextDrawerOpen: (open: boolean) => void;
  openArticleSheet: (article: FullArticleItem | NewsArticleItem) => void;
  closeArticleSheet: () => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isContextDrawerOpen: false,
      selectedArticleForSheet: null,
      isArticleSheetOpen: false,
      isSidebarCollapsed: false,

      setContextDrawerOpen: (isContextDrawerOpen) => set({ isContextDrawerOpen }),
      openArticleSheet: (article) =>
        set({
          selectedArticleForSheet: article,
          isArticleSheetOpen: true,
        }),
      closeArticleSheet: () =>
        set({
          isArticleSheetOpen: false,
          selectedArticleForSheet: null,
        }),
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: "agent_company_ui_storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ isSidebarCollapsed: state.isSidebarCollapsed }),
      skipHydration: true,
    }
  )
);
