import Link from "next/link";
import OpsBoard from "@/components/OpsBoard";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

// 진행중·선정 행사만 모아 한눈에 운영 — 5종세트(매출/광고/재고/캡쳐/클레임) 카드 뷰.
const OPS_STATUSES = new Set(["running", "selected"]);

export default async function OpsPage() {
  const payload = await loadEvents();
  const items = payload.events
    .filter((e) => OPS_STATUSES.has(e.status))
    .sort((a, b) => {
      // running 먼저, 그 다음 종료 임박순
      if (a.status !== b.status) return a.status === "running" ? -1 : 1;
      const ae = a.sale_end ?? "9999";
      const be = b.sale_end ?? "9999";
      return ae.localeCompare(be);
    });
  const generatedAt = payload.generated_at?.slice(0, 16).replace("T", " ") ?? "";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🛠️ 진행중 행사 운영 보드</h1>
            <p className="text-sm text-slate-500 mt-1">
              데이터 갱신: {generatedAt} · 진행중·선정 {items.length}건
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            진행중·선정 상태 행사 없음 — 캘린더에서 행사 상태를 "진행중"으로 바꾸면 여기로 들어옵니다.
          </div>
        ) : (
          <OpsBoard events={items} />
        )}
      </div>
    </main>
  );
}
