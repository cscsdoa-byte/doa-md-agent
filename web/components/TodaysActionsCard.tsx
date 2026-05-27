"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  events: EventItem[];
}

function daysFromToday(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

interface ActionGroup {
  key: string;
  icon: string;
  label: string;
  color: string;
  events: { e: EventItem; meta: string }[];
}

export default function TodaysActionsCard({ events }: Props) {
  const groups = useMemo<ActionGroup[]>(() => {
    const out: ActionGroup[] = [];

    // 1) 마감 D-3 이내 (status applied/selected/new/reviewing — 액션 필요한 단계)
    const deadlineSoon: { e: EventItem; meta: string }[] = [];
    // 2) 진행 시작 D-1/D-0 (selected → running 전환 준비)
    const startSoon: { e: EventItem; meta: string }[] = [];
    // 3) 오늘 종료/내일 종료 (running → 매출 매칭 + 회고 트래킹)
    const endingNow: { e: EventItem; meta: string }[] = [];
    // 4) 진행 중인데 광고비 미입력
    const adMissing: { e: EventItem; meta: string }[] = [];
    // 5) running 인데 매출 0 (정산자동화웹 매출 매칭 안 됨)
    const salesPending: { e: EventItem; meta: string }[] = [];

    for (const e of events) {
      // 마감 임박
      if (
        (e.status === "new" || e.status === "reviewing" || e.status === "applied" || e.status === "selected") &&
        e.deadline_at
      ) {
        const d = daysFromToday(e.deadline_at);
        if (d !== null && d >= 0 && d <= 3) {
          deadlineSoon.push({ e, meta: `마감 D-${d}` });
        }
      }
      // 진행 시작 임박 (selected + 진행 시작 D-1/D-0)
      if (e.status === "selected" && e.sale_start) {
        const d = daysFromToday(e.sale_start);
        if (d !== null && d >= 0 && d <= 1) {
          startSoon.push({ e, meta: `진행 시작 D-${d}` });
        }
      }
      // 오늘/내일 종료
      if (e.status === "running" && e.sale_end) {
        const d = daysFromToday(e.sale_end);
        if (d !== null && d >= 0 && d <= 1) {
          endingNow.push({ e, meta: `종료 D-${d}` });
        }
      }
      // 진행 중 광고비 미입력
      if (e.status === "running" && (e.ad_spend_manual === null || e.ad_spend_manual === 0)) {
        adMissing.push({ e, meta: "광고비 미입력" });
      }
      // 진행 중 매출 미매칭
      if (e.status === "running" && (!e.sales?.totals?.sale || e.sales.totals.sale === 0)) {
        salesPending.push({ e, meta: "매출 미매칭" });
      }
    }

    if (deadlineSoon.length > 0) out.push({ key: "deadline", icon: "⏰", label: "신청·검토 마감 임박 (D-3 이내)", color: "rose", events: deadlineSoon });
    if (startSoon.length > 0) out.push({ key: "start", icon: "🚀", label: "진행 시작 임박 — running 전환 + 광고 셋업", color: "amber", events: startSoon });
    if (endingNow.length > 0) out.push({ key: "ending", icon: "🏁", label: "종료 임박 — 매출 매칭 + 회고 준비", color: "violet", events: endingNow });
    if (adMissing.length > 0) out.push({ key: "ad", icon: "💸", label: "진행 중인데 광고비 미입력", color: "slate", events: adMissing });
    if (salesPending.length > 0) out.push({ key: "sales", icon: "💰", label: "진행 중인데 매출 미매칭 — 정산자동화웹 호출 필요", color: "blue", events: salesPending });

    return out;
  }, [events]);

  if (groups.length === 0) return null;
  const totalActions = groups.reduce((s, g) => s + g.events.length, 0);

  const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    rose: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-900", badge: "bg-rose-200 text-rose-900" },
    amber: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", badge: "bg-amber-200 text-amber-900" },
    violet: { bg: "bg-violet-50", border: "border-violet-300", text: "text-violet-900", badge: "bg-violet-200 text-violet-900" },
    slate: { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-700", badge: "bg-slate-200 text-slate-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-900", badge: "bg-blue-200 text-blue-900" },
  };

  return (
    <div className="mb-4 bg-white border-2 border-slate-300 rounded-lg p-3">
      <div className="text-sm font-bold text-slate-800 mb-2 flex items-baseline justify-between">
        <span>📋 오늘 할 일 ({totalActions}건)</span>
        <span className="text-[10px] text-slate-400 font-normal">행사 클릭 → 캘린더 상세 패널</span>
      </div>
      <div className="space-y-2">
        {groups.map((g) => {
          const c = colorMap[g.color];
          return (
            <div key={g.key} className={`rounded p-2 border ${c.bg} ${c.border}`}>
              <div className={`text-xs font-bold mb-1 flex items-baseline justify-between ${c.text}`}>
                <span>{g.icon} {g.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.badge}`}>{g.events.length}건</span>
              </div>
              <ul className="space-y-0.5">
                {g.events.slice(0, 6).map(({ e, meta }) => {
                  const th = themeOf(e.channel_key);
                  return (
                    <li key={e.dedup_id}>
                      <Link
                        href={`/?selected=${e.dedup_id.slice(0, 6)}`}
                        className="text-[11px] flex items-center gap-1.5 hover:bg-white rounded px-1 py-0.5"
                      >
                        <span className={`font-mono font-extrabold text-[10px] ${th.bold}`}>{th.abbr}</span>
                        <span className="flex-1 truncate text-slate-800">{e.title}</span>
                        <span className={`text-[10px] font-bold whitespace-nowrap ${c.text}`}>{meta}</span>
                      </Link>
                    </li>
                  );
                })}
                {g.events.length > 6 && (
                  <li className="text-[10px] text-slate-500 pl-1">…외 {g.events.length - 6}건</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
