import TemplatesManager from "@/components/TemplatesManager";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [payload, channels] = await Promise.all([loadEvents(), loadChannels()]);
  const salesChannels = channels.filter((c) => c.is_sales);
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🔁 반복 행사 템플릿</h1>
            <p className="text-sm text-slate-500 mt-1">
              주간/월간 정례 행사를 한 번 등록 → 매번 새 행사 만들 때 자동으로 채워줍니다.
            </p>
          </div>
          <a href="/" className="text-sm text-blue-600 hover:underline">← 캘린더로</a>
        </header>
        <TemplatesManager
          templates={payload.templates ?? []}
          channels={salesChannels}
        />
      </div>
    </main>
  );
}
