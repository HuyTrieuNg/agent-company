import { create } from "zustand";
import { ChatMessage, ChatSessionSummary } from "@/lib/api";

interface ChatState {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  history: ChatMessage[];
  cachedArticles: Record<string, unknown>[];
  loadingHistory: boolean;
  isSending: boolean;
  isPrefModalOpen: boolean;

  setSessions: (sessions: ChatSessionSummary[]) => void;
  setActiveSessionId: (id: string | null) => void;
  setHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setCachedArticles: (articles: Record<string, unknown>[]) => void;
  setLoadingHistory: (loading: boolean) => void;
  setIsSending: (sending: boolean) => void;
  setIsPrefModalOpen: (open: boolean) => void;
  createNewSession: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  history: [],
  cachedArticles: [],
  loadingHistory: false,
  isSending: false,
  isPrefModalOpen: false,

  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setHistory: (historyOrFn) =>
    set((state) => ({
      history: typeof historyOrFn === "function" ? historyOrFn(state.history) : historyOrFn,
    })),
  setCachedArticles: (cachedArticles) => set({ cachedArticles }),
  setLoadingHistory: (loadingHistory) => set({ loadingHistory }),
  setIsSending: (isSending) => set({ isSending }),
  setIsPrefModalOpen: (isPrefModalOpen) => set({ isPrefModalOpen }),
  createNewSession: () =>
    set({
      activeSessionId: null,
      history: [],
      cachedArticles: [],
    }),
}));
