"use client";

import { useMemo } from "react";
import { daysFromToday, nextSeasons } from "@/lib/season";

// 떡집 매출 핵심 시즌 — importance ≥ 8 (추석/설/어버이날 등) 큰 D-day 배너.
// 90일 이내면 진한 강조, 그 이상은 컴팩트 톤.

export default function SeasonBanner() {
  const banner = useMemo(() => {
    const now = new Date();
    const [next] = nextSeasons(now, 1, 8);
    if (!next) return null;
    const d = daysFromToday(next.date, now);
    if (d < 0) return null;
    return { name: next.name, date: next.date, days: d, importance: next.importance };
  }, []);

  if (!banner) return null;
  const within90 = banner.days <= 90;

  return (
    <div
      className={`mb-4 rounded p-4 flex items-center justify-between ${
        within90
          ? "bg-gradient-to-r from-rose-100 to-amber-100 border-2 border-rose-400"
          : "bg-slate-100 border border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`text-3xl ${within90 ? "" : "opacity-60"}`}>🎉</div>
        <div>
          <div className={`text-sm font-bold ${within90 ? "text-rose-900" : "text-slate-700"}`}>
            {banner.name} 까지
          </div>
          <div className={`text-[11px] ${within90 ? "text-rose-700" : "text-slate-500"}`}>
            {banner.date}
            {within90 && " · 떡집 매출 핵심 시즌 — 행사 준비/MD 컨택 미리"}
          </div>
        </div>
      </div>
      <div
        className={`text-3xl font-extrabold tabular-nums px-4 py-1 rounded ${
          banner.days <= 14
            ? "bg-red-600 text-white"
            : banner.days <= 30
            ? "bg-rose-500 text-white"
            : banner.days <= 90
            ? "bg-amber-400 text-amber-950"
            : "bg-white text-slate-700"
        }`}
      >
        D-{banner.days}
      </div>
    </div>
  );
}
