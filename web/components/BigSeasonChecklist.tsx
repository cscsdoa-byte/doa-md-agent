"use client";

import { useMemo } from "react";
import { nextSeasons } from "@/lib/season";
import type { ChannelDef } from "@/lib/channels";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  events: EventItem[];
  channels: ChannelDef[];
}

// D-60 이내 중요시즌(importance≥9, 추석/설/어버이날 등) 행사 신청 체크리스트.
// 8개 판매채널 중 시즌 ±14일 sale_start 행사 없는 채널을 빨간 점으로 가시화.
const COUNTED = new Set(["applied", "selected", "running", "closed"]);

export default function BigSeasonChecklist({ events, channels }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    // 가장 가까운 importance≥9 시즌 1개
    const upcoming = nextSeasons(now, 1, 9)[0];
    if (!upcoming) return null;
    const seasonDate = new Date(upcoming.date);
    const daysLeft = Math.ceil((seasonDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    // D-120 이내일 때만 표시 (추석/설 D-100쯤부터 사전 컨택)
    if (daysLeft > 120 || daysLeft < -3) return null;

    // 시즌 ±14일 범위 (시즌 전 14일 ~ 후 14일)
    const lo = new Date(seasonDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    const hi = new Date(seasonDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    // 채널별 시즌 행사 카운트
    const byChannel: Record<string, { applied: number; running: number; closed: number; selected: number }> = {};
    for (const e of events) {
      if (!COUNTED.has(e.status)) continue;
      if (!e.sale_start) continue;
      const s = new Date(e.sale_start);
      if (isNaN(s.getTime()) || s < lo || s > hi) continue;
      const k = e.channel_key;
      if (!byChannel[k]) byChannel[k] = { applied: 0, running: 0, closed: 0, selected: 0 };
      const a = byChannel[k];
      if (e.status === "applied") a.applied++;
      else if (e.status === "selected") a.selected++;
      else if (e.status === "running") a.running++;
      else if (e.status === "closed") a.closed++;
    }

    const salesChannels = channels.filter((c) => c.is_sales);
    return { upcoming, daysLeft, byChannel, salesChannels };
  }, [events, channels]);

  if (!data) return null;
  const { upcoming, daysLeft, byChannel, salesChannels } = data;
  const missingCount = salesChannels.filter((c) => !byChannel[c.key]).length;

  return (
    <div className="mb-4 bg-gradient-to-r from-amber-50 to-rose-50 border-2 border-amber-400 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-base font-bold text-rose-900">
            🎯 {upcoming.name} 행사 신청 체크 — D-{daysLeft}
          </div>
          <div className="text-[11px] text-rose-700 mt-0.5">
            시즌 ±14일 sale_start 행사 기준 · {missingCount > 0 ? `미신청 ${missingCount}개 채널` : "모든 판매채널 신청 완료 ✅"}
          </div>
        </div>
        <div className="text-[10px] text-amber-700">
          ⏰ {upcoming.date} ({daysLeft <= 30 ? "임박 — 진행 단계" : daysLeft <= 60 ? "신청 단계" : daysLeft <= 90 ? "준비 시작" : "사전 컨택"})
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {salesChannels.map((c) => {
          const agg = byChannel[c.key];
          const th = themeOf(c.key);
          const hasAny = !!agg;
          const total = agg ? agg.applied + agg.selected + agg.running + agg.closed : 0;
          return (
            <div
              key={c.key}
              className={`rounded p-2 border-2 ${
                hasAny
                  ? "bg-emerald-50 border-emerald-300"
                  : "bg-white border-rose-300"
              }`}
              title={hasAny ? `${total}건 등록됨` : "이 시즌 미신청 — 행사 등록 필요"}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span className={`font-mono font-extrabold text-[11px] ${th.bold}`}>{th.abbr}</span>
                <span className="text-[11px] font-semibold truncate flex-1">{c.name.split(" ")[0]}</span>
                {hasAny ? (
                  <span className="text-emerald-600 text-xs">✅</span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" aria-label="미신청"></span>
                )}
              </div>
              {hasAny ? (
                <div className="text-[10px] text-slate-600 flex flex-wrap gap-1">
                  {agg.applied > 0 && <span className="text-blue-700">📨{agg.applied}</span>}
                  {agg.selected > 0 && <span className="text-violet-700">✅{agg.selected}</span>}
                  {agg.running > 0 && <span className="text-pink-700">🔴{agg.running}</span>}
                  {agg.closed > 0 && <span className="text-slate-500">🏁{agg.closed}</span>}
                </div>
              ) : (
                <div className="text-[10px] text-rose-700 font-semibold">미신청</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
