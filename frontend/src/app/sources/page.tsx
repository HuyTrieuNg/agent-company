import type { Metadata } from "next";
import SourceTable from "./components/SourceTable";

export const metadata: Metadata = {
  title: "Nguồn tin | Agent Company",
  description: "Thêm, chỉnh sửa và quản lý các nguồn tin tức cho Research Agent",
};

export default function SourcesPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-orange-500 text-base shadow-[0_2px_12px_rgba(245,158,11,0.35)]">
            📰
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-white">Nguồn tin</p>
            <p className="text-[11px] text-slate-500">Cấu hình sources cho Research Agent</p>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 px-5 py-6">
        {/* Info banner */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#8b5cf6]/20 bg-[#8b5cf6]/8 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#a78bfa]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13px] text-slate-300">
            <span className="font-medium text-[#a78bfa]">5 nguồn kinh tế mặc định</span> đã được tải sẵn.
            Bật/tắt, chỉnh sửa hoặc thêm nguồn mới tùy ý.
            Cache bài báo giữ trong{" "}
            <span className="font-medium text-white">6 giờ</span>.
          </p>
        </div>

        <SourceTable />
      </main>
    </div>
  );
}
