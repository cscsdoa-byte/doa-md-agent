// 상태 라벨/색상 공용 모듈. Calendar / EventsTable 등에서 import.

export const STATUS_BADGE: Record<string, string> = {
  new: "bg-slate-200 text-slate-800 border-l-4 border-slate-500",
  reviewing: "bg-amber-200 text-amber-900 border-l-4 border-amber-600",
  applied: "bg-blue-300 text-blue-950 border-l-[6px] border-blue-700 font-semibold",
  selected: "bg-emerald-200 text-emerald-900 border-l-4 border-emerald-600 font-semibold",
  running: "bg-pink-300 text-pink-900 border-l-4 border-pink-700 font-bold",
  closed: "bg-slate-100 text-slate-500 border-l-4 border-slate-300 line-through",
  skip: "bg-slate-100 text-slate-400 border-l-4 border-slate-300 line-through opacity-70",
};

// 캘린더 day cell 행사 표시에 상태 한눈에 보이게 prefix.
// 5060 친화 — 아이콘만으로 status 식별 가능.
export const STATUS_ICON: Record<string, string> = {
  new: "🆕",
  reviewing: "👀",
  applied: "📨",
  selected: "✅",
  running: "🔴",
  closed: "🏁",
  skip: "⏭️",
};

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "신규" },
  { value: "reviewing", label: "검토중" },
  { value: "applied", label: "신청완료" },
  { value: "selected", label: "선정" },
  { value: "running", label: "진행중" },
  { value: "closed", label: "종료" },
  { value: "skip", label: "패스" },
];

export const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  selected: 1,
  applied: 2,
  reviewing: 3,
  new: 4,
  closed: 5,
  skip: 6,
};

export function statusLabel(s: string): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}
