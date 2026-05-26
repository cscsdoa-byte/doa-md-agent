/**
 * 카니발리제이션(카니발 자기잠식) 검출.
 *
 * 정의: 같은 SKU가 같은 기간에 다른 채널에 동시 진행 = 매출이 한쪽으로 쏠리지 않고
 * 분산되어 행사 효과 반감 + 채널 간 가격 분쟁 위험.
 *
 * 회의록(2026-05-20): "네이버와 카카오 겹치면 안 됨. 다른 채널은 겹쳐도 됨" →
 * BLOCKED_PAIRS 에 등록된 채널 쌍에서만 카니발 표시.
 */

import type { EventItem } from "./data";

export interface Conflict {
  /** 충돌 상대 행사 id */
  other_id: string;
  other_short: string;
  other_title: string;
  other_channel: string;
  /** 겹치는 SKU id 들 */
  common_skus: number[];
}

const ACTIVE = new Set(["new", "reviewing", "applied", "selected", "running"]);

// 카니발 금지 채널 페어 (양방향). 새 룰 추가 시 [a,b] 한 줄.
const BLOCKED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["naver_smartstore", "kakao_talkstore"],
];
const BLOCKED_SET = new Set<string>(
  BLOCKED_PAIRS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
);

function isBlocked(chA: string, chB: string): boolean {
  return BLOCKED_SET.has(`${chA}|${chB}`);
}

function periodOverlaps(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  // ISO 비교는 lexicographic 으로 가능
  return !(aEnd.slice(0, 10) < bStart.slice(0, 10) || bEnd.slice(0, 10) < aStart.slice(0, 10));
}

export function detectConflicts(events: EventItem[]): Map<string, Conflict[]> {
  const map = new Map<string, Conflict[]>();
  for (const a of events) {
    if (!ACTIVE.has(a.status)) continue;
    if (!a.applied_skus.length) continue;
    if (!a.sale_start || !a.sale_end) continue;
    const aSkus = new Set(a.applied_skus.map((s) => s.sku_id));
    for (const b of events) {
      if (a.dedup_id === b.dedup_id) continue;
      if (a.channel_key === b.channel_key) continue; // 같은 채널은 충돌 아님
      if (!isBlocked(a.channel_key, b.channel_key)) continue; // BLOCKED_PAIRS 만 카니발로 검출
      if (!ACTIVE.has(b.status)) continue;
      if (!b.applied_skus.length) continue;
      if (!periodOverlaps(a.sale_start, a.sale_end, b.sale_start, b.sale_end)) continue;
      const common = b.applied_skus.filter((s) => aSkus.has(s.sku_id)).map((s) => s.sku_id);
      if (common.length === 0) continue;
      const list = map.get(a.dedup_id) ?? [];
      list.push({
        other_id: b.dedup_id,
        other_short: b.dedup_id.slice(0, 6),
        other_title: b.title,
        other_channel: b.channel_key,
        common_skus: common,
      });
      map.set(a.dedup_id, list);
    }
  }
  return map;
}
