import type { DashboardSummary } from "@/lib/settle";

interface Props {
  items: { brand: string; data: DashboardSummary | null }[];
}

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return Math.round(n).toLocaleString();
}

function pct(profit?: number, sale?: number): string {
  if (!profit || !sale) return "-";
  return ((profit / sale) * 100).toFixed(1) + "%";
}

export default function BrandPL({ items }: Props) {
  if (!items || items.length === 0) return null;
  const all = items.every((i) => !i.data);
  if (all) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded px-3 py-2">
        ⚠️ 정산자동화웹 호출 실패 — 토큰 갱신 필요. 브랜드 PL 표시 안 됨.
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold text-slate-700 mb-2">
        📊 이번 달 PL (정산자동화웹) — 조선팔도떡집
      </div>
      {items.map(({ brand, data }) => {
        const t = data?.totals;
        const sale = t?.real_sale ?? t?.sale_ezadmin;
        const opProfit = t?.operating_profit;
        const netProfit = t?.net_profit;
        const opMargin = pct(opProfit, sale);
        const netMargin = pct(netProfit, sale);
        return (
          <div
            key={brand}
            className="border-l-4 border-amber-500 bg-amber-50 rounded p-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1"
          >
            <div className="col-span-2 md:col-span-4 flex items-baseline justify-between mb-1">
              <div className="text-base font-bold text-amber-900">{brand}</div>
              <div className="text-[11px] text-amber-700">
                {data?.range.start} ~ {data?.range.end}
              </div>
            </div>

            {!data ? (
              <div className="col-span-2 md:col-span-4 text-xs text-slate-500">데이터 없음</div>
            ) : (
              <>
                {/* 매출 박스 */}
                <div className="bg-white rounded p-2 col-span-2 md:col-span-2">
                  <div className="text-[10px] text-slate-500 mb-0.5">실 매출</div>
                  <div className="text-lg font-bold">{fmt(sale)}원</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    주문 {fmt(t?.orders)} · 수량 {fmt(t?.qty)}
                  </div>
                </div>

                {/* 영업이익 (광고비 전) */}
                <div className="bg-white rounded p-2">
                  <div className="text-[10px] text-slate-500 mb-0.5">영업이익 <span className="text-amber-700">(광고비 전)</span></div>
                  <div className="text-sm font-bold text-emerald-700">{fmt(opProfit)}원</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">마진율 {opMargin}</div>
                </div>

                {/* 순이익 (광고비 후) */}
                <div className="bg-white rounded p-2">
                  <div className="text-[10px] text-slate-500 mb-0.5">순이익 <span className="text-rose-700">(광고비 후)</span></div>
                  <div className={`text-sm font-bold ${(netProfit ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {fmt(netProfit)}원
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">순이익률 {netMargin}</div>
                </div>

                {/* 세부 비용 */}
                <div className="col-span-2 md:col-span-4 grid grid-cols-4 gap-2 text-xs mt-1 pt-2 border-t border-amber-200">
                  <div>원가 <b>{fmt(t?.cost)}</b></div>
                  <div>수수료 <b>{fmt(t?.fee)}</b></div>
                  <div>택배비 <b>{fmt(t?.shipping)}</b></div>
                  <div>광고비 <b className="text-rose-600">{fmt(t?.ad_cost)}</b></div>
                </div>
                <div className="col-span-2 md:col-span-4 text-[10px] text-slate-500 mt-1">
                  공식: 영업이익 = 매출 − 원가 − 수수료 − 택배비 / 순이익 = 영업이익 − 광고비
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
