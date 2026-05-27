import Link from "next/link";
import type { ChannelAgg, DashboardTotals } from "@/lib/settle";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";
import RetryAttachButton from "./RetryAttachButton";

// channel_key → 정산자동화웹 채널명 (attach-channel-totals 호출용)
const KEY_TO_SETTLE_CHANNEL: Record<string, string> = {
  naver_smartstore: "스마트스토어",
  coupang_wing: "쿠팡",
  "11st_soffice": "11번가",
  toss_shopping: "토스쇼핑",
  esmplus: "지마켓",
  shoppingnT: "쇼핑엔티",
};

// 정산자동화웹 채널명 → 시뮬레이터 기준 worst-case 수수료율 (결제 + 정산 합산, 면제 0 가정).
// 토스만 면제 조건 있음 — exempt_credit 으로 별도 공제 표시.
// 다른 채널은 정산자동화웹이 fee 정확히 채워주면 보정 무의미하지만, 미반영시 보수 표시용.
const EXPECTED_FEE_RATE: Record<string, number> = {
  스마트스토어: 0.0273,
  스스: 0.0273,
  쿠팡: 0.106,
  "11번가": 0.13,
  토스쇼핑: 0.104,  // 결제 2.4% + 정산 8%
  지마켓: 0.13,
  옥션: 0.13,
  쇼핑엔티: 0.15,
  카카오: 0.033,
};

interface Props {
  totals: DashboardTotals | null;
  prevTotals?: DashboardTotals | null;
  range: { start: string; end: string } | null;
  channels: ChannelAgg[];
  events: EventItem[];
}

function delta(curr: number, prev: number | undefined): { pct: number | null; arrow: string; color: string } {
  if (prev === undefined || prev === null || prev === 0) return { pct: null, arrow: "", color: "text-slate-400" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { pct, arrow: "→", color: "text-slate-500" };
  if (pct > 0) return { pct, arrow: "▲", color: "text-emerald-700" };
  return { pct, arrow: "▼", color: "text-rose-700" };
}

// 마진율 → 색 (0~30%+ 5단계 그라데이션). 5060 친화 색대비.
function marginColor(m: number): string {
  if (m >= 25) return "bg-emerald-500";
  if (m >= 15) return "bg-emerald-400";
  if (m >= 8) return "bg-amber-400";
  if (m >= 0) return "bg-orange-400";
  return "bg-rose-500";
}
function marginTextColor(m: number): string {
  if (m >= 25) return "text-emerald-700";
  if (m >= 15) return "text-emerald-600";
  if (m >= 8) return "text-amber-700";
  if (m >= 0) return "text-orange-700";
  return "text-rose-700";
}

// "실제로 MD가 진행한/진행 중인 행사" 만 카운트.
// new/reviewing = 아직 결정 안 된 RSS 안내문 → 제외.
// skip = 패스한 행사 → 제외.
// 추가로 sale_start 채워진 행사만 (= 기간 설정된 진짜 행사) 카운트.
const COUNTED_STATUSES = new Set(["applied", "selected", "running", "closed"]);

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return Math.round(n).toLocaleString();
}

// 정산자동화웹 channel(예: "스마트스토어") → 우리 channelTheme(yaml_key 기반) 매핑.
// channels_master 에 정확히 매핑 있지만 이 위젯은 server component 에서 간단 매핑.
const CHANNEL_TO_KEY: Record<string, string> = {
  스마트스토어: "naver_smartstore",
  스스: "naver_smartstore",
  쿠팡: "coupang_wing",
  "11번가": "11st_soffice",
  토스쇼핑: "toss_shopping",
  지마켓: "esmplus",
  옥션: "esmplus",
  쇼핑엔티: "shoppingnT",
  오늘의집: "ohou",
  자사몰: "own",
  문자주문: "sms",
  전화주문: "phone",
};

export default function ChannelPL({ totals, prevTotals, range, channels, events }: Props) {
  if (!totals && channels.length === 0) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded px-3 py-2">
        ⚠️ 정산자동화웹 호출 실패 또는 매출 없음.
      </div>
    );
  }

  // events 채널별 집계 (행사 진행 채널 카드는 정산자동화웹 데이터가 아니라 행사 데이터만 사용)
  // 신청(applied)만 하고 진행기간 미정인 행사도 카드에 보이도록 sale_start/end 필수 조건 제거.
  // 매출(sales)은 진행기간 있는 행사만 합산 (그 외엔 0).
  type EventChannelAgg = {
    channel_key: string;
    count: number;
    applied: number;
    selected: number;
    running: number;
    closed: number;
    sale: number;
    op: number;
    orders: number;
    qty: number;
    pendingEventIds: string[]; // 진행기간 있는데 sales 비어있는 행사들
  };
  const eventChannelAgg: Record<string, EventChannelAgg> = {};
  for (const e of events) {
    if (!COUNTED_STATUSES.has(e.status)) continue;
    const key = e.channel_key;
    if (!eventChannelAgg[key]) {
      eventChannelAgg[key] = {
        channel_key: key, count: 0,
        applied: 0, selected: 0, running: 0, closed: 0,
        sale: 0, op: 0, orders: 0, qty: 0,
        pendingEventIds: [],
      };
    }
    const agg = eventChannelAgg[key];
    agg.count++;
    if (e.status === "applied") agg.applied++;
    else if (e.status === "selected") agg.selected++;
    else if (e.status === "running") agg.running++;
    else if (e.status === "closed") agg.closed++;
    // 매출은 진행기간 + sales 데이터 있는 행사만 합산
    if (e.sale_start && e.sale_end) {
      const t = e.sales?.totals;
      if (t && (t.sale ?? 0) > 0) {
        agg.sale += t.sale ?? 0;
        agg.op += t.operating_profit ?? 0;
        agg.orders += t.orders ?? 0;
        agg.qty += t.qty ?? 0;
      } else {
        // 진행기간 있는데 매출 없음 → 재시도 후보
        agg.pendingEventIds.push(e.dedup_id);
      }
    }
  }
  const withEventsList = Object.values(eventChannelAgg).sort((a, b) => b.sale - a.sale);

  // 기타 매출 채널 = 정산자동화웹 breakdown 중 events 행사가 없는 채널
  const eventChannelKeys = new Set(Object.keys(eventChannelAgg));
  const withoutEvents: typeof channels = channels.filter((c) => {
    const key = CHANNEL_TO_KEY[c.channel];
    return !key || !eventChannelKeys.has(key);
  });

  const totalSale = totals?.real_sale ?? totals?.sale_ezadmin ?? 0;
  const totalOpProfit = totals?.operating_profit ?? 0;
  const totalNetProfit = totals?.net_profit ?? 0;
  const totalAdCost = totals?.ad_cost ?? 0;
  const opMargin = totalSale ? ((totalOpProfit / totalSale) * 100).toFixed(1) : "-";
  const netMargin = totalSale ? ((totalNetProfit / totalSale) * 100).toFixed(1) : "-";
  // 전월 동기 비교 (prev_totals 가 있을 때만)
  const dSale = delta(totalSale, prevTotals?.real_sale ?? prevTotals?.sale_ezadmin);
  const dOp = delta(totalOpProfit, prevTotals?.operating_profit);
  const dNet = delta(totalNetProfit, prevTotals?.net_profit);
  const dAd = delta(totalAdCost, prevTotals?.ad_cost);

  return (
    <div className="mb-4 space-y-3">
      {/* 1) 전체 합계 (광고비 포함 — 광고비는 채널별 분할 안 됨) */}
      <div className="border-l-4 border-amber-500 bg-amber-50 rounded p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-base font-bold text-amber-900">📊 조선팔도떡집 이번 달 PL (전체)</div>
          <div className="text-[11px] text-amber-700">{range?.start} ~ {range?.end}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">실 매출</div>
            <div className="text-base font-bold">{fmt(totalSale)}원</div>
            {dSale.pct !== null && (
              <div className={`text-[10px] ${dSale.color} font-semibold`} title="전월 동기 대비">{dSale.arrow} {Math.abs(dSale.pct).toFixed(1)}% MoM</div>
            )}
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">영업이익 (광고비 전)</div>
            <div className="text-sm font-bold text-emerald-700">{fmt(totalOpProfit)}원</div>
            <div className="text-[10px] text-slate-500">마진 {opMargin}%</div>
            {dOp.pct !== null && (
              <div className={`text-[10px] ${dOp.color} font-semibold`}>{dOp.arrow} {Math.abs(dOp.pct).toFixed(1)}% MoM</div>
            )}
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">광고비</div>
            <div className="text-sm font-bold text-rose-600">{fmt(totalAdCost)}원</div>
            {dAd.pct !== null && (
              <div className={`text-[10px] ${dAd.color} font-semibold`}>{dAd.arrow} {Math.abs(dAd.pct).toFixed(1)}% MoM</div>
            )}
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">순이익 (광고비 후)</div>
            <div className={`text-sm font-bold ${totalNetProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmt(totalNetProfit)}원
            </div>
            <div className="text-[10px] text-slate-500">순이익률 {netMargin}%</div>
            {dNet.pct !== null && (
              <div className={`text-[10px] ${dNet.color} font-semibold`}>{dNet.arrow} {Math.abs(dNet.pct).toFixed(1)}% MoM</div>
            )}
          </div>
        </div>
        {/* 매출 → 영업이익 → 순이익 시각화 막대 (5060 친화: 큰 막대 한 줄로 흐름 파악) */}
        {totalSale > 0 && (() => {
          const opPct = (totalOpProfit / totalSale) * 100;
          const netPct = (totalNetProfit / totalSale) * 100;
          const costPct = 100 - opPct;
          const adPctOfSale = (totalAdCost / totalSale) * 100;
          return (
            <div className="mt-3 space-y-2 bg-white rounded-lg p-3 border border-amber-200">
              {/* 매출 (100% 기준 라벨) */}
              <div>
                <div className="flex items-baseline justify-between text-[11px] mb-1">
                  <span className="font-bold text-slate-700">매출</span>
                  <span className="text-slate-500">100% (기준)</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: "100%" }} />
                </div>
              </div>
              {/* 영업이익 (광고비 전) — 원가+수수료+택배 차감 후 */}
              <div>
                <div className="flex items-baseline justify-between text-[11px] mb-1">
                  <span className="font-bold text-slate-700">영업이익 <span className="text-slate-400 text-[10px]">← 원가·수수료·택배 차감</span></span>
                  <span className={`font-bold ${marginTextColor(opPct)}`}>{opPct.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className={`h-full ${marginColor(opPct)}`} style={{ width: `${opPct}%` }} />
                  <div className="h-full bg-slate-200 flex-1" title={`차감 ${costPct.toFixed(1)}%`} />
                </div>
              </div>
              {/* 순이익 (광고비 후) */}
              <div>
                <div className="flex items-baseline justify-between text-[11px] mb-1">
                  <span className="font-bold text-slate-700">순이익 <span className="text-rose-500 text-[10px]">← 광고비 {adPctOfSale.toFixed(1)}% 추가 차감</span></span>
                  <span className={`font-bold ${marginTextColor(netPct)}`}>{netPct.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className={`h-full ${marginColor(netPct)}`} style={{ width: `${Math.max(0, netPct)}%` }} />
                  <div className="h-full bg-rose-200" style={{ width: `${Math.min(adPctOfSale, opPct - Math.max(0, netPct))}%` }} title={`광고비 ${adPctOfSale.toFixed(1)}%`} />
                  <div className="h-full bg-slate-200 flex-1" />
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 2-A) 행사 진행 채널 (events 데이터만 사용 — 정산자동화웹 이번 달 X) */}
      {withEventsList.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-2">
            🎯 행사 진행 채널 ({withEventsList.length}개) — 행사 매출만 표시
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {withEventsList.map((ec) => {
              const th = themeOf(ec.channel_key);
              const margin = ec.sale > 0 ? (ec.op / ec.sale) * 100 : 0;
              const hasSales = ec.sale > 0;
              const pipelineOnly = ec.running === 0 && ec.closed === 0; // 신청·선정 단계만
              const pipeline = ec.applied + ec.selected;
              return (
                <div key={ec.channel_key} className="bg-amber-50 border-2 border-amber-400 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>
                      <span className="text-sm font-semibold">{th.label}</span>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      ⭐ {ec.count}건
                    </span>
                  </div>
                  {/* 상태 breakdown 배지 — 0인 상태는 숨김 */}
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {ec.applied > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold" title="제안서 제출 / 신청 완료">📨 신청 {ec.applied}</span>
                    )}
                    {ec.selected > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold" title="선정됨 / 진행 대기">✅ 선정 {ec.selected}</span>
                    )}
                    {ec.running > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-800 font-semibold" title="진행 중">🔴 진행 {ec.running}</span>
                    )}
                    {ec.closed > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold" title="종료">🏁 종료 {ec.closed}</span>
                    )}
                  </div>
                  {hasSales ? (
                    <div className="text-xs space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-600">🎯 행사 매출</span>
                        <b className="text-base text-amber-900">{fmt(ec.sale)}원</b>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-600">영업이익</span>
                        <b className="text-emerald-700">{fmt(ec.op)}원</b>
                      </div>
                      {/* 마진 게이지 */}
                      <div>
                        <div className="flex items-baseline justify-between text-[10px] mb-0.5">
                          <span className="text-slate-500">마진율</span>
                          <b className={marginTextColor(margin)}>{margin.toFixed(1)}%</b>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${marginColor(margin)}`} style={{ width: `${Math.max(0, Math.min(100, margin * 2))}%` }} title="0~50% 스케일" />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">주문 {fmt(ec.orders)} · 수량 {fmt(ec.qty)}</div>
                    </div>
                  ) : pipelineOnly && pipeline > 0 ? (
                    <div className="text-xs text-blue-700">📋 신청·선정 단계 — 진행 시작되면 매출 자동 표시</div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" title="매출 미수집"></span>
                        정산자동화웹에 매출 잡히는 대로 자동 표시
                      </div>
                      {ec.pendingEventIds.length > 0 && KEY_TO_SETTLE_CHANNEL[ec.channel_key] && (
                        <RetryAttachButton
                          eventId={ec.pendingEventIds[0]}
                          channel={KEY_TO_SETTLE_CHANNEL[ec.channel_key]}
                          brand="조선팔도떡집"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2-C) 행사 유형별(event_type) PL — 행사 데이터 기반 */}
      {(() => {
        type Agg = { key: string; count: number; sale: number; op: number };
        const byType: Record<string, Agg> = {};
        for (const e of events) {
          if (!COUNTED_STATUSES.has(e.status)) continue;
          if (!e.sale_start || !e.sale_end) continue;
          const k = (e.event_type && e.event_type.trim()) || "(미분류)";
          if (!byType[k]) byType[k] = { key: k, count: 0, sale: 0, op: 0 };
          byType[k].count++;
          const t = e.sales?.totals;
          if (t) {
            byType[k].sale += t.sale ?? 0;
            byType[k].op += t.operating_profit ?? 0;
          }
        }
        const rows = Object.values(byType).sort((a, b) => b.sale - a.sale);
        if (rows.length === 0) return null;
        const grandSale = rows.reduce((s, r) => s + r.sale, 0);
        return (
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">
              🎫 행사 유형별 PL ({rows.length}종) — 진행 중·종료 행사 합산
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {rows.map((r) => {
                const margin = r.sale > 0 ? (r.op / r.sale) * 100 : 0;
                const share = grandSale > 0 ? (r.sale / grandSale) * 100 : 0;
                return (
                  <div key={r.key} className="bg-indigo-50 border border-indigo-200 rounded p-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-indigo-900 truncate" title={r.key}>{r.key}</span>
                      <span className="text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-bold">
                        {r.count}건
                      </span>
                    </div>
                    {r.sale > 0 ? (
                      <div className="text-[11px] space-y-0.5">
                        <div>매출 <b className="text-indigo-900">{fmt(r.sale)}</b>원 <span className="text-[10px] text-slate-500">({share.toFixed(1)}%)</span></div>
                        <div>영업이익 <b className="text-emerald-700">{fmt(r.op)}</b>원 ({margin.toFixed(1)}%)</div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500">매출 미수집</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 2-B) 매출만 있고 행사는 없는 채널 (회색 톤) */}
      {withoutEvents.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2">
            기타 매출 채널 ({withoutEvents.length}개 — 등록된 행사 없음)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {withoutEvents.map((c) => {
              const themeKey = CHANNEL_TO_KEY[c.channel] || "?";
              const th = themeOf(themeKey);
              const isToss = themeKey === "toss_shopping";

              // 보수 + 공제(+) 모델 (2026-05-27 결정):
              //   - 기본 표시 = worst-case 영업이익 (시뮬레이터 기준 수수료율 100% 부과 가정)
              //   - 면제 공제(+) = expected_fee - real_fee (토스 면제 조건 있을 때만 의미있음)
              //   - 정산자동화웹 fee 가 expected 와 거의 같으면 (이미 정확) 보정 표시 생략
              const expectedRate = EXPECTED_FEE_RATE[c.channel] ?? 0;
              const expectedFee = c.sale * expectedRate;
              const realFee = c.fee;
              const worstOp = c.operating_profit - (expectedFee - realFee);
              const worstMargin = c.sale > 0 ? (worstOp / c.sale) * 100 : 0;
              // 미반영 판별: real fee 가 expected 의 20% 미만이면 사실상 미반영
              const feeUnderApplied = expectedRate > 0 && realFee < expectedFee * 0.2;
              // 면제 공제 = expected_fee - real_fee (CSV 등으로 정확한 fee 들어왔을 때만 의미)
              const exemptCredit = !feeUnderApplied ? Math.max(0, expectedFee - realFee) : 0;
              // 토스는 면제 조건 명시 채널 — 공제 표시 + CSV 라벨
              const showExemptLine = isToss && !feeUnderApplied && exemptCredit > 0;
              const tossCsvApplied = isToss && !feeUnderApplied;

              const cardInner = (
                <>
                  <div className="text-[11px] text-slate-700 font-semibold">
                    {fmt(c.sale)}원
                  </div>
                  {(() => {
                    const dYoY = c.sale_yoy !== null ? delta(c.sale, c.sale_yoy) : null;
                    return dYoY && dYoY.pct !== null ? (
                      <div className={`text-[10px] ${dYoY.color} font-semibold`} title={`작년 동기 매출 ${fmt(c.sale_yoy ?? 0)}원 대비`}>
                        {dYoY.arrow} {Math.abs(dYoY.pct).toFixed(1)}% YoY
                      </div>
                    ) : null;
                  })()}
                  {expectedRate > 0 ? (
                    <>
                      <div className="text-[10px] text-slate-500" title={isToss ? "결제 2.4% + 정산 8% 모두 부과 가정 (보수)" : `시뮬레이터 기준 ${(expectedRate*100).toFixed(1)}% 부과 가정`}>
                        수수료({(expectedRate*100).toFixed(1)}%) <span className="text-rose-600">-{fmt(expectedFee)}</span>
                      </div>
                      <div className="text-[10px] text-slate-800 font-semibold" title="모든 수수료 차감 가정 — 실제 면제·할인분은 공제(+) 로 환원">
                        영업이익(보수) <b>{fmt(worstOp)}</b> ({worstMargin.toFixed(1)}%)
                      </div>
                      {showExemptLine && (
                        <div className="text-[10px] text-emerald-700" title="오늘출발/광고전환 면제로 절감된 정산수수료 — CSV 반영 시 자동 계산">
                          면제 공제(+) <b>{fmt(exemptCredit)}</b>원
                        </div>
                      )}
                      {!feeUnderApplied && expectedFee !== realFee && (
                        <div className="text-[10px] text-emerald-800 font-semibold">
                          실 영업이익 <b>{fmt(c.operating_profit)}</b> ({c.margin_rate.toFixed(1)}%)
                        </div>
                      )}
                      {!feeUnderApplied && Math.abs(expectedFee - realFee) < c.sale * 0.005 && (
                        <div className="text-[10px] text-slate-400">실 수수료 ≈ 예상치 (공제 ~0)</div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] text-slate-500">
                      영업이익 {fmt(c.operating_profit)} ({c.margin_rate.toFixed(1)}%)
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400" title="채널 매출 비중으로 totals.ad_cost 안분 — 정산자동화웹이 채널별 광고비를 분할 안 해줘서 근사치">
                    추정 순이익 {fmt(c.net_profit_est)} ({c.net_margin_est.toFixed(1)}%)
                  </div>
                  {isToss && (
                    <div className="mt-1 text-[10px] text-sky-700 font-semibold" title={tossCsvApplied ? "정산 CSV 반영된 실 수수료 — 면제 공제 정확히 계산됨" : "CSV 미반영 — 면제 공제는 업로드 후에 계산됨"}>
                      {tossCsvApplied ? "✓ CSV 반영 (공제 정확)" : "📅 익월 CSV 업로드 → (면제 공제 미반영)"}
                    </div>
                  )}
                  {!isToss && feeUnderApplied && (
                    <div className="mt-1 text-[10px] text-amber-700 font-semibold" title="실 수수료가 시뮬레이터 예상치의 20% 미만 — 정산자동화웹 fee 미반영 가능">
                      ⚠️ 수수료 미반영 의심
                    </div>
                  )}
                </>
              );
              // 매출 점유율 (전체 채널 매출 대비) — 시각 막대로 비교 한눈에
              const grandChSale = channels.reduce((s, x) => s + x.sale, 0);
              const sharePct = grandChSale > 0 ? (c.sale / grandChSale) * 100 : 0;
              const cardBody = (
                <>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`font-mono font-bold text-[11px] ${th.bold}`}>{th.abbr}</span>
                    <span className="text-xs font-semibold flex-1">{c.channel}</span>
                    <span className="text-[10px] text-slate-500">{sharePct.toFixed(0)}%</span>
                  </div>
                  {/* 매출 점유율 막대 */}
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
                    <div className={`h-full ${isToss ? "bg-sky-400" : "bg-slate-400"}`} style={{ width: `${sharePct}%` }} />
                  </div>
                  {cardInner}
                </>
              );
              return isToss ? (
                <Link
                  key={c.channel}
                  href="/toss-upload"
                  className="bg-sky-50 border border-sky-200 rounded p-2 hover:bg-sky-100 block"
                >
                  {cardBody}
                </Link>
              ) : (
                <div key={c.channel} className="bg-slate-50 border rounded p-2">
                  {cardBody}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-[10px] text-slate-400">
        ※ ⭐ = 우리 시스템에 행사 등록된 채널 / 광고비는 정산자동화웹에서 채널별 분할 안 됨 (위 합계 박스 참고)
      </div>
    </div>
  );
}
