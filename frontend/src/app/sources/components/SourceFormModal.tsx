"use client";

import { useState } from "react";
import type { SourceProfile, SourceCreate } from "@/lib/sources-api";
import { createSource, updateSource } from "@/lib/sources-api";

interface SourceFormModalProps {
  source?: SourceProfile | null;
  onClose: () => void;
  onSaved: (source: SourceProfile) => void;
}

const CATEGORIES = ["economics", "finance", "legal", "technology", "general"];
const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

export default function SourceFormModal({
  source,
  onClose,
  onSaved,
}: SourceFormModalProps) {
  const isEdit = !!source;
  const [form, setForm] = useState({
    id: source?.id ?? "",
    name: source?.name ?? "",
    base_url: source?.base_url ?? "",
    category: source?.category ?? "economics",
    language: source?.language ?? "vi",
    priority: source?.priority ?? 5,
    is_active: source?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let saved: SourceProfile;
      if (isEdit) {
        saved = await updateSource(source!.id, {
          name: form.name,
          base_url: form.base_url,
          category: form.category,
          language: form.language,
          priority: form.priority,
          is_active: form.is_active,
        });
      } else {
        const payload: SourceCreate = {
          id: form.id || form.name.toLowerCase().replace(/\s+/g, "_"),
          name: form.name,
          base_url: form.base_url,
          category: form.category,
          language: form.language,
          priority: form.priority,
          is_active: form.is_active,
        };
        saved = await createSource(payload);
      }
      onSaved(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 p-6"
        style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            {isEdit ? "Chỉnh sửa nguồn" : "Thêm nguồn mới"}
          </h2>
          <button
            id="modal-close-btn"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ID — only for create */}
          {!isEdit && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                ID nguồn <span className="text-slate-500">(slug, không dấu)</span>
              </label>
              <input
                id="source-id-input"
                type="text"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="vd: vnexpress_kinh_te"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 outline-none transition focus:border-violet-500/50 focus:bg-white/10"
              />
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Tên nguồn <span className="text-red-400">*</span>
            </label>
            <input
              id="source-name-input"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="vd: VnExpress Kinh tế"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 outline-none transition focus:border-violet-500/50 focus:bg-white/10"
            />
          </div>

          {/* URL */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              URL <span className="text-red-400">*</span>
            </label>
            <input
              id="source-url-input"
              type="url"
              required
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://vnexpress.net/kinh-te"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 outline-none transition focus:border-violet-500/50 focus:bg-white/10"
            />
          </div>

          {/* Category + Language row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Danh mục</label>
              <select
                id="source-category-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#1a1a2e] px-3 py-2.5 text-white outline-none transition focus:border-violet-500/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Ngôn ngữ</label>
              <select
                id="source-language-select"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#1a1a2e] px-3 py-2.5 text-white outline-none transition focus:border-violet-500/50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority + Active row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Độ ưu tiên <span className="text-slate-500">(1 = cao nhất)</span>
              </label>
              <input
                id="source-priority-input"
                type="number"
                min={1}
                max={10}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 5 })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-violet-500/50 focus:bg-white/10"
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  id="source-active-toggle"
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${form.is_active ? "bg-violet-600" : "bg-slate-600"}`}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
                <span className="text-sm font-medium text-slate-300">
                  {form.is_active ? "Đang hoạt động" : "Tắt"}
                </span>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              id="modal-cancel-btn"
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5"
            >
              Hủy
            </button>
            <button
              id="modal-save-btn"
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-linear-to-br from-[#8b5cf6] to-[#6d28d9] py-2.5 text-sm font-medium text-white shadow-[0_2px_12px_rgba(139,92,246,0.35)] transition hover:shadow-[0_4px_18px_rgba(139,92,246,0.45)] disabled:opacity-60"
            >
              {loading ? "Đang lưu..." : isEdit ? "Cập nhật" : "Thêm nguồn"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
