import Link from "next/link";
import SourcingBoard from "@/components/SourcingBoard";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SourcingPage() {
  const payload = await loadEvents();
  const s = payload.sourcing;
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🧭 신제품 소싱 보드</h1>
            <p className="text-sm text-slate-500 mt-1">
              신제품별 공급처(공장) 컨택 진척을 한 화면에서. 발송→답변→샘플→단가협상→확정.
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/sourcing/suppliers" className="text-blue-600 hover:underline">공급처 마스터 →</Link>
            <Link href="/" className="text-blue-600 hover:underline">← 캘린더로</Link>
          </div>
        </header>
        <SourcingBoard
          suppliers={s?.suppliers ?? []}
          products={s?.products ?? []}
          contacts={s?.contacts ?? []}
          contactLabels={s?.status_labels?.contact ?? {}}
          productLabels={s?.status_labels?.product ?? {}}
        />
      </div>
    </main>
  );
}
