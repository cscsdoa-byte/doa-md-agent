import Link from "next/link";
import EventsTable from "@/components/EventsTable";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [payload, channels] = await Promise.all([loadEvents(), loadChannels()]);
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📊 행사 표</h1>
            <p className="text-sm text-slate-500 mt-1">
              전체 {payload.total}건 · 정렬·필터 가능. 컬럼 헤더 클릭으로 정렬.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              ← 캘린더
            </Link>
          </div>
        </header>

        <EventsTable
          events={payload.events}
          contacts={payload.contacts ?? []}
          channelOptions={channels.map((c) => ({ key: c.key, name: c.name }))}
        />
      </div>
    </main>
  );
}
