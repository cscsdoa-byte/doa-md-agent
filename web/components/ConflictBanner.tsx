"use client";

import { useRouter } from "next/navigation";
import type { EventItem } from "@/lib/data";
import { detectConflicts } from "@/lib/conflict";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  events: EventItem[];
}

export default function ConflictBanner({ events }: Props) {
  const router = useRouter();
  const conflicts = detectConflicts(events);
  if (conflicts.size === 0) return null;

  // 중복 제거 — (a, b) 와 (b, a) 가 둘 다 잡힘 → 정렬 후 1쌍만
  const pairsSeen = new Set<string>();
  const pairs: Array<{
    a: EventItem;
    b_id: string;
    b_short: string;
    b_title: string;
    b_channel: string;
    common_skus: number[];
  }> = [];
  for (const [aId, list] of conflicts) {
    const a = events.find((e) => e.dedup_id === aId);
    if (!a) continue;
    for (const c of list) {
      const key = [aId, c.other_id].sort().join("|");
      if (pairsSeen.has(key)) continue;
      pairsSeen.add(key);
      pairs.push({
        a,
        b_id: c.other_id,
        b_short: c.other_short,
        b_title: c.other_title,
        b_channel: c.other_channel,
        common_skus: c.common_skus,
      });
    }
  }

  return (
    <div className="mb-4 bg-rose-50 border-2 border-rose-400 rounded p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-base font-bold text-rose-900">⚡ 카니발리제이션 경고 ({pairs.length}쌍)</div>
        <div className="text-[11px] text-rose-700">같은 SKU · 같은 기간 · 네이버↔카카오 충돌 — 매출 분산 위험</div>
      </div>
      <ul className="space-y-1.5">
        {pairs.map((p) => {
          const thA = themeOf(p.a.channel_key);
          const thB = themeOf(p.b_channel);
          return (
            <li key={`${p.a.dedup_id}-${p.b_id}`} className="bg-white rounded p-2 text-xs flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`font-mono font-extrabold ${thA.bold}`}>{thA.abbr}</span>
                  <span className="truncate">{p.a.title}</span>
                  <span className="text-rose-500 font-bold">⚡</span>
                  <span className={`font-mono font-extrabold ${thB.bold}`}>{thB.abbr}</span>
                  <span className="truncate">{p.b_title}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  공통 SKU: {p.common_skus.length}개 (#{p.common_skus.slice(0, 5).join(", #")}{p.common_skus.length > 5 ? "..." : ""})
                  {p.a.sale_start && p.a.sale_end && (
                    <> · {p.a.sale_start.slice(0, 10)} ~ {p.a.sale_end.slice(0, 10)}</>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => router.push(`/?selected=${p.a.dedup_id}`)}
                  className="text-[10px] px-2 py-1 bg-slate-100 rounded hover:bg-slate-200"
                >
                  A 열기
                </button>
                <button
                  onClick={() => router.push(`/?selected=${p.b_id}`)}
                  className="text-[10px] px-2 py-1 bg-slate-100 rounded hover:bg-slate-200"
                >
                  B 열기
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="text-[10px] text-rose-700 mt-2">
        💡 해결 방법: 한쪽 행사 status=skip 으로 패스, 또는 sale_start/end 어긋나게 조정, 또는 적용 SKU 변경
      </div>
    </div>
  );
}
