import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { NewsArticleItem } from "@/lib/api";

export interface ContextArticle extends NewsArticleItem {
  isActiveInPrompt?: boolean;
}

interface ContextState {
  pinnedArticles: ContextArticle[];
  togglePinArticle: (article: NewsArticleItem) => boolean; // returns true if added, false if removed
  removePinnedArticle: (urlHashOrUrl: string) => void;
  clearPinnedArticles: () => void;
  toggleArticleActive: (urlHashOrUrl: string) => void;
  setAllArticlesActive: (active: boolean) => void;
  isPinned: (article: Partial<NewsArticleItem>) => boolean;
  getActiveArticles: () => NewsArticleItem[];
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      pinnedArticles: [],

      togglePinArticle: (article: NewsArticleItem) => {
        const key = article.url_hash || article.url;
        const current = get().pinnedArticles;
        const exists = current.some((a) => (a.url_hash || a.url) === key);

        if (exists) {
          set({
            pinnedArticles: current.filter((a) => (a.url_hash || a.url) !== key),
          });
          return false;
        } else {
          set({
            pinnedArticles: [{ ...article, isActiveInPrompt: true }, ...current],
          });
          return true;
        }
      },

      removePinnedArticle: (urlHashOrUrl: string) => {
        set({
          pinnedArticles: get().pinnedArticles.filter(
            (a) => (a.url_hash || a.url) !== urlHashOrUrl
          ),
        });
      },

      clearPinnedArticles: () => {
        set({ pinnedArticles: [] });
      },

      toggleArticleActive: (urlHashOrUrl: string) => {
        set({
          pinnedArticles: get().pinnedArticles.map((a) => {
            const key = a.url_hash || a.url;
            if (key === urlHashOrUrl) {
              return { ...a, isActiveInPrompt: a.isActiveInPrompt === false ? true : false };
            }
            return a;
          }),
        });
      },

      setAllArticlesActive: (active: boolean) => {
        set({
          pinnedArticles: get().pinnedArticles.map((a) => ({
            ...a,
            isActiveInPrompt: active,
          })),
        });
      },

      isPinned: (article: Partial<NewsArticleItem>) => {
        const key = article.url_hash || article.url;
        if (!key) return false;
        return get().pinnedArticles.some((a) => (a.url_hash || a.url) === key);
      },

      getActiveArticles: () => {
        return get().pinnedArticles.filter((a) => a.isActiveInPrompt !== false);
      },
    }),
    {
      name: "agent_company_context_storage",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }
  )
);
