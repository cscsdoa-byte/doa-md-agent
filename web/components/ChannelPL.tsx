import type { ChannelAgg, DashboardTotals } from "@/lib/settle";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  totals: DashboardTotals | null;
  range: { start: string; end: string } | null;
  channels: ChannelAgg[];
}

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

export default function ChannelPL({ totals, range, channels }: Props) {
  if (!totals && channels.length === 0) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded px-3 py-2">
        ⚠️ 정산자동화웹 호출 실패 또는 매출 없음.
      </div>
    );
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

      {/* 2) 채널별 카드 (행사 들어가는 = 매출 발생 중인 채널만) */}
      {channels.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-2">
            🛒 채널별 매출 ({channels.length}개 채널, 매출 발생 순)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {channels.map((c) => {
              const themeKey = CHANNEL_TO_KEY[c.channel] || "?";
              const th = themeOf(themeKey);
              return (
                <div key={c.channel} className="bg-white border rounded p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>
                    <span className="text-sm font-semibold">{c.channel}</span>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div>매출 <b>{fmt(c.sale)}</b>원</div>
                    <div>영업이익 <b className="text-emerald-700">{fmt(c.operating_profit)}</b>원</div>
                    <div>마진율 <b>{c.margin_rate.toFixed(1)}%</b></div>
                    <div className="text-[10px] text-slate-500 mt-0.5">주문 {fmt(c.orders)} · 수량 {fmt(c.qty)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            ※ 채널별 광고비는 정산자동화웹에서 분할 안 됨 — 전체 광고비는 위 박스 참고
          </div>
        </div>
      )}
    </div>
  );
}
