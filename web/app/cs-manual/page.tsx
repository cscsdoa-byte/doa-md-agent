import Link from "next/link";
import CsManualPanel from "@/components/CsManualPanel";
import { CS_MANUAL } from "@/lib/cs-manual";

export const dynamic = "force-dynamic";

export default function CsManualPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📖 CS 답변 매뉴얼</h1>
            <p className="text-sm text-slate-500 mt-1">
              인입 메시지 붙여넣기 → 카테고리 자동 매칭 + 답변 템플릿 + AI 답변 안 (Claude)
              · 톤A · {`{고객명}`} 변수 표기 · 신선식품 정책
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 메인
          </Link>
        </header>
        <CsManualPanel items={CS_MANUAL} />
      </div>
    </main>
  );
}
