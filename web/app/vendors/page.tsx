import Link from "next/link";
import VendorsTable from "@/components/VendorsTable";
import SkuMatrix from "@/components/SkuMatrix";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";
import { fetchSettleFacets, getAllSkus } from "@/lib/settle";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const [payload, yamlChannels, settleFacets, skus] = await Promise.all([
    loadEvents(),
    loadChannels(),
    fetchSettleFacets().catch(() => ({ channels: [] as string[] })),
    getAllSkus().catch(() => []),
  ]);

  const channels = payload.channels_master ?? [];
  const skuLite = skus.map((s) => ({
    id: s.id,
    product_name: s.product_name,
    cost: s.cost,
    sale_price: s.sale_price,
  }));

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📦 채널 마스터</h1>
            <p className="text-sm text-slate-500 mt-1">
              우리가 판매·관리하는 채널 전체 목록.
              정산자동화웹 facets ({settleFacets.channels.length}개) · yaml 어댑터 ({yamlChannels.length}개) ↔ 마스터 ({channels.length}개)
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 캘린더
          </Link>
        </header>

        <VendorsTable
          channels={channels}
          settleChannels={settleFacets.channels}
          yamlChannels={yamlChannels.map((y) => ({ key: y.key, name: y.name, is_sales: y.is_sales }))}
          events={payload.events}
        />

        {/* SKU × 채널 입점 매트릭스 */}
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900">🧩 SKU × 채널 입점 매트릭스</h2>
            <div className="text-xs text-slate-500">정산자동화웹 SKU {skuLite.length}개 × 판매채널 {channels.filter((c) => c.is_sales).length}개</div>
          </div>
          {skuLite.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
              ⚠️ 정산자동화웹 SKU 목록 호출 실패. 토큰 갱신 필요할 수도.
            </div>
          ) : (
            <SkuMatrix skus={skuLite} channels={channels} />
          )}
        </div>

        <div className="mt-4 text-[11px] text-slate-500 space-y-0.5">
          <div>※ <b>출처</b>: <code>settle</code>=정산자동화웹 동기화 · <code>yaml</code>=어댑터 정의 · <code>manual</code>=수동 추가 (NS홈쇼핑 등)</div>
          <div>※ <b>수수료/상태/우선순위/메모/URL</b> 은 클릭/포커스해서 직접 편집 — 빠지면 자동 저장됩니다</div>
          <div>※ <b>수수료율</b> 채우면 메인 보드의 영업이익(보수)·면제 공제(+) 계산이 정확해집니다 (홈쇼핑은 30~38% 일반)</div>
          <div>※ 정산자동화웹에서 가져온 채널 동기화: 서버에서 <code className="bg-slate-100 px-1 rounded">uv run python -m crawler.run sync-channels</code></div>
        </div>
      </div>
    </main>
  );
}
