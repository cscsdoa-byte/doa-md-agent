"use client";

import { useMemo, useState } from "react";
import { daysFromToday, nextSeasons } from "@/lib/season";
import type { EventItem } from "@/lib/data";

// 떡집 매출 시즌 배너. 큰 배너 = importance ≥ 8 (추석/설/어버이날) 1건,
// 아래 컴팩트 행 = importance ≥ 5 (정월대보름/한식/스승의날/동지/크리스마스 등) 추가 2~3건.

interface Props {
  events?: EventItem[];
}

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return Math.round(n).toLocaleString();
}

export default function SeasonBanner({ events = [] }: Props) {
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

  const [modalSeason, setModalSeason] = useState<{ name: string; date: string } | null>(null);

  function findLastYearEvents(seasonDate: string): EventItem[] {
    // 시즌 날짜의 1년 전 ±14일 사이에 sale_start 가 있는 행사
    const d = new Date(seasonDate);
    if (isNaN(d.getTime())) return [];
    const target = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    const lo = new Date(target.getTime() - 14 * 24 * 60 * 60 * 1000);
    const hi = new Date(target.getTime() + 14 * 24 * 60 * 60 * 1000);
    return events
      .filter((e) => {
        if (!e.sale_start) return false;
        const s = new Date(e.sale_start);
        return !isNaN(s.getTime()) && s >= lo && s <= hi;
      })
      .sort((a, b) => (b.sales?.totals?.sale ?? 0) - (a.sales?.totals?.sale ?? 0));
  }

  if (!data.primary && data.secondary.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {data.primary && (() => {
        const within90 = data.primary.days <= 90;
        const season = data.primary;
        return (
          <button
            type="button"
            onClick={() => setModalSeason({ name: season.name, date: season.date })}
            className={`w-full text-left rounded p-4 flex items-center justify-between hover:brightness-105 transition ${
              within90
                ? "bg-gradient-to-r from-rose-100 to-amber-100 border-2 border-rose-400"
                : "bg-slate-100 border border-slate-200"
            }`}
            title="클릭 → 작년 동기 행사 보기"
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
          </button>
        );
      })()}

      {data.secondary.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500">📌 다음 시즌</span>
          {data.secondary.map((s) => {
            const isClose = s.days <= 30;
            return (
              <button
                key={s.date}
                type="button"
                onClick={() => setModalSeason({ name: s.name, date: s.date })}
                className={`px-2 py-1 rounded border flex items-center gap-1.5 hover:brightness-105 ${
                  isClose
                    ? "bg-amber-50 border-amber-300 text-amber-900"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                title={`${s.date} · 클릭 → 작년 동기 행사 보기`}
              >
                <span>{s.name}</span>
                <span className={`font-mono font-extrabold tabular-nums ${
                  s.days <= 14 ? "text-red-600" : s.days <= 30 ? "text-rose-600" : "text-slate-500"
                }`}>
                  D-{s.days}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {modalSeason && (() => {
        const lastYear = findLastYearEvents(modalSeason.date);
        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
            onClick={() => setModalSeason(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b p-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-slate-900">📅 {modalSeason.name} 작년 동기 행사</div>
                  <div className="text-xs text-slate-500 mt-1">시즌 {modalSeason.date} 의 1년 전 ±14일 sale_start 행사</div>
                </div>
                <button
                  onClick={() => setModalSeason(null)}
                  className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 rounded"
                >
                  닫기
                </button>
              </div>
              <div className="p-4">
                {lastYear.length === 0 ? (
                  <div className="text-sm text-slate-500 py-6 text-center">작년 동시즌 등록 행사가 없습니다.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 border-b">
                      <tr>
                        <th className="text-left py-1.5">제목</th>
                        <th className="text-left py-1.5">채널</th>
                        <th className="text-right py-1.5">매출</th>
                        <th className="text-right py-1.5">마진%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastYear.map((e) => {
                        const sale = e.sales?.totals?.sale ?? 0;
                        const op = e.sales?.totals?.operating_profit ?? 0;
                        const m = sale > 0 ? (op / sale) * 100 : 0;
                        return (
                          <tr key={e.dedup_id} className="border-b hover:bg-slate-50">
                            <td className="py-1.5">
                              <a className="text-blue-700 hover:underline" href={`/?selected=${e.dedup_id.slice(0, 6)}`}>
                                {e.title?.slice(0, 60) || "(제목없음)"}
                              </a>
                            </td>
                            <td className="py-1.5 text-slate-600">{e.channel_key}</td>
                            <td className="py-1.5 text-right font-semibold">{sale ? fmt(sale) : "-"}</td>
                            <td className="py-1.5 text-right">{sale ? m.toFixed(1) + "%" : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
