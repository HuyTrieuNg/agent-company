"use client";

import { useState, useEffect } from "react";
import { fetchPreferences, updatePreferences, UserPreference } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserPreferenceModal({ isOpen, onClose }: Props) {
  const [pref, setPref] = useState<UserPreference>({
    role_title: "",
    interested_topics: "",
    response_style: "sut_tich",
    custom_instructions: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setMessage(null);
      fetchPreferences()
        .then((data) => setPref(data))
        .catch((err) => setMessage(err.message || "Không thể tải cài đặt."))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updatePreferences(pref);
      setMessage("Đã lưu cài đặt Context thành công!");
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-up">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#12121a] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-[#8b5cf6] to-[#06b6d4] text-sm">
              ⚙️
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Cài đặt User Context & Preference</h3>
              <p className="text-xs text-slate-400">Tùy chỉnh thông tin và phong cách trả lời cho AI Chatbot</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex py-12 justify-center text-slate-400">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#8b5cf6]" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {message && (
              <div
                className={`rounded-lg px-3.5 py-2.5 text-xs font-medium ${
                  message.includes("thành công")
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                    : "bg-red-500/15 border border-red-500/30 text-red-400"
                }`}
              >
                {message}
              </div>
            )}

            {/* Role / Title */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Danh xưng / Vai trò của bạn
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#8b5cf6] focus:outline-hidden"
                placeholder="VD: Nhà đầu tư cá nhân, Phân tích viên, Sinh viên tài chính..."
                value={pref.role_title}
                onChange={(e) => setPref({ ...pref, role_title: e.target.value })}
              />
            </div>

            {/* Interested Topics */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Lĩnh vực & Mã quan tâm hàng đầu
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#8b5cf6] focus:outline-hidden"
                placeholder="VD: Cổ phiếu VNM, HPG, Vàng SJC, Tỷ giá USD, Bất động sản..."
                value={pref.interested_topics}
                onChange={(e) => setPref({ ...pref, interested_topics: e.target.value })}
              />
            </div>

            {/* Response Style */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Phong cách phản hồi của AI
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "sut_tich", label: "Ngắn gọn súc tích" },
                  { id: "chi_tiet", label: "Chi tiết cặn kẽ" },
                  { id: "phan_tich", label: "Phân tích số liệu" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPref({ ...pref, response_style: item.id })}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                      pref.response_style === item.id
                        ? "border-[#8b5cf6] bg-[#8b5cf6]/20 text-[#a78bfa]"
                        : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Instructions */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Yêu cầu / Ghi chú thêm cho AI
              </label>
              <textarea
                rows={2}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#8b5cf6] focus:outline-hidden resize-none"
                placeholder="VD: Trả lời bằng tiếng Việt chuyên nghiệp, trích dẫn rõ nguồn CafeF hoặc Vietstock..."
                value={pref.custom_instructions}
                onChange={(e) => setPref({ ...pref, custom_instructions: e.target.value })}
              />
            </div>

            {/* Footer Buttons */}
            <div className="mt-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-linear-to-br from-[#8b5cf6] to-[#6d28d9] px-4 py-2 text-xs font-medium text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Đang lưu..." : "Lưu cài đặt"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
