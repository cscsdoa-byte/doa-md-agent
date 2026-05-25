import type { ChannelAgg, DashboardTotals } from "@/lib/settle";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  totals: DashboardTotals | null;
  range: { start: string; end: string } | null;
  channels: ChannelAgg[];
  events: EventItem[];
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

export default function ChannelPL({ totals, range, channels, events }: Props) {
  if (!totals && channels.length === 0) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded px-3 py-2">
        ⚠️ 정산자동화웹 호출 실패 또는 매출 없음.
      </div>
    );
  }

  // events 의 channel_key 기준 행사 카운트 + 행사 매출 합산
  const eventCountByKey: Record<string, number> = {};
  const runningCountByKey: Record<string, number> = {};
  const eventSaleByKey: Record<string, number> = {};
  for (const e of events) {
    if (!COUNTED_STATUSES.has(e.status)) continue;
    if (!e.sale_start || !e.sale_end) continue;
    eventCountByKey[e.channel_key] = (eventCountByKey[e.channel_key] || 0) + 1;
    if (e.status === "running") {
      runningCountByKey[e.channel_key] = (runningCountByKey[e.channel_key] || 0) + 1;
    }
    // sales_json.totals.sale 가 있으면 행사 매출로 합산
    const eventSale = e.sales?.totals?.sale;
    if (typeof eventSale === "number" && eventSale > 0) {
      eventSaleByKey[e.channel_key] = (eventSaleByKey[e.channel_key] || 0) + eventSale;
    }
  }

  // 채널을 "행사 있는" / "행사 없는" 으로 분리 후 매출 순 정렬
  const withEvents: typeof channels = [];
  const withoutEvents: typeof channels = [];
  for (const c of channels) {
    const key = CHANNEL_TO_KEY[c.channel];
    if (key && (eventCountByKey[key] ?? 0) > 0) {
      withEvents.push(c);
    } else {
      withoutEvents.push(c);
    }
  }
  // 매출 발생은 없지만 행사는 있는 채널 추가 (정산자동화웹에 없는 매출 + events에만 있는 케이스)
  const channelKeysWithSales = new Set(channels.map((c) => CHANNEL_TO_KEY[c.channel]).filter(Boolean));
  const phantomEventChannels: { channel_key: string; count: number; running: number }[] = [];
  for (const [key, count] of Object.entries(eventCountByKey)) {
    if (!channelKeysWithSales.has(key)) {
      phantomEventChannels.push({ channel_key: key, count, running: runningCountByKey[key] || 0 });
    }
  }

  const totalSale = totals?.real_sale ?? totals?.sale_ezadmin ?? 0;
  const totalOpProfit = totals?.operating_profit ?? 0;
  const totalNetProfit = totals?.net_profit ?? 0;
  const totalAdCost = totals?.ad_cost ?? 0;
  const opMargin = totalSale ? ((totalOpProfit / totalSale) * 100).toFixed(1) : "-";
  const netMargin = totalSale ? ((totalNetProfit / totalSale) * 100).toFixed(1) : "-";

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
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">영업이익 (광고비 전)</div>
            <div className="text-sm font-bold text-emerald-700">{fmt(totalOpProfit)}원</div>
            <div className="text-[10px] text-slate-500">마진 {opMargin}%</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">광고비</div>
            <div className="text-sm font-bold text-rose-600">{fmt(totalAdCost)}원</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-[10px] text-slate-500">순이익 (광고비 후)</div>
            <div className={`text-sm font-bold ${totalNetProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmt(totalNetProfit)}원
            </div>
            <div className="text-[10px] text-slate-500">순이익률 {netMargin}%</div>
          </div>
        </div>
      </div>

      {/* 2-A) 행사 들어간 채널 (강조) */}
      {(withEvents.length > 0 || phantomEventChannels.length > 0) && (
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-2">
            🎯 행사 진행 채널 ({withEvents.length + phantomEventChannels.length}개)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {withEvents.map((c) => {
              const themeKey = CHANNEL_TO_KEY[c.channel] || "?";
              const th = themeOf(themeKey);
              const count = eventCountByKey[themeKey] || 0;
              const running = runningCountByKey[themeKey] || 0;
              const eventSale = eventSaleByKey[themeKey] || 0;
              const eventShare = c.sale > 0 ? (eventSale / c.sale) * 100 : 0;
              return (
                <div key={c.channel} className="bg-amber-50 border-2 border-amber-400 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>
                      <span className="text-sm font-semibold">{c.channel}</span>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      ⭐ {count}건{running > 0 && ` (진행 ${running})`}
                    </span>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="text-slate-500">이번 달 매출 <b className="text-slate-700">{fmt(c.sale)}</b>원</div>
                    {eventSale > 0 && (
                      <div className="bg-amber-100 rounded px-1.5 py-0.5 -mx-0.5">
                        🎯 행사 매출 <b className="text-amber-900">{fmt(eventSale)}</b>원
                        <span className="text-[10px] text-amber-700 ml-1">({eventShare.toFixed(0)}%)</span>
                      </div>
                    )}
                    <div>영업이익 <b className="text-emerald-700">{fmt(c.operating_profit)}</b>원</div>
                    <div>마진율 <b>{c.margin_rate.toFixed(1)}%</b></div>
                    <div className="text-[10px] text-slate-500 mt-0.5">주문 {fmt(c.orders)} · 수량 {fmt(c.qty)}</div>
                  </div>
                </div>
              );
            })}
            {phantomEventChannels.map((p) => {
              const th = themeOf(p.channel_key);
              return (
                <div key={p.channel_key} className="bg-amber-50 border-2 border-dashed border-amber-300 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>
                      <span className="text-sm font-semibold">{th.label}</span>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      ⭐ {p.count}건{p.running > 0 && ` (진행 ${p.running})`}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">매출 미발생 (행사 진행 중 또는 미입점)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              return (
                <div key={c.channel} className="bg-slate-50 border rounded p-2 opacity-80">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`font-mono font-bold text-[11px] ${th.bold}`}>{th.abbr}</span>
                    <span className="text-xs font-semibold">{c.channel}</span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    매출 {fmt(c.sale)}원
                  </div>
                  <div className="text-[10px] text-slate-500">
                    영업이익 {fmt(c.operating_profit)} ({c.margin_rate.toFixed(1)}%)
                  </div>
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
