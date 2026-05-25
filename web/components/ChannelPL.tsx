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

  // events 채널별 집계 (행사 진행 채널 카드는 정산자동화웹 데이터가 아니라 행사 데이터만 사용)
  type EventChannelAgg = {
    channel_key: string;
    count: number;
    running: number;
    sale: number;
    op: number;
    orders: number;
    qty: number;
  };
  const eventChannelAgg: Record<string, EventChannelAgg> = {};
  for (const e of events) {
    if (!COUNTED_STATUSES.has(e.status)) continue;
    if (!e.sale_start || !e.sale_end) continue;
    const key = e.channel_key;
    if (!eventChannelAgg[key]) {
      eventChannelAgg[key] = { channel_key: key, count: 0, running: 0, sale: 0, op: 0, orders: 0, qty: 0 };
    }
    const agg = eventChannelAgg[key];
    agg.count++;
    if (e.status === "running") agg.running++;
    const t = e.sales?.totals;
    if (t) {
      agg.sale += t.sale ?? 0;
      agg.op += t.operating_profit ?? 0;
      agg.orders += t.orders ?? 0;
      agg.qty += t.qty ?? 0;
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
              return (
                <div key={ec.channel_key} className="bg-amber-50 border-2 border-amber-400 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>
                      <span className="text-sm font-semibold">{th.label}</span>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      ⭐ {ec.count}건{ec.running > 0 && ` (진행 ${ec.running})`}
                    </span>
                  </div>
                  {hasSales ? (
                    <div className="text-xs space-y-0.5">
                      <div>🎯 행사 매출 <b className="text-amber-900">{fmt(ec.sale)}</b>원</div>
                      <div>영업이익 <b className="text-emerald-700">{fmt(ec.op)}</b>원</div>
                      <div>마진율 <b>{margin.toFixed(1)}%</b></div>
                      <div className="text-[10px] text-slate-500 mt-0.5">주문 {fmt(ec.orders)} · 수량 {fmt(ec.qty)}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">행사 매출 미수집 (sales 명령 또는 attach-channel-totals 필요)</div>
                  )}
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
