import Calendar from "@/components/Calendar";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [payload, channels] = await Promise.all([loadEvents(), loadChannels()]);
  const generatedAt = payload.generated_at?.slice(0, 16).replace("T", " ") ?? "";
  const settleBase = process.env.NEXT_PUBLIC_SETTLE_BASE_URL || "http://3.37.214.243";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📅 도아 MD 행사 캘린더</h1>
            <p className="text-sm text-slate-500 mt-1">
              데이터 갱신: {generatedAt} · 전체 {payload.total}건 · 도아 적합 {payload.doa_fit}건
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/templates"
              className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              🔁 템플릿
            </a>
            <a
              href="/contacts"
              className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              📇 MD 연락처
            </a>
            <a
              href="/simulator"
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              🧮 마진 시뮬레이터
            </a>
            <a
              href={settleBase}
              target="_blank"
              rel="noopener"
              className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              정산자동화웹 →
            </a>
          </div>
        </header>

        <Calendar
          events={payload.events}
          channels={channels}
          contacts={payload.contacts ?? []}
          templates={payload.templates ?? []}
        />

        <footer className="mt-8 text-xs text-slate-400 text-center">
          데이터는 <code>data/events.json</code> 기반. 갱신:{" "}
          <code>uv run python -m crawler.run crawl &amp;&amp; uv run python -m crawler.run dump-json</code>
        </footer>
      </div>
    </main>
  );
}
