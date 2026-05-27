"use client";

import { useState } from "react";
import html2canvas from "html2canvas";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";
import { statusLabel } from "@/lib/status";

interface Props {
  event: EventItem;
}

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null || n === 0) return "0";
  return Math.round(n).toLocaleString();
}

export default function ReportCard({ event }: Props) {
  const [busy, setBusy] = useState(false);

  async function downloadPng() {
    const node = document.getElementById("report-canvas");
    if (!node) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = event.sale_end?.slice(0, 10) ?? "";
        const safeTitle = event.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 30);
        a.download = `[${event.short_id}]${safeTitle}_${date}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } finally {
      setBusy(false);
    }
  }

  const th = themeOf(event.channel_key);
  const t = event.sales?.totals;
  const sale = t?.sale ?? 0;
  const op = t?.operating_profit ?? 0;
  const ad = event.ad_spend_manual && event.ad_spend_manual > 0
    ? event.ad_spend_manual
    : (t?.ad_cost ?? t?.ad_spend ?? 0);
  const netProfit = op - ad;
  const margin = sale ? (op / sale) * 100 : 0;
  const netMargin = sale ? (netProfit / sale) * 100 : 0;
  const roas = ad ? sale / ad : 0;
  const top = (t as { matched?: Array<{ product_name: string; sale: number; qty: number }> } | undefined)?.matched ?? [];

  return (
    <div>
      {/* 다운로드 버튼 */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={downloadPng}
          disabled={busy}
          className="px-4 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 disabled:bg-slate-400"
        >
          {busy ? "⏳ 생성 중..." : "📥 PNG 다운로드"}
        </button>
        <div className="text-xs text-slate-500">아래 카드 그대로 이미지로 저장됨 — 사장님 보고/카톡/노션 붙여넣기</div>
      </div>

      {/* 캡처 대상 카드 — 1080px 폭 (SNS/카톡 친화) */}
      <div
        id="report-canvas"
        className="bg-white shadow-2xl mx-auto"
        style={{ width: 1080, padding: 48 }}
      >
        {/* 헤더 */}
        <div className="flex items-baseline justify-between border-b-4 border-slate-900 pb-3 mb-5">
          <div>
            <div className="text-sm text-slate-500 mb-1">조선팔도떡집 · 행사 결과 리포트</div>
            <div className="text-3xl font-extrabold text-slate-900">{event.title}</div>
          </div>
          <div className={`text-right`}>
            <div className={`text-2xl font-extrabold ${th.bold}`}>{th.abbr} {th.label}</div>
            <div className="text-xs text-slate-500 mt-1">[{event.short_id}] {statusLabel(event.status)}</div>
          </div>
        </div>

        {/* 메타 */}
        <div className="grid grid-cols-3 gap-3 mb-5 text-sm">
          <div className="bg-slate-50 p-3 rounded">
            <div className="text-xs text-slate-500 mb-1">📅 진행기간</div>
            <div className="font-bold text-base">
              {event.sale_start?.slice(0, 10) ?? "-"}
              {event.sale_end && event.sale_end !== event.sale_start && ` ~ ${event.sale_end.slice(0, 10)}`}
            </div>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <div className="text-xs text-slate-500 mb-1">👤 담당 MD</div>
            <div className="font-bold text-base">{event.md_owner_name || "(미지정)"}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <div className="text-xs text-slate-500 mb-1">🎁 유형 · 할인</div>
            <div className="font-bold text-base">
              {event.event_type || "-"}
              {event.discount_rate != null && ` · ${(event.discount_rate * 100).toFixed(0)}%`}
            </div>
          </div>
        </div>

        {/* 핵심 숫자 4개 — 큰 글씨 */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
            <div className="text-xs text-blue-700 font-semibold">💰 실 매출</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">{fmt(sale)}</div>
            <div className="text-[11px] text-slate-500 mt-1">원</div>
          </div>
          <div className="bg-emerald-50 border-l-4 border-emerald-600 p-4 rounded">
            <div className="text-xs text-emerald-700 font-semibold">📈 영업이익</div>
            <div className="text-3xl font-extrabold text-emerald-900 mt-1">{fmt(op)}</div>
            <div className="text-[11px] text-emerald-700 mt-1">마진 {margin.toFixed(1)}%</div>
          </div>
          <div className="bg-rose-50 border-l-4 border-rose-600 p-4 rounded">
            <div className="text-xs text-rose-700 font-semibold">📣 광고비</div>
            <div className="text-3xl font-extrabold text-rose-900 mt-1">{fmt(ad)}</div>
            <div className="text-[11px] text-rose-700 mt-1">ROAS {roas ? roas.toFixed(1) + "배" : "-"}</div>
          </div>
          <div className={`p-4 rounded border-l-4 ${netProfit >= 0 ? "bg-amber-50 border-amber-600" : "bg-slate-100 border-slate-500"}`}>
            <div className="text-xs text-amber-800 font-semibold">💎 순이익</div>
            <div className={`text-3xl font-extrabold mt-1 ${netProfit >= 0 ? "text-amber-900" : "text-rose-700"}`}>
              {netProfit >= 0 ? "" : "-"}{fmt(Math.abs(netProfit))}
            </div>
            <div className="text-[11px] text-amber-800 mt-1">순마진 {netMargin.toFixed(1)}%</div>
          </div>
        </div>

        {/* 주문/수량 */}
        <div className="bg-slate-50 rounded p-3 flex items-center justify-around text-sm mb-5">
          <div>
            <span className="text-slate-500">📦 주문 </span>
            <span className="font-extrabold text-lg">{fmt(t?.orders)}</span>
            <span className="text-slate-500 text-xs"> 건</span>
          </div>
          <div className="w-px h-8 bg-slate-300" />
          <div>
            <span className="text-slate-500">🎯 수량 </span>
            <span className="font-extrabold text-lg">{fmt(t?.qty)}</span>
            <span className="text-slate-500 text-xs"> 개</span>
          </div>
          {event.applied_skus.length > 0 && (
            <>
              <div className="w-px h-8 bg-slate-300" />
              <div>
                <span className="text-slate-500">🔖 등록 SKU </span>
                <span className="font-extrabold text-lg">{event.applied_skus.length}</span>
                <span className="text-slate-500 text-xs"> 종</span>
              </div>
            </>
          )}
        </div>

        {/* Top 상품 */}
        {top.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-bold text-slate-700 mb-2">🏆 매출 TOP {Math.min(5, top.length)}</div>
            <div className="space-y-1.5">
              {top.slice(0, 5).map((p, i) => {
                const pct = sale ? (p.sale / sale) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-5 text-center font-bold text-slate-500">{i + 1}.</div>
                    <div className="flex-1 truncate font-medium">{p.product_name}</div>
                    <div className="text-right shrink-0">
                      <span className="font-bold">{fmt(p.sale)}</span>
                      <span className="text-slate-500 text-xs"> 원 · {p.qty}개</span>
                      <span className="text-[10px] text-slate-400 ml-1">({pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 회고 / 메모 */}
        {(event.ops_retro_note || event.memo) && (
          <div className="bg-amber-50 border-l-4 border-amber-500 rounded p-3 mb-5">
            <div className="text-xs font-bold text-amber-900 mb-1">📝 회고 · 메모</div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">
              {event.ops_retro_note || event.memo}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="border-t pt-3 mt-5 text-[10px] text-slate-400 flex items-center justify-between">
          <div>도아 MD 에이전트 · 정산자동화웹 매출 기반</div>
          <div>출력 {new Date().toISOString().slice(0, 16).replace("T", " ")}</div>
        </div>
      </div>
    </div>
  );
}
