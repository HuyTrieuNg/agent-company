"use client";

import { useEffect, useState, useCallback } from "react";
import { listSources } from "@/lib/sources-api";
import type { SourceProfile } from "@/lib/sources-api";
import SourceCard from "./SourceCard";
import SourceFormModal from "./SourceFormModal";

interface SourceTableProps {
  onSourcesChange?: (count: number) => void;
}

export default function SourceTable({ onSourcesChange }: SourceTableProps) {
  const [sources, setSources] = useState<SourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingSource, setEditingSource] = useState<SourceProfile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const fetchSources = useCallback(async () => {
    try {
      const data = await listSources();
      setSources(data);
      onSourcesChange?.(data.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không thể tải danh sách nguồn");
    } finally {
      setLoading(false);
    }
  }, [onSourcesChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSources();
  }, [fetchSources]);

  const handleSaved = (saved: SourceProfile) => {
    setSources((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setEditingSource(null);
    setShowCreateModal(false);
  };

  const handleDeleted = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggled = (id: string, is_active: boolean) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active } : s))
    );
  };

  // Filtered sources
  const categories = ["all", ...Array.from(new Set(sources.map((s) => s.category)))];
  const filtered = sources.filter((s) => {
    if (filterCategory !== "all" && s.category !== filterCategory) return false;
    if (filterActive === "active" && !s.is_active) return false;
    if (filterActive === "inactive" && s.is_active) return false;
    return true;
  });

  const activeCount = sources.filter((s) => s.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Đang tải danh sách nguồn...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchSources}
            className="mt-3 rounded-lg bg-red-500/20 px-4 py-1.5 text-sm text-red-300 hover:bg-red-500/30"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Stats + Add button */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-white">{sources.length}</p>
            <p className="text-xs text-slate-400">Tổng nguồn</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-violet-400">{activeCount}</p>
            <p className="text-xs text-slate-400">Đang hoạt động</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-slate-300">{sources.length - activeCount}</p>
            <p className="text-xs text-slate-400">Đã tắt</p>
          </div>
        </div>

        <button
          id="add-source-btn"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-linear-to-br from-[#8b5cf6] to-[#6d28d9] px-4 py-2.5 text-sm font-medium text-white shadow-[0_2px_12px_rgba(139,92,246,0.35)] transition hover:shadow-[0_4px_18px_rgba(139,92,246,0.45)] hover:scale-[1.02] active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Thêm nguồn
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-2">
        {/* Category filter */}
        {categories.map((cat) => (
          <button
            key={cat}
            id={`filter-cat-${cat}`}
            onClick={() => setFilterCategory(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filterCategory === cat
                ? "bg-linear-to-br from-[#8b5cf6] to-[#6d28d9] text-white shadow-[0_2px_8px_rgba(139,92,246,0.3)]"
                : "border border-white/10 text-slate-400 hover:border-[#8b5cf6]/40 hover:text-white"
            }`}
          >
            {cat === "all" ? "Tất cả" : cat}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              id={`filter-active-${f}`}
              onClick={() => setFilterActive(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filterActive === f
                  ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                  : "border border-white/10 text-slate-400 hover:border-emerald-500/30 hover:text-white"
              }`}
            >
              {f === "all" ? "Tất cả" : f === "active" ? "Đang bật" : "Đã tắt"}
            </button>
          ))}
        </div>
      </div>

      {/* Source grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-5">
            <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <p className="text-slate-400">Chưa có nguồn nào</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 rounded-xl bg-violet-600/20 px-4 py-2 text-sm text-violet-400 hover:bg-violet-600/30"
          >
            Thêm nguồn đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onEdit={setEditingSource}
              onDeleted={handleDeleted}
              onToggled={handleToggled}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showCreateModal || editingSource) && (
        <SourceFormModal
          source={editingSource}
          onClose={() => {
            setShowCreateModal(false);
            setEditingSource(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
