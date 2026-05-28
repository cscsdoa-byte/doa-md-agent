import Link from "next/link";
import ProductsPanel from "@/components/ProductsPanel";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

interface ProductKb {
  summary?: string | null;
  features?: unknown;
  storage_shelf_life?: unknown;
  packaging_options?: unknown;
  pricing_hints?: unknown;
  common_concerns?: unknown;
  pair_recommendations?: unknown;
  caveats?: unknown;
  frequent_phrases?: unknown;
  _reply_count?: number;
  _built_at?: string;
}

const PRODUCTS = [
  "두쫀모", "두바이쫀득", "두쫀쿠",
  "쑥콩버무리", "쑥콩설기", "쑥버무리",
  "밤설기", "서리태설기",
  "딸기모찌", "비타베리", "오트메딘",
];

export default async function ProductsPage() {
  const payload = await loadEvents().catch(() => null);
  const kb: Record<string, ProductKb> = (payload as { product_kb?: Record<string, ProductKb> })?.product_kb ?? {};

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📦 조선팔도떡집 상품 카탈로그</h1>
            <p className="text-sm text-slate-500 mt-1">
              자동 추출 KB (cs_messages 발신 답변 분석) · CS 답변 시 컨텍스트로 사용됨 ·
              <Link href="/cs-manual" className="text-indigo-600 hover:underline ml-1">CS 매뉴얼</Link>
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 메인
          </Link>
        </header>

        <ProductsPanel products={PRODUCTS} kb={kb} />
      </div>
    </main>
  );
}
