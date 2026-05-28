import Link from "next/link";
import OpsBoard from "@/components/OpsBoard";
import { detectConflicts } from "@/lib/conflict";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

// 운영 보드 = 진행중·선정·선정대기(applied) + 최근(14일 이내) 종료까지 후보로 묶어 보냄.
// 보드 client 컴포넌트가 상태 토글로 필터.
const ACTIVE_STATUSES = new Set(["running", "selected"]);
const PENDING_STATUSES = new Set(["applied"]);
const CLOSED_LOOKBACK_DAYS = 14;

export default async function OpsPage() {
  const payload = await loadEvents();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() - CLOSED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const items = payload.events
    .filter((e) => {
      if (ACTIVE_STATUSES.has(e.status)) return true;
      if (PENDING_STATUSES.has(e.status)) return true;
      if (e.status === "closed" && e.sale_end) {
        const end = new Date(e.sale_end);
        end.setHours(0, 0, 0, 0);
        return !isNaN(end.getTime()) && end >= cutoff && end <= today;
      }
      return false;
    })
    .sort((a, b) => {
      // running → selected → applied(선정대기) → closed 순, 그 안에서 종료 임박순
      const order = { running: 0, selected: 1, applied: 2, closed: 3 } as Record<string, number>;
      const oa = order[a.status] ?? 99;
      const ob = order[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      const ae = a.sale_end ?? "9999";
      const be = b.sale_end ?? "9999";
      return ae.localeCompare(be);
    });

  const activeCount = items.filter((e) => ACTIVE_STATUSES.has(e.status)).length;
  const pendingCount = items.filter((e) => PENDING_STATUSES.has(e.status)).length;
  const closedCount = items.length - activeCount - pendingCount;

  // 카니발 충돌은 전체 events 로 계산
  const conflictMap = detectConflicts(payload.events);
  const conflictsByEvent: Record<
    string,
    { other_short: string; other_title: string; other_channel: string; common_skus: number[] }[]
  > = {};
  for (const ev of items) {
    const list = conflictMap.get(ev.dedup_id) ?? [];
    if (list.length > 0) conflictsByEvent[ev.dedup_id] = list;
  }
  const generatedAt = payload.generated_at?.slice(0, 16).replace("T", " ") ?? "";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🛠️ 진행중 행사 운영 보드</h1>
            <p className="text-sm text-slate-500 mt-1">
              데이터 갱신: {generatedAt} · 진행·선정 {activeCount}건
              {pendingCount > 0 && ` · 📨 선정 대기 ${pendingCount}건`}
              {closedCount > 0 && ` · 최근 종료 ${closedCount}건 (회고 트래킹)`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/"
              className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              ← 캘린더
            </Link>
            <Link
              href="/events"
              className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              📊 행사 표
            </Link>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="bg-white border rounded p-8 text-center text-slate-500">
            진행중·선정·선정 대기 상태 행사 없음 — 캘린더에서 행사 상태를 "신청완료" 또는 "진행중"으로 바꾸면 여기로 들어옵니다.
          </div>
        ) : (
          <OpsBoard events={items} conflicts={conflictsByEvent} />
        )}
      </div>
    </main>
  );
}
