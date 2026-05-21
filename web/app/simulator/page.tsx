import { Suspense } from "react";
import Simulator from "@/components/Simulator";

export const dynamic = "force-dynamic";

export default function SimulatorPage() {
  return (
    <main className="min-h-screen bg-[#0f1117] text-[#e8e8e8] p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">📊 행사 마진 시뮬레이터</h1>
            <p className="text-xs text-[#666] mt-1">원가·판가·수수료·할인율 입력하면 수익성 즉시 계산</p>
          </div>
          <a href="/" className="text-xs text-[#5c6ef8] hover:underline">← 캘린더로</a>
        </header>
        <Suspense fallback={<div className="text-sm text-[#666]">로딩…</div>}>
          <Simulator />
        </Suspense>
      </div>
    </main>
  );
}
