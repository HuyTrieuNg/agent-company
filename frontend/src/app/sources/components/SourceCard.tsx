"use client";

import { useState } from "react";
import type { SourceProfile } from "@/lib/sources-api";
import { toggleSource, deleteSource } from "@/lib/sources-api";

interface SourceCardProps {
  source: SourceProfile;
  onEdit: (source: SourceProfile) => void;
  onDeleted: (id: string) => void;
  onToggled: (id: string, is_active: boolean) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  economics: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  finance: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  legal: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  technology: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  general: "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  economics: "Kinh tế",
  finance: "Tài chính",
  legal: "Pháp lý",
  technology: "Công nghệ",
  general: "Tổng hợp",
};

export default function SourceCard({
  source,
  onEdit,
  onDeleted,
  onToggled,
}: SourceCardProps) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const categoryStyle =
    CATEGORY_COLORS[source.category] ?? CATEGORY_COLORS.general;
  const categoryLabel = CATEGORY_LABELS[source.category] ?? source.category;

  const handleToggle = async () => {
    setToggling(true);
    try {
      const result = await toggleSource(source.id);
      onToggled(source.id, result.is_active);
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSource(source.id);
      onDeleted(source.id);
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div
      className={`group relative flex flex-col gap-3 rounded-2xl border p-5 transition-all duration-200 ${
        source.is_active
          ? "border-white/10 bg-white/4 hover:border-violet-500/30 hover:bg-white/6"
          : "border-white/5 bg-white/2 opacity-60"
      }`}
    >
      {/* Top row: name + toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white">{source.name}</h3>
          <a
            href={source.base_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-xs text-slate-400 transition hover:text-violet-400"
            id={`source-url-${source.id}`}
          >
            {source.base_url}
          </a>
        </div>

        {/* Toggle */}
        <button
          id={`toggle-${source.id}`}
          onClick={handleToggle}
          disabled={toggling}
          title={source.is_active ? "Tắt nguồn" : "Bật nguồn"}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
            source.is_active ? "bg-violet-600" : "bg-slate-600"
          } disabled:opacity-50`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
              source.is_active ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryStyle}`}
        >
          {categoryLabel}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-400">
          {source.language.toUpperCase()}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-400">
          Ưu tiên: {source.priority}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-white/5 pt-3">
        <button
          id={`edit-${source.id}`}
          onClick={() => onEdit(source)}
          className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs font-medium text-slate-300 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300"
        >
          Chỉnh sửa
        </button>
        <button
          id={`delete-${source.id}`}
          onClick={() => setShowConfirm(true)}
          className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
        >
          Xóa
        </button>
      </div>

      {/* Confirm delete overlay */}
      {showConfirm && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#0d0d1a]/95 p-4 backdrop-blur-sm">
          <p className="text-center text-sm font-medium text-white">
            Xóa nguồn <span className="text-violet-400">&quot;{source.name}&quot;</span>?
          </p>
          <p className="text-center text-xs text-slate-400">
            Hành động này không thể hoàn tác.
          </p>
          <div className="flex w-full gap-2">
            <button
              id={`cancel-delete-${source.id}`}
              onClick={() => setShowConfirm(false)}
              className="flex-1 rounded-lg border border-white/10 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5"
            >
              Hủy
            </button>
            <button
              id={`confirm-delete-${source.id}`}
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
            >
              {deleting ? "Đang xóa..." : "Xóa"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
