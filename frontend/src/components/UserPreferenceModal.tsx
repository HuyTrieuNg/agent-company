"use client";

import { useState, useEffect } from "react";
import { fetchPreferences, updatePreferences, UserPreference } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchPreferences();
        if (!isCancelled) {
          setPref(data);
        }
      } catch (err) {
        if (!isCancelled) {
          toast.error("Không thể tải cài đặt context: " + (err as Error).message);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePreferences(pref);
      toast.success("Đã lưu cài đặt User Context & Persona thành công!");
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-(--bg-surface) border-(--border-default) p-6 text-(--text-primary)">
        <DialogHeader className="border-b border-(--border-default) pb-4">
          <DialogTitle className="text-base font-bold text-(--text-primary) flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-(--action-primary)" />
            Cài đặt User Context & Persona
          </DialogTitle>
          <DialogDescription className="text-xs text-(--text-secondary)">
            Tùy chỉnh thông tin và phong cách phản hồi cho Chatbot AI
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex py-12 justify-center text-(--text-tertiary)">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-(--border-default) border-t-(--action-primary)" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-4 py-2">
            {/* Role / Title */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-(--text-primary)">
                Danh xưng / Vai trò của bạn
              </label>
              <Input
                type="text"
                placeholder="VD: Nhà đầu tư cá nhân, Phân tích viên, Sinh viên..."
                value={pref.role_title}
                onChange={(e) => setPref({ ...pref, role_title: e.target.value })}
                className="text-xs"
              />
            </div>

            {/* Interested Topics */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-(--text-primary)">
                Lĩnh vực & Mã quan tâm hàng đầu
              </label>
              <Input
                type="text"
                placeholder="VD: Cổ phiếu VNM, HPG, Vàng SJC, Tỷ giá USD..."
                value={pref.interested_topics}
                onChange={(e) => setPref({ ...pref, interested_topics: e.target.value })}
                className="text-xs"
              />
            </div>

            {/* Response Style */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-(--text-primary)">
                Phong cách phản hồi
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "sut_tich", label: "Súc tích" },
                  { id: "chi_tiet", label: "Chi tiết" },
                  { id: "phan_tich", label: "Phân tích số liệu" },
                ].map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={pref.response_style === item.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPref({ ...pref, response_style: item.id })}
                    className="rounded-lg text-xs font-semibold"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Instructions */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-(--text-primary)">
                Chỉ dẫn đặc biệt cho AI
              </label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-(--border-default) bg-(--bg-surface) px-3 py-2 text-xs text-(--text-primary) placeholder:text-(--text-tertiary) focus:border-(--border-strong) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) resize-none transition-colors"
                placeholder="VD: Trả lời bằng tiếng Việt, trích dẫn nguồn cụ thể..."
                value={pref.custom_instructions}
                onChange={(e) => setPref({ ...pref, custom_instructions: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2 border-t border-(--border-default) gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Hủy
              </Button>
              <Button type="submit" variant="default" size="sm" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu cài đặt"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
