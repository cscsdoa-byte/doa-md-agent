import ContactsManager from "@/components/ContactsManager";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const [payload, channels] = await Promise.all([loadEvents(), loadChannels()]);
  const salesChannels = channels.filter((c) => c.is_sales);
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📇 MD 연락처</h1>
            <p className="text-sm text-slate-500 mt-1">
              채널별 담당 MD 정보. 행사 잡을 때 한 번 입력해두면 다음에 또 씁니다.
            </p>
          </div>
          <a href="/" className="text-sm text-blue-600 hover:underline">← 캘린더로</a>
        </header>
        <ContactsManager
          contacts={payload.contacts ?? []}
          channels={salesChannels}
        />
      </div>
    </main>
  );
}
