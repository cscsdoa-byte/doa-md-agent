import type { EventItem } from "@/lib/data";

interface Props {
  events: EventItem[];
}

// MD별(md_owner_name) 행사 성과 미니 위젯.
// 운영 중·종료된 행사(sale_start 있는 행사)만 집계.
const COUNTED = new Set(["applied", "selected", "running", "closed"]);

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

export default function MdPL({ events }: Props) {
  type Agg = {
    name: string;
    total: number;
    running: number;
    sale: number;
    op: number;
    ad: number;
  };
  const byMd: Record<string, Agg> = {};
  for (const e of events) {
    if (!COUNTED.has(e.status)) continue;
    if (!e.sale_start || !e.sale_end) continue;
    const owner = (e.md_owner_name && e.md_owner_name.trim()) || "(미지정)";
    if (!byMd[owner]) {
      byMd[owner] = { name: owner, total: 0, running: 0, sale: 0, op: 0, ad: 0 };
    }
    const a = byMd[owner];
    a.total++;
    if (e.status === "running") a.running++;
    a.sale += e.sales?.totals?.sale ?? 0;
    a.op += e.sales?.totals?.operating_profit ?? 0;
    a.ad += e.ad_spend_manual ?? 0;
  }
  const rows = Object.values(byMd).sort((a, b) => b.sale - a.sale);
  if (rows.length === 0) return null;
  const maxSale = Math.max(...rows.map((r) => r.sale), 1);

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold text-slate-700 mb-2">
        👤 MD별 행사 성과 ({rows.length}명) — 진행·종료 행사 합계
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {rows.map((r) => {
          const margin = r.sale > 0 ? (r.op / r.sale) * 100 : 0;
          const roas = r.ad > 0 ? r.sale / r.ad : 0;
          const net = r.op - r.ad;
          const sharePct = (r.sale / maxSale) * 100;
          return (
            <div key={r.name} className="bg-white border border-slate-200 border-l-4 border-l-slate-400 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-slate-900 text-base">{r.name}</div>
                <div className="text-[10px] bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-bold">
                  {r.total}건 {r.running > 0 && <span className="text-pink-700">· 진행 {r.running}</span>}
                </div>
              </div>
              {/* 매출 비교 막대 — 가장 큰 MD 100% 기준 */}
              {r.sale > 0 && (
                <div className="mb-2">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600" style={{ width: `${sharePct}%` }} />
                  </div>
                </div>
              )}
              <div className="text-xs grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div>
                  <span className="text-slate-500">매출 </span>
                  <b className="text-amber-800">{fmt(r.sale)}</b>원
                </div>
                <div>
                  <span className="text-slate-500">영업이익 </span>
                  <b className="text-emerald-700">{fmt(r.op)}</b>원
                </div>
                <div>
                  <span className="text-slate-500">광고비 </span>
                  <b className="text-rose-600">{fmt(r.ad)}</b>원
                </div>
                <div>
                  <span className="text-slate-500">마진 </span>
                  <b className={margin >= 10 ? "text-emerald-700" : margin >= 0 ? "text-amber-700" : "text-rose-600"}>
                    {margin.toFixed(1)}%
                  </b>
                </div>
                {r.ad > 0 && (
                  <>
                    <div>
                      <span className="text-slate-500">ROAS </span>
                      <b className={roas >= 3 ? "text-emerald-700" : roas >= 2 ? "text-amber-700" : "text-rose-600"}>
                        {roas.toFixed(2)}배
                      </b>
                    </div>
                    <div>
                      <span className="text-slate-500">실순이익 </span>
                      <b className={net >= 0 ? "text-emerald-700" : "text-rose-600"}>{fmt(net)}</b>원
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
