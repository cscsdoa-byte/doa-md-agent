import Link from "next/link";
import SuppliersManager from "@/components/SuppliersManager";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const payload = await loadEvents();
  const suppliers = payload.sourcing?.suppliers ?? [];
  const labels = payload.sourcing?.status_labels?.supplier ?? {};
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🏭 공급처 마스터</h1>
            <p className="text-sm text-slate-500 mt-1">
              떡·한과 공장 후보 DB. 신제품 컨택은 <Link className="text-blue-600 hover:underline" href="/sourcing">소싱 보드</Link>에서.
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/sourcing" className="text-blue-600 hover:underline">소싱 보드 →</Link>
            <Link href="/" className="text-blue-600 hover:underline">← 캘린더로</Link>
          </div>
        </header>
        <SuppliersManager suppliers={suppliers} statusLabels={labels} />
      </div>
    </main>
  );
}
