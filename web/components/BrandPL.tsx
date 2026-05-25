import type { DashboardSummary } from "@/lib/settle";

interface Props {
  items: { brand: string; data: DashboardSummary | null }[];
}

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return Math.round(n).toLocaleString();
}

function ratePct(profit?: number, sale?: number): string {
  if (!profit || !sale) return "-";
  return ((profit / sale) * 100).toFixed(1) + "%";
}

const BRAND_COLOR: Record<string, string> = {
  조선팔도떡집: "bg-amber-50 border-amber-300",
  루윈테리어: "bg-sky-50 border-sky-300",
  셀인룸: "bg-rose-50 border-rose-300",
  오트메딘: "bg-emerald-50 border-emerald-300",
};

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
      <div className="text-sm font-semibold text-slate-700 mb-2">📊 이번 달 브랜드 PL (정산자동화웹)</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {items.map(({ brand, data }) => {
          const color = BRAND_COLOR[brand] ?? "bg-slate-50 border-slate-300";
          const t = data?.totals;
          const sale = t?.real_sale ?? t?.sale_ezadmin;
          const opProfit = t?.operating_profit;
          const margin = ratePct(opProfit, sale);
          return (
            <div key={brand} className={`border-l-4 rounded p-3 ${color}`}>
              <div className="text-sm font-bold mb-1">{brand}</div>
              {!data ? (
                <div className="text-xs text-slate-500">데이터 없음</div>
              ) : (
                <div className="text-xs space-y-0.5">
                  <div>매출 <b>{fmt(sale)}</b>원</div>
                  <div>원가 {fmt(t?.cost)}</div>
                  <div>수수료 {fmt(t?.fee)}</div>
                  <div>광고비 {fmt(t?.ad_cost)}</div>
                  <div className="border-t border-slate-300 pt-0.5 mt-0.5">
                    영업이익 <b className="text-emerald-700">{fmt(opProfit)}</b>원
                  </div>
                  <div>마진율 <b>{margin}</b></div>
                  <div className="text-[10px] text-slate-500">주문 {fmt(t?.orders)} / 수량 {fmt(t?.qty)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-slate-400 mt-1">{items[0].data?.range.start} ~ {items[0].data?.range.end} · 정산자동화웹 dashboard summary</div>
    </div>
  );
}
