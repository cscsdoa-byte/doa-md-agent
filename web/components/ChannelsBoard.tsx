"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdComment, ChannelMaster, EventItem } from "@/lib/data";
import type { ChannelAgg } from "@/lib/settle";
import type { ChannelDef } from "@/lib/channels";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  events: EventItem[];
  channelPL: ChannelAgg[];
  channelsMaster: ChannelMaster[];
  yamlChannels: ChannelDef[];
  adComments: AdComment[];
  adCommentStats?: { total: number; danger: number; negative: number; warning: number; unhandled_high: number; by_platform: Record<string, number> };
  productsByChannel: Record<string, { product: string; url: string }[]>;
}

// channels_master settle_name → yaml key 매핑 (events.channel_key 연결용)
const SETTLE_TO_YAML: Record<string, string> = {
  스마트스토어: "naver_smartstore",
  스스: "naver_smartstore",
  쿠팡: "coupang_wing",
  "11번가": "11st_soffice",
  토스쇼핑: "toss_shopping",
  지마켓: "esmplus",
  옥션: "esmplus",
  쇼핑엔티: "shoppingnT",
  NS홈쇼핑: "ns_homeshopping",
  K쇼핑: "k_shopping",
  롯데홈쇼핑: "lotte_homeshopping",
  홈쇼핑모아: "homeshopping_moa",
  공영홈쇼핑: "gongyoung_homeshopping",
  CJ온스타일: "cj_onstyle",
  신세계홈쇼핑: "shinsegae_homeshopping",
  카카오: "kakao_talkstore",
  카카오톡스토어: "kakao_talkstore",
};

// 광고 플랫폼 → 정산자동화웹 채널 추정 (대략적 매핑, 표시용)
const COMMENT_PLATFORM_TO_CHANNEL: Record<string, string[]> = {
  instagram: ["인스타", "instagram"],
  facebook: ["페북", "facebook"],
  youtube: ["유튜브", "youtube"],
  kakao: ["카카오", "카카오톡스토어"],
  tiktok: ["틱톡"],
};

function fmt(n: number): string {
  if (!n) return "0";
  return Math.round(n).toLocaleString();
}

type SortBy = "sale" | "events" | "ad" | "name";

export default function ChannelsBoard({
  events, channelPL, channelsMaster, yamlChannels, adComments, productsByChannel,
}: Props) {
  const [sortBy, setSortBy] = useState<SortBy>("sale");
  const [filterSales, setFilterSales] = useState(true);

  // 채널 통합 — channels_master + events.channel_key 합쳐서 유니크
  const rows = useMemo(() => {
    type Row = {
      key: string;            // 표시 키 (settle_name 우선, 없으면 yaml_key)
      display_name: string;
      yaml_key: string | null;
      is_sales: boolean;
      // 매출
      sale: number;
      op: number;
      margin: number;
      ad_cost_est: number;
      fee_rate: number | null;
      // 행사
      events_total: number;
      events_applied: number;
      events_selected: number;
      events_running: number;
      events_closed: number;
      events_ad_spend: number;
      // 댓글
      comments_total: number;
      comments_high: number;
      comments_unhandled: number;
    };
    const byKey: Record<string, Row> = {};

    function ensureRow(key: string, display: string, yaml_key: string | null, is_sales: boolean): Row {
      if (!byKey[key]) {
        byKey[key] = {
          key, display_name: display, yaml_key, is_sales,
          sale: 0, op: 0, margin: 0, ad_cost_est: 0, fee_rate: null,
          events_total: 0, events_applied: 0, events_selected: 0, events_running: 0, events_closed: 0,
          events_ad_spend: 0,
          comments_total: 0, comments_high: 0, comments_unhandled: 0,
        };
      }
      return byKey[key];
    }

    // 채널 마스터 기준
    for (const cm of channelsMaster) {
      const yk = cm.yaml_key || SETTLE_TO_YAML[cm.settle_name] || null;
      const r = ensureRow(cm.settle_name, cm.display_name, yk, cm.is_sales === 1);
      if (cm.default_fee_rate !== null && cm.default_fee_rate !== undefined) {
        r.fee_rate = cm.default_fee_rate;
      }
    }

    // 매출 (channelPL — 정산자동화웹 이번 달)
    for (const c of channelPL) {
      const yk = SETTLE_TO_YAML[c.channel] || null;
      const r = ensureRow(c.channel, c.channel, yk, true);
      r.sale = c.sale;
      r.op = c.operating_profit;
      r.margin = c.margin_rate;
      r.ad_cost_est = c.ad_cost_est;
    }

    // 행사 — events.channel_key 기준
    for (const e of events) {
      if (!["applied", "selected", "running", "closed"].includes(e.status)) continue;
      const yk = e.channel_key;
      // yaml_key 가 매칭되는 row 찾기
      const matched = Object.values(byKey).find((r) => r.yaml_key === yk);
      let r: Row;
      if (matched) {
        r = matched;
      } else {
        // yaml_key 만 있고 channels_master 에 없는 케이스 — yaml 정의에서 표시명 가져옴
        const yamlDef = yamlChannels.find((y) => y.key === yk);
        r = ensureRow(yk, yamlDef?.name || yk, yk, yamlDef?.is_sales ?? true);
      }
      r.events_total++;
      if (e.status === "applied") r.events_applied++;
      else if (e.status === "selected") r.events_selected++;
      else if (e.status === "running") r.events_running++;
      else if (e.status === "closed") r.events_closed++;
      if (e.ad_spend_manual) r.events_ad_spend += e.ad_spend_manual;
    }

    // 댓글 — platform 으로 매칭 (광고는 채널과 다르므로 별도 표시)
    // 일단 댓글 통계는 평탄화 — 메인 화면에 SNS 채널 따로

    // is_sales 필터 + 정렬
    let result = Object.values(byKey);
    if (filterSales) result = result.filter((r) => r.is_sales);
    result.sort((a, b) => {
      if (sortBy === "sale") return b.sale - a.sale;
      if (sortBy === "events") return b.events_total - a.events_total;
      if (sortBy === "ad") return b.events_ad_spend - a.events_ad_spend;
      return a.display_name.localeCompare(b.display_name);
    });
    return result;
  }, [events, channelPL, channelsMaster, yamlChannels, sortBy, filterSales]);

  // 댓글 플랫폼별 (별도 카드)
  const commentByPlatform = useMemo(() => {
    const m: Record<string, { total: number; high: number; unhandled: number }> = {};
    for (const c of adComments) {
      const p = c.platform;
      if (!m[p]) m[p] = { total: 0, high: 0, unhandled: 0 };
      m[p].total++;
      if ((c.severity ?? 0) >= 2) m[p].high++;
      if (c.handled !== 1) m[p].unhandled++;
    }
    return m;
  }, [adComments]);

  const totalSale = rows.reduce((s, r) => s + r.sale, 0);
  const totalEvents = rows.reduce((s, r) => s + r.events_total, 0);

  return (
    <div className="space-y-4">
      {/* 상단 요약 + 필터 */}
      <div className="bg-white border border-slate-200 rounded p-3 flex items-center flex-wrap gap-3 text-xs">
        <div>
          전체 매출 <b className="text-slate-800">{fmt(totalSale)}원</b>
          <span className="ml-2 text-slate-500">· 행사 {totalEvents}건 · 채널 {rows.length}개</span>
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={filterSales} onChange={(e) => setFilterSales(e.target.checked)} />
          판매채널만
        </label>
        <div>정렬:</div>
        {(["sale", "events", "ad", "name"] as SortBy[]).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`px-2 py-0.5 rounded ${sortBy === s ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
          >
            {s === "sale" ? "매출↓" : s === "events" ? "행사↓" : s === "ad" ? "광고비↓" : "이름"}
          </button>
        ))}
      </div>

      {/* 채널 카드 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((r) => {
          const th = r.yaml_key ? themeOf(r.yaml_key) : null;
          const totalShare = totalSale > 0 ? (r.sale / totalSale) * 100 : 0;
          return (
            <div key={r.key} className="bg-white border border-slate-200 rounded p-3">
              {/* 헤더 */}
              <div className="flex items-baseline justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {th && <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>}
                  <span className="text-sm font-bold text-slate-800 truncate">{r.display_name}</span>
                  {!r.is_sales && <span className="text-[10px] text-slate-400">📰 정보</span>}
                </div>
                {r.fee_rate !== null && (
                  <span className="text-[10px] text-slate-500">수수료 {(r.fee_rate * 100).toFixed(1)}%</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* 매출 */}
                <div>
                  <div className="text-[10px] text-slate-500 mb-0.5">매출 · 영업이익</div>
                  <div className="font-bold text-slate-800">{fmt(r.sale)}원</div>
                  <div className="text-[10px] text-emerald-700">영업이익 {fmt(r.op)} ({r.margin.toFixed(1)}%)</div>
                  {totalShare > 0 && (
                    <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, totalShare)}%` }} />
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-0.5">전체의 {totalShare.toFixed(1)}%</div>
                </div>

                {/* 행사 */}
                <div>
                  <div className="text-[10px] text-slate-500 mb-0.5">행사 {r.events_total}건</div>
                  {r.events_total > 0 ? (
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {r.events_applied > 0 && <span className="px-1 bg-blue-50 text-blue-700 rounded">📨 {r.events_applied}</span>}
                      {r.events_selected > 0 && <span className="px-1 bg-violet-50 text-violet-700 rounded">✅ {r.events_selected}</span>}
                      {r.events_running > 0 && <span className="px-1 bg-pink-50 text-pink-700 rounded">🔴 {r.events_running}</span>}
                      {r.events_closed > 0 && <span className="px-1 bg-slate-100 text-slate-600 rounded">🏁 {r.events_closed}</span>}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400">없음</div>
                  )}
                  {r.events_ad_spend > 0 && (
                    <div className="text-[10px] text-rose-600 mt-1">광고비 {fmt(r.events_ad_spend)}원</div>
                  )}
                </div>
              </div>

              {/* 등록 상품 — 소비자 입장 채널 상품 페이지 링크 */}
              {(() => {
                // 채널명으로 productsByChannel 매칭 — display_name 우선, yaml_key fallback
                // productsByChannel 의 키는 채널 이름 ("자사몰", "스마트스토어", "쿠팡" 등 channel_urls 등록시 라벨)
                const productList =
                  productsByChannel[r.display_name] ||
                  productsByChannel[r.key] ||
                  [];
                if (productList.length === 0) {
                  return (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <div className="text-[10px] text-slate-400">
                        📦 등록 상품 없음 — <Link href="/products" className="text-blue-600 hover:underline">상품 페이지</Link>에서 URL 추가
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <div className="text-[10px] text-slate-500 mb-1.5">📦 등록 상품 {productList.length}개 (소비자 페이지)</div>
                    <div className="flex flex-wrap gap-1">
                      {productList.map(({ product, url }) => (
                        <a
                          key={product}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 rounded font-semibold"
                          title={url}
                        >
                          {product} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* SNS·광고 플랫폼 댓글 별도 카드 */}
      {Object.keys(commentByPlatform).length > 0 && (
        <div className="bg-white border border-slate-200 rounded p-3">
          <div className="text-sm font-bold text-slate-800 mb-2">💬 광고·SNS 댓글 — 플랫폼별</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {Object.entries(commentByPlatform).map(([pf, s]) => (
              <Link
                key={pf}
                href={`/comments?platform=${pf}`}
                className="bg-slate-50 border border-slate-200 rounded p-2 hover:bg-slate-100"
              >
                <div className="text-xs font-semibold text-slate-700">{pf}</div>
                <div className="text-lg font-bold text-slate-800">{s.total}건</div>
                <div className="text-[10px] space-x-1">
                  {s.high > 0 && <span className="text-rose-600">부정 {s.high}</span>}
                  {s.unhandled > 0 && <span className="text-amber-700">미처리 {s.unhandled}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-slate-400 text-center pt-2">
        ※ 매출/영업이익 = 정산자동화웹 이번 달 · 행사 = MD 에이전트 등록 · 광고비 = 행사별 직접 입력값
      </div>
    </div>
  );
}
