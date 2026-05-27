import { Suspense } from "react";
import Link from "next/link";
import Simulator from "@/components/Simulator";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  const payload = await loadEvents().catch(() => null);
  // channels_master 의 default_fee_rate 가 있는 판매채널만 preset 으로 노출
  const channelPresets = (payload?.channels_master ?? [])
    .filter((c) => c.is_sales === 1 && c.default_fee_rate !== null && c.default_fee_rate !== undefined)
    .map((c) => ({
      label: `${c.display_name} ${(c.default_fee_rate! * 100).toFixed(1)}%`,
      rate: c.default_fee_rate! * 100,
    }))
    .sort((a, b) => a.rate - b.rate);

  return (
    <main className="min-h-screen bg-[#0f1117] text-[#e8e8e8] p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">📊 행사 마진 시뮬레이터</h1>
            <p className="text-xs text-[#666] mt-1">원가·판가·수수료·할인율 입력하면 수익성 즉시 계산 · 수수료는 /vendors 등록값 자동 로드</p>
          </div>
          <Link href="/" className="text-xs text-[#5c6ef8] hover:underline">← 캘린더로</Link>
        </header>
        <Suspense fallback={<div className="text-sm text-[#666]">로딩…</div>}>
          <Simulator channelPresets={channelPresets} />
        </Suspense>
      </div>
    </main>
  );
}
