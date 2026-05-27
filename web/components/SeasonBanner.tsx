"use client";

import { useMemo } from "react";
import { daysFromToday, nextSeasons } from "@/lib/season";

// 떡집 매출 시즌 배너. 큰 배너 = importance ≥ 8 (추석/설/어버이날) 1건,
// 아래 컴팩트 행 = importance ≥ 5 (정월대보름/한식/스승의날/동지/크리스마스 등) 추가 2~3건.

export default function SeasonBanner() {
  const data = useMemo(() => {
    const now = new Date();
    const [primary] = nextSeasons(now, 1, 8);
    // 보조 시즌: importance 5~7 중 다음 3개 (큰 시즌과 같은 날 항목 제외)
    const secondary = nextSeasons(now, 6, 5)
      .filter((s) => !primary || s.date !== primary.date)
      .filter((s) => s.importance < 8) // 8 이상은 큰 배너에서 처리
      .slice(0, 3);
    const primaryWithD = primary
      ? { ...primary, days: daysFromToday(primary.date, now) }
      : null;
    const secondaryWithD = secondary.map((s) => ({ ...s, days: daysFromToday(s.date, now) }));
    if (primaryWithD && primaryWithD.days < 0) {
      return { primary: null, secondary: secondaryWithD };
    }
    return { primary: primaryWithD, secondary: secondaryWithD };
  }, []);

  if (!data.primary && data.secondary.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {data.primary && (() => {
        const within90 = data.primary.days <= 90;
        return (
          <div
            className={`rounded p-4 flex items-center justify-between ${
              within90
                ? "bg-gradient-to-r from-rose-100 to-amber-100 border-2 border-rose-400"
                : "bg-slate-100 border border-slate-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`text-3xl ${within90 ? "" : "opacity-60"}`}>🎉</div>
              <div>
                <div className={`text-sm font-bold ${within90 ? "text-rose-900" : "text-slate-700"}`}>
                  {data.primary.name} 까지
                </div>
                <div className={`text-[11px] ${within90 ? "text-rose-700" : "text-slate-500"}`}>
                  {data.primary.date}
                  {within90 && " · 떡집 매출 핵심 시즌 — 행사 준비/MD 컨택 미리"}
                </div>
              </div>
            </div>
            <div
              className={`text-3xl font-extrabold tabular-nums px-4 py-1 rounded ${
                data.primary.days <= 14
                  ? "bg-red-600 text-white"
                  : data.primary.days <= 30
                  ? "bg-rose-500 text-white"
                  : data.primary.days <= 90
                  ? "bg-amber-400 text-amber-950"
                  : "bg-white text-slate-700"
              }`}
            >
              D-{data.primary.days}
            </div>
          </div>
        );
      })()}

      {data.secondary.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500">📌 다음 시즌</span>
          {data.secondary.map((s) => {
            const isClose = s.days <= 30;
            return (
              <span
                key={s.date}
                className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                  isClose
                    ? "bg-amber-50 border-amber-300 text-amber-900"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                title={s.date}
              >
                <span>{s.name}</span>
                <span className={`font-mono font-extrabold tabular-nums ${
                  s.days <= 14 ? "text-red-600" : s.days <= 30 ? "text-rose-600" : "text-slate-500"
                }`}>
                  D-{s.days}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
