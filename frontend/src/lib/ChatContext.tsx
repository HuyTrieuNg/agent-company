"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  ChatMessage,
  ChatSessionSummary,
  fetchSessions,
  fetchSessionDetail,
  deleteSession as apiDeleteSession,
  NewsArticleItem,
} from "./api";
import UserPreferenceModal from "@/components/UserPreferenceModal";

interface ChatContextType {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  history: ChatMessage[];
  cachedArticles: Record<string, unknown>[];
  pinnedArticles: NewsArticleItem[];
  loadingHistory: boolean;
  isPrefModalOpen: boolean;
  setHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setCachedArticles: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;
  setIsPrefModalOpen: (open: boolean) => void;
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  createNewSession: () => void;
  handleDeleteSession: (sessionId: string, e: React.MouseEvent) => Promise<void>;
  setActiveSessionId: (id: string | null) => void;
  togglePinArticle: (article: NewsArticleItem) => void;
  removePinnedArticle: (urlHashOrUrl: string) => void;
  clearPinnedArticles: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [cachedArticles, setCachedArticles] = useState<Record<string, unknown>[]>([]);
  const [pinnedArticles, setPinnedArticles] = useState<NewsArticleItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);

  // Load pinned articles from localStorage on initial render
  useEffect(() => {
    try {
      const stored = localStorage.getItem("agent_company_pinned_articles");
      if (stored) {
        setPinnedArticles(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to parse stored pinned articles:", e);
    }
  }, []);

  // Save pinned articles to localStorage on state change
  const savePinnedArticles = (articles: NewsArticleItem[]) => {
    setPinnedArticles(articles);
    try {
      localStorage.setItem("agent_company_pinned_articles", JSON.stringify(articles));
    } catch (e) {
      console.error("Failed to save pinned articles:", e);
    }
  };

  const togglePinArticle = (article: NewsArticleItem) => {
    const key = article.url_hash || article.url;
    const exists = pinnedArticles.some((a) => (a.url_hash || a.url) === key);
    if (exists) {
      savePinnedArticles(pinnedArticles.filter((a) => (a.url_hash || a.url) !== key));
    } else {
      savePinnedArticles([...pinnedArticles, article]);
    }
  };

  const removePinnedArticle = (urlHashOrUrl: string) => {
    savePinnedArticles(pinnedArticles.filter((a) => (a.url_hash || a.url) !== urlHashOrUrl));
  };

  const clearPinnedArticles = () => {
    savePinnedArticles([]);
  };

  const loadSessions = async () => {
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const selectSession = async (sessionId: string) => {
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
  };

  const createNewSession = () => {
    setActiveSessionId(null);
    setHistory([]);
    setCachedArticles([]);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiDeleteSession(sessionId);
      const updated = sessions.filter((s) => s.id !== sessionId);
      setSessions(updated);
      if (activeSessionId === sessionId) {
        if (updated.length > 0) {
          selectSession(updated[0].id);
        } else {
          createNewSession();
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        sessions,
        activeSessionId,
        history,
        cachedArticles,
        pinnedArticles,
        loadingHistory,
        isPrefModalOpen,
        setHistory,
        setCachedArticles,
        setIsPrefModalOpen,
        loadSessions,
        selectSession,
        createNewSession,
        handleDeleteSession,
        setActiveSessionId,
        togglePinArticle,
        removePinnedArticle,
        clearPinnedArticles,
      }}
    >
      {children}
      <UserPreferenceModal
        isOpen={isPrefModalOpen}
        onClose={() => setIsPrefModalOpen(false)}
      />
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}
