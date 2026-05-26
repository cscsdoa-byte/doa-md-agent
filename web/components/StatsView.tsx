"use client";

import { useMemo, useState } from "react";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  events: EventItem[];
}

type GroupKey = "channel" | "category" | "event_type" | "discount_burden";

interface Agg {
  key: string;
  label: string;
  count: number;            // 종료된 행사 수
  sale: number;             // 매출 합
  op: number;               // 영업이익 합
  ad_spend: number;         // 광고비 합 (ad_spend_manual 우선)
  orders: number;
  qty: number;
}

function getAdSpend(e: EventItem): number {
  if (e.ad_spend_manual && e.ad_spend_manual > 0) return e.ad_spend_manual;
  const t = e.sales?.totals;
  if (!t) return 0;
  return t.ad_cost ?? t.ad_spend ?? 0;
}

function isMonthInRange(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

function defaultStart(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number): string {
  if (n === 0) return "-";
  return Math.round(n).toLocaleString();
}

const COUNTED_STATUSES = new Set(["closed", "running", "selected", "applied"]);

const GROUP_LABELS: Record<GroupKey, string> = {
  channel: "📡 채널별",
  category: "📂 카테고리별",
  event_type: "🎁 행사 유형별",
  discount_burden: "💸 할인 부담별",
};

export default function StatsView({ events }: Props) {
  const [periodStart, setPeriodStart] = useState(defaultStart());
  const [periodEnd, setPeriodEnd] = useState(defaultEnd());
  const [withSalesOnly, setWithSalesOnly] = useState(true);

  // 필터링
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (!COUNTED_STATUSES.has(e.status)) return false;
      if (!e.sale_start || !e.sale_end) return false;
      // 행사 기간이 period 와 겹치는지
      const ss = e.sale_start.slice(0, 10);
      const se = e.sale_end.slice(0, 10);
      if (ss > periodEnd || se < periodStart) return false;
      if (withSalesOnly && !e.sales?.totals) return false;
      return true;
    });
  }, [events, periodStart, periodEnd, withSalesOnly]);

  // 그룹별 집계
  const groupBy = (key: GroupKey): Agg[] => {
    const map: Record<string, Agg> = {};
    for (const e of filtered) {
      let groupKey: string = "(미지정)";
      let label: string = "(미지정)";
      if (key === "channel") {
        groupKey = e.channel_key;
        const th = themeOf(e.channel_key);
        label = `${th.abbr} ${th.label}`;
      } else if (key === "category") {
        groupKey = e.category ?? "(미분류)";
        label = e.category ?? "(미분류)";
      } else if (key === "event_type") {
        groupKey = e.event_type?.trim() || "(미지정)";
        label = e.event_type?.trim() || "(미지정)";
      } else if (key === "discount_burden") {
        groupKey = e.discount_burden ?? "(미지정)";
        label = e.discount_burden ?? "(미지정)";
      }
      if (!map[groupKey]) {
        map[groupKey] = { key: groupKey, label, count: 0, sale: 0, op: 0, ad_spend: 0, orders: 0, qty: 0 };
      }
      const agg = map[groupKey];
      agg.count++;
      const t = e.sales?.totals;
      if (t) {
        agg.sale += t.sale ?? 0;
        agg.op += t.operating_profit ?? 0;
        agg.orders += t.orders ?? 0;
        agg.qty += t.qty ?? 0;
      }
      agg.ad_spend += getAdSpend(e);
    }
    return Object.values(map).sort((a, b) => b.sale - a.sale);
  };

  // 전체 합계
  const grandTotal = useMemo(() => {
    let sale = 0, op = 0, ad = 0, count = 0;
    for (const e of filtered) {
      const t = e.sales?.totals;
      if (t) {
        sale += t.sale ?? 0;
        op += t.operating_profit ?? 0;
      }
      ad += getAdSpend(e);
      count++;
    }
    return { sale, op, ad, count, margin: sale ? (op / sale) * 100 : 0, roas: ad ? sale / ad : 0 };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="bg-white border rounded p-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-slate-700">📅 기간</span>
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        <span className="text-xs text-slate-500">~</span>
        <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        <button onClick={() => { setPeriodStart(defaultStart()); setPeriodEnd(defaultEnd()); }}
                className="text-xs px-2 py-1 border rounded text-slate-600 hover:bg-slate-50">기본</button>
        <button onClick={() => { setPeriodStart(""); setPeriodEnd("9999-12-31"); }}
                className="text-xs px-2 py-1 border rounded text-slate-600 hover:bg-slate-50">전 기간</button>
        <label className="flex items-center gap-1 text-xs text-slate-700 ml-2">
          <input type="checkbox" checked={withSalesOnly} onChange={(e) => setWithSalesOnly(e.target.checked)} />
          매출 수집된 행사만
        </label>
      </div>

      {/* 전체 합계 카드 */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-l-4 border-indigo-500 rounded p-4">
        <div className="text-base font-bold text-indigo-900 mb-2">📊 전체 합계 — 행사 {grandTotal.count}건</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">매출</div>
            <div className="text-base font-bold">{fmt(grandTotal.sale)}원</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">영업이익</div>
            <div className="text-sm font-bold text-emerald-700">{fmt(grandTotal.op)}원</div>
            <div className="text-[10px] text-slate-500">마진 {grandTotal.margin.toFixed(1)}%</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">광고비</div>
            <div className="text-sm font-bold text-rose-600">{fmt(grandTotal.ad)}원</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">ROAS</div>
            <div className="text-sm font-bold text-indigo-700">{grandTotal.roas ? grandTotal.roas.toFixed(1) + "배" : "-"}</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">행사당 평균 매출</div>
            <div className="text-sm font-bold">{grandTotal.count ? fmt(grandTotal.sale / grandTotal.count) : "-"}원</div>
          </div>
        </div>
      </div>

      {/* 그룹별 표 4개 */}
      {(["channel", "event_type", "category", "discount_burden"] as GroupKey[]).map((key) => {
        const rows = groupBy(key);
        if (rows.length === 0) return null;
        return (
          <div key={key} className="bg-white border rounded overflow-x-auto">
            <div className="px-4 py-2 border-b text-sm font-bold bg-slate-50">
              {GROUP_LABELS[key]} <span className="text-xs text-slate-500 font-normal">({rows.length}그룹)</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-left">{GROUP_LABELS[key].replace(/^[^ ]+ /, "")}</th>
                  <th className="px-2 py-2 text-right">행사</th>
                  <th className="px-2 py-2 text-right">매출</th>
                  <th className="px-2 py-2 text-right">영업이익</th>
                  <th className="px-2 py-2 text-right">마진율</th>
                  <th className="px-2 py-2 text-right">광고비</th>
                  <th className="px-2 py-2 text-right">ROAS</th>
                  <th className="px-2 py-2 text-right">행사당 매출</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const margin = r.sale ? (r.op / r.sale) * 100 : 0;
                  const roas = r.ad_spend ? r.sale / r.ad_spend : 0;
                  const avgSale = r.count ? r.sale / r.count : 0;
                  return (
                    <tr key={r.key} className="border-b hover:bg-slate-50">
                      <td className="px-2 py-1.5 font-medium">{r.label}</td>
                      <td className="px-2 py-1.5 text-right">{r.count}건</td>
                      <td className="px-2 py-1.5 text-right">{fmt(r.sale)}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-700">{fmt(r.op)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={margin >= 15 ? "text-emerald-700 font-bold" : margin >= 5 ? "" : "text-rose-600"}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-rose-600">{fmt(r.ad_spend)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={roas >= 3 ? "text-emerald-700 font-bold" : roas >= 2 ? "" : roas > 0 ? "text-amber-700" : "text-slate-400"}>
                          {roas ? roas.toFixed(1) + "배" : "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">{fmt(avgSale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="text-[11px] text-slate-500 space-y-0.5">
        <div>※ 마진율 색: <span className="text-emerald-700 font-bold">≥15%</span> / <span className="text-rose-600">&lt;5%</span></div>
        <div>※ ROAS 색: <span className="text-emerald-700 font-bold">≥3배</span> / <span className="text-amber-700">1배 ↓</span></div>
        <div>※ 행사는 status applied/selected/running/closed + 진행기간 채워진 것만. 매출은 sales 명령/attach-channel-totals 로 채워야 잡힘.</div>
      </div>
    </div>
  );
}
