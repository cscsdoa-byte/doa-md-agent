import Link from "next/link";
import MatrixView from "@/components/MatrixView";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

interface ProductKb {
  category?: string;
  channel_urls?: Record<string, string>;
}

export default async function MatrixPage() {
  const payload = await loadEvents().catch(() => null);
  const kb: Record<string, ProductKb> = (payload as { product_kb?: Record<string, ProductKb> })?.product_kb ?? {};
  const products = Object.keys(kb);

  // 모든 등록된 채널 + 표준 채널 합집합
  const STANDARD_CHANNELS = [
    "자사몰", "스마트스토어", "쿠팡", "11번가", "토스쇼핑",
    "지마켓", "옥션", "카카오톡스토어",
    "NS홈쇼핑", "쇼핑엔티", "CJ온스타일", "롯데홈쇼핑",
    "K쇼핑", "공영홈쇼핑", "신세계홈쇼핑", "홈쇼핑모아",
    "인스타그램", "유튜브", "네이버블로그", "페이스북",
  ];
  const usedChannels = new Set<string>();
  for (const p of Object.values(kb)) {
    for (const c of Object.keys(p?.channel_urls ?? {})) usedChannels.add(c);
  }
  // 표준 + 사용 중 채널 머지 (순서 유지)
  const channels = [...STANDARD_CHANNELS, ...Array.from(usedChannels).filter((c) => !STANDARD_CHANNELS.includes(c))];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🧩 상품 × 채널 매트릭스</h1>
            <p className="text-sm text-slate-500 mt-1">
              한눈에 — 어느 상품이 어느 채널에 등록되어 있는지. 셀 클릭 → 소비자 페이지 새 탭.
              <Link href="/products" className="text-blue-600 hover:underline ml-1">📦 상품 페이지</Link> 에서 URL 추가·편집.
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 메인
          </Link>
        </header>

        <MatrixView products={products} channels={channels} kb={kb} />
      </div>
    </main>
  );
}
