/**
 * 한국 명절 + 기념일 + 떡집 매출 시즌.
 * importance 는 떡집 매출 영향도 (0~10). 추석/설 = 10, 어버이날 = 9 등.
 */

export interface Season {
  date: string; // YYYY-MM-DD
  name: string;
  type: "holiday" | "memorial" | "season";
  importance: number;
}

// 2026-05-21 기준 — 매년 추가/조정 필요 (음력은 계산 복잡해서 하드코딩)
export const SEASONS: Season[] = [
  // 2026
  { date: "2026-05-05", name: "어린이날", type: "holiday", importance: 5 },
  { date: "2026-05-08", name: "어버이날", type: "memorial", importance: 9 },
  { date: "2026-05-15", name: "스승의날", type: "memorial", importance: 6 },
  { date: "2026-06-06", name: "현충일", type: "holiday", importance: 2 },
  { date: "2026-07-17", name: "제헌절", type: "holiday", importance: 1 },
  { date: "2026-08-15", name: "광복절", type: "holiday", importance: 3 },
  { date: "2026-09-24", name: "추석연휴 시작", type: "holiday", importance: 10 },
  { date: "2026-09-25", name: "추석", type: "holiday", importance: 10 },
  { date: "2026-09-26", name: "추석연휴", type: "holiday", importance: 9 },
  { date: "2026-10-03", name: "개천절", type: "holiday", importance: 2 },
  { date: "2026-10-09", name: "한글날", type: "holiday", importance: 2 },
  { date: "2026-12-21", name: "동지(팥죽철)", type: "season", importance: 6 },
  { date: "2026-12-25", name: "크리스마스", type: "memorial", importance: 4 },
  // 2027
  { date: "2027-01-01", name: "신정", type: "holiday", importance: 5 },
  { date: "2027-02-06", name: "설날연휴 시작", type: "holiday", importance: 10 },
  { date: "2027-02-07", name: "설날", type: "holiday", importance: 10 },
  { date: "2027-02-08", name: "설날연휴", type: "holiday", importance: 9 },
  { date: "2027-03-01", name: "삼일절", type: "holiday", importance: 2 },
  { date: "2027-03-02", name: "정월대보름", type: "season", importance: 7 },
  { date: "2027-04-05", name: "한식(떡 시즌)", type: "season", importance: 5 },
  { date: "2027-05-05", name: "어린이날", type: "holiday", importance: 5 },
  { date: "2027-05-08", name: "어버이날", type: "memorial", importance: 9 },
];

export function seasonForDate(yyyyMmDd: string): Season | null {
  return SEASONS.find((s) => s.date === yyyyMmDd) || null;
}

export function nextSeasons(now: Date, limit = 4, minImportance = 5): Season[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return SEASONS
    .filter((s) => s.date >= today && s.importance >= minImportance)
    .slice(0, limit);
}

export function daysFromToday(yyyyMmDd: string, today: Date = new Date()): number {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - t.getTime()) / 86400000);
}
