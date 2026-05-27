import Link from "next/link";
import { notFound } from "next/navigation";
import ReportCard from "@/components/ReportCard";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await loadEvents();
  const event = payload.events.find((e) => e.dedup_id === id || e.dedup_id.startsWith(id));
  if (!event) notFound();

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">📸 행사 결과 리포트</h1>
            <p className="text-xs text-slate-500 mt-1">PNG 다운로드 → 사장님 보고 / 카톡 / 노션 붙여넣기</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/?selected=${event.dedup_id}`} className="px-3 py-1.5 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
              ← 캘린더
            </Link>
            <Link href="/events" className="px-3 py-1.5 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
              표
            </Link>
          </div>
        </header>

        <ReportCard event={event} />
      </div>
    </main>
  );
}
