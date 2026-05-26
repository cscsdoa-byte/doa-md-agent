import Link from "next/link";
import StatsView from "@/components/StatsView";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const payload = await loadEvents();

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📈 행사 ROI 통계</h1>
            <p className="text-sm text-slate-500 mt-1">
              종료·진행 행사 데이터로 채널·카테고리·행사유형별 ROI 한눈에. 도아 적합 행사 판단용.
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 캘린더
          </Link>
        </header>

        <StatsView events={payload.events} />
      </div>
    </main>
  );
}
