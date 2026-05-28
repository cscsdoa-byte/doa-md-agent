"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import type { EventItem } from "@/lib/data";
import { themeOf } from "@/lib/channelTheme";

type SortKey = "endSoon" | "sale" | "op" | "cannibal";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "endSoon",  label: "🏁 종료 임박" },
  { value: "sale",     label: "💰 매출 큰 순" },
  { value: "op",       label: "🟢 영업이익 큰 순" },
  { value: "cannibal", label: "⚡ 카니발 우선" },
];

interface ConflictInfo {
  other_short: string;
  other_title: string;
  other_channel: string;
  common_skus: number[];
}

interface Props {
  events: EventItem[];
  conflicts?: Record<string, ConflictInfo[]>;
}

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return Math.round(n).toLocaleString();
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

const STATUS_LABEL: Record<string, string> = {
  applied:  "📨 선정 대기",
  running:  "🔴 진행중",
  selected: "✅ 선정",
  closed:   "🏁 종료",
};

type StatusFilter = "active" | "pending" | "all" | "closed";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active",  label: "진행·선정" },
  { value: "pending", label: "📨 선정 대기" },
  { value: "all",     label: "전체" },
  { value: "closed",  label: "🏁 최근 종료" },
];

export default function OpsBoard({ events, conflicts = {} }: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("endSoon");
  const [mdFilter, setMdFilter] = useState<string>("");  // "" = 전체
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // MD 옵션 목록 (count 같이)
  const mdOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const k = (e.md_owner_name && e.md_owner_name.trim()) || "(미지정)";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (statusFilter === "active" && !(e.status === "running" || e.status === "selected")) return false;
      if (statusFilter === "pending" && e.status !== "applied") return false;
      if (statusFilter === "closed" && e.status !== "closed") return false;
      if (mdFilter && ((e.md_owner_name && e.md_owner_name.trim()) || "(미지정)") !== mdFilter) return false;
      return true;
    });
  }, [events, mdFilter, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === "endSoon") {
        if (a.status !== b.status) return a.status === "running" ? -1 : 1;
        return (a.sale_end ?? "9999").localeCompare(b.sale_end ?? "9999");
      }
      if (sortKey === "sale") {
        return (b.sales?.totals?.sale ?? 0) - (a.sales?.totals?.sale ?? 0);
      }
      if (sortKey === "op") {
        return (b.sales?.totals?.operating_profit ?? 0) - (a.sales?.totals?.operating_profit ?? 0);
      }
      // cannibal
      const ac = conflicts[a.dedup_id]?.length ?? 0;
      const bc = conflicts[b.dedup_id]?.length ?? 0;
      if (ac !== bc) return bc - ac;
      return (a.sale_end ?? "9999").localeCompare(b.sale_end ?? "9999");
    });
    return arr;
  }, [filtered, sortKey, conflicts]);

  async function refreshSales(short_id: string) {
    setError(null);
    setRefreshingId(short_id);
    try {
      const r = await fetch(apiUrl(`/api/event/${short_id}/sales`), { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshingId(null);
    }
  }

  const totals = useMemo(() => {
    let sale = 0;
    let op = 0;
    let ad = 0;
    let stockAlert = 0;
    let claimAlert = 0;
    let cannibalAlert = 0;
    for (const e of filtered) {
      sale += e.sales?.totals?.sale ?? 0;
      op += e.sales?.totals?.operating_profit ?? 0;
      ad += e.ad_spend_manual ?? 0;
      if (e.ops_stock_note && e.ops_stock_note.trim()) stockAlert++;
      if (e.ops_claim_note && e.ops_claim_note.trim()) claimAlert++;
      if ((conflicts[e.dedup_id]?.length ?? 0) > 0) cannibalAlert++;
    }
    return { sale, op, ad, stockAlert, claimAlert, cannibalAlert };
  }, [filtered, conflicts]);

  const pendingTotal = useMemo(
    () => events.filter((e) => e.status === "applied").length,
    [events],
  );

  return (
    <div className="space-y-4">
      {/* 선정 대기 배너 — pending 필터 아닐 때만 + 건수 있을 때만 */}
      {statusFilter !== "pending" && pendingTotal > 0 && (
        <button
          onClick={() => setStatusFilter("pending")}
          className="w-full bg-blue-50 border-2 border-blue-300 hover:bg-blue-100 rounded-lg px-4 py-3 flex items-center justify-between text-left transition"
        >
          <div>
            <div className="text-base font-bold text-blue-900">📨 선정 대기 {pendingTotal}건</div>
            <div className="text-xs text-blue-700 mt-0.5">
              MD에 신청은 넣었지만 아직 선정 결과를 못 받은 행사 — 검토 필요
            </div>
          </div>
          <span className="text-blue-700 font-bold whitespace-nowrap ml-3">→ 보기</span>
        </button>
      )}

      {/* 상단 요약 — 진행중·선정 합산 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-white border rounded p-3">
          <div className="text-[10px] text-slate-500">
            행사 수 {mdFilter ? `· ${mdFilter}` : ""}
          </div>
          <div className="text-xl font-bold text-slate-900">{filtered.length}</div>
        </div>
        <div className="bg-white border rounded p-3">
          <div className="text-[10px] text-slate-500">행사 매출 합계</div>
          <div className="text-xl font-bold text-amber-700">{fmt(totals.sale)}원</div>
        </div>
        <div className="bg-white border rounded p-3">
          <div className="text-[10px] text-slate-500">영업이익 합계</div>
          <div className="text-xl font-bold text-emerald-700">{fmt(totals.op)}원</div>
        </div>
        <div className="bg-white border rounded p-3">
          <div className="text-[10px] text-slate-500">집행 광고비</div>
          <div className="text-xl font-bold text-rose-600">{fmt(totals.ad)}원</div>
          <div className="text-[10px] text-slate-500">
            ROAS {totals.ad > 0 ? (totals.sale / totals.ad).toFixed(2) : "-"}배
          </div>
        </div>
        <div className="bg-white border rounded p-3">
          <div className="text-[10px] text-slate-500">⚠ 알림</div>
          <div className="text-xs text-slate-700 mt-1 leading-relaxed">
            재고 <b>{totals.stockAlert}</b> · 클레임 <b>{totals.claimAlert}</b>
            {totals.cannibalAlert > 0 && (
              <span className="text-orange-700 font-bold"> · ⚡카니발 {totals.cannibalAlert}</span>
            )}
          </div>
        </div>
      </div>

      {/* 필터 + 정렬 토글 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1 text-xs flex-wrap">
          <span className="text-slate-500 mr-1">상태</span>
          {STATUS_FILTER_OPTIONS.map((o) => {
            const cnt =
              o.value === "active"
                ? events.filter((e) => e.status === "running" || e.status === "selected").length
                : o.value === "pending"
                ? events.filter((e) => e.status === "applied").length
                : o.value === "closed"
                ? events.filter((e) => e.status === "closed").length
                : events.length;
            return (
              <button
                key={o.value}
                onClick={() => setStatusFilter(o.value)}
                className={`px-2 py-1 rounded border ${
                  statusFilter === o.value
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o.label} ({cnt})
              </button>
            );
          })}
        </div>
        {mdOptions.length > 1 && (
          <div className="flex items-center gap-1 text-xs flex-wrap">
            <span className="text-slate-500 mr-1">담당</span>
            <button
              onClick={() => setMdFilter("")}
              className={`px-2 py-1 rounded border ${
                mdFilter === ""
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              전체 ({events.length})
            </button>
            {mdOptions.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setMdFilter(name)}
                className={`px-2 py-1 rounded border ${
                  mdFilter === name
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                👤 {name} ({count})
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 mr-1">정렬</span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setSortKey(o.value)}
                className={`px-2 py-1 rounded border ${
                  sortKey === o.value
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((e) => {
          const th = themeOf(e.channel_key);
          const dEnd = daysUntil(e.sale_end);
          const sale = e.sales?.totals?.sale ?? 0;
          const op = e.sales?.totals?.operating_profit ?? 0;
          const ad = e.ad_spend_manual ?? 0;
          const roas = ad > 0 ? sale / ad : 0;
          const netProfit = op - ad;
          const margin = sale > 0 ? (op / sale) * 100 : 0;
          const attachments = e.attachments ?? [];
          const cardConflicts = conflicts[e.dedup_id] ?? [];
          const cleanTitle = e.title.replace(/^\[[^\]]+\]\s*/, "");

          return (
            <div
              key={e.dedup_id}
              className={`border-2 rounded-lg overflow-hidden ${
                cardConflicts.length > 0
                  ? "border-orange-500 bg-orange-50/40"
                  : e.status === "running"
                  ? "border-pink-400 bg-pink-50/30"
                  : e.status === "applied"
                  ? "border-blue-400 bg-blue-50/40"
                  : e.status === "closed"
                  ? "border-slate-300 bg-slate-50/60"
                  : "border-emerald-300 bg-emerald-50/30"
              }`}
            >
              <div className="px-3 py-2 flex items-center justify-between border-b bg-white">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`font-mono font-extrabold text-sm ${th.bold}`}>{th.abbr}</span>
                  <span className="text-xs text-slate-500">{th.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                </div>
                {dEnd !== null && (
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                      dEnd < 0
                        ? "bg-slate-200 text-slate-500"
                        : dEnd === 0
                        ? "bg-red-600 text-white"
                        : dEnd <= 3
                        ? "bg-orange-500 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                    title={`종료일 ${e.sale_end}`}
                  >
                    {dEnd < 0 ? `종료 D+${-dEnd}` : `종료 D-${dEnd}`}
                  </span>
                )}
              </div>

              <Link
                href={`/?selected=${e.short_id}`}
                className="block px-3 py-2 text-sm font-semibold text-slate-900 hover:underline truncate"
                title={e.title}
              >
                {cleanTitle}
              </Link>

              <div className="px-3 pb-2 text-[11px] text-slate-600 space-y-0.5">
                {e.sale_start && e.sale_end && (() => {
                  const start = new Date(e.sale_start);
                  const end = new Date(e.sale_end);
                  start.setHours(0, 0, 0, 0);
                  end.setHours(0, 0, 0, 0);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const total = Math.max(1, (end.getTime() - start.getTime()) / 86400000 + 1);
                  const elapsed = Math.max(0, (today.getTime() - start.getTime()) / 86400000 + 1);
                  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
                  const isLive = today >= start && today <= end;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span>📅 {e.sale_start.slice(5, 10)} ~ {e.sale_end.slice(5, 10)}</span>
                        <span className="text-[10px] tabular-nums text-slate-500">
                          {Math.min(Math.ceil(elapsed), Math.ceil(total))}/{Math.ceil(total)}일 · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded overflow-hidden mt-0.5">
                        <div
                          className={`h-full ${
                            isLive ? "bg-pink-500" : pct >= 100 ? "bg-slate-300" : "bg-emerald-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  );
                })()}
                {e.md_owner_name && <div>👤 {e.md_owner_name}</div>}
                {e.vendor_name && <div>🏢 {e.vendor_name}</div>}
              </div>

              {/* 매출 / 광고 / 마진 */}
              <div className="px-3 py-2 bg-white border-t grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] relative">
                <button
                  className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded border border-emerald-200 hover:bg-emerald-200 disabled:opacity-50"
                  disabled={
                    refreshingId !== null ||
                    (e.applied_skus?.length ?? 0) === 0 ||
                    !e.sale_start || !e.sale_end
                  }
                  title={
                    (e.applied_skus?.length ?? 0) === 0
                      ? "SKU 등록 필요"
                      : !e.sale_start
                      ? "진행기간 설정 필요"
                      : "정산자동화웹 매출 매칭"
                  }
                  onClick={() => refreshSales(e.short_id)}
                >
                  {refreshingId === e.short_id ? "…" : "🔄 매출"}
                </button>
                <div>
                  <span className="text-slate-500">매출 </span>
                  <b className="text-amber-800">{fmt(sale)}</b>원
                </div>
                <div>
                  <span className="text-slate-500">영업이익 </span>
                  <b className="text-emerald-700">{fmt(op)}</b>원
                </div>
                <div>
                  <span className="text-slate-500">광고비 </span>
                  <b className="text-rose-600">{fmt(ad)}</b>원
                </div>
                <div>
                  <span className="text-slate-500">마진 </span>
                  <b className={margin >= 10 ? "text-emerald-700" : margin >= 0 ? "text-amber-700" : "text-rose-600"}>
                    {margin.toFixed(1)}%
                  </b>
                </div>
                {ad > 0 && (
                  <>
                    <div>
                      <span className="text-slate-500">ROAS </span>
                      <b className={roas >= 3 ? "text-emerald-700" : roas >= 2 ? "text-amber-700" : "text-rose-600"}>
                        {roas.toFixed(2)}배
                      </b>
                    </div>
                    <div>
                      <span className="text-slate-500">실순이익 </span>
                      <b className={netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}>{fmt(netProfit)}</b>원
                    </div>
                  </>
                )}
              </div>

              {/* 구좌 캡쳐 썸네일 */}
              {attachments.length > 0 && (
                <div className="px-3 py-2 border-t bg-slate-50">
                  <div className="text-[10px] text-slate-500 mb-1">📸 구좌 노출 ({attachments.length})</div>
                  <div className="flex gap-1 overflow-x-auto">
                    {attachments.slice(0, 4).map((a) => (
                      <a
                        key={a.id}
                        href={apiUrl(`/api/event/${e.short_id}/attachment/${a.id}`)}
                        target="_blank"
                        rel="noopener"
                        className="shrink-0"
                        title={a.caption ?? a.original_name ?? ""}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={apiUrl(`/api/event/${e.short_id}/attachment/${a.id}`)}
                          alt=""
                          className="w-16 h-16 object-cover rounded border bg-white"
                        />
                      </a>
                    ))}
                    {attachments.length > 4 && (
                      <div className="shrink-0 w-16 h-16 rounded border bg-white flex items-center justify-center text-[11px] text-slate-500">
                        +{attachments.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 카니발 충돌 — 같은 SKU·기간 겹치는 다른 채널 행사 */}
              {cardConflicts.length > 0 && (
                <div className="px-3 py-2 border-t bg-orange-50 text-[11px] space-y-1">
                  <div className="font-semibold text-orange-900">
                    ⚡ 카니발 {cardConflicts.length}건 — SKU 분산 위험
                  </div>
                  {cardConflicts.slice(0, 2).map((c) => {
                    const oth = themeOf(c.other_channel);
                    const otherTitle = c.other_title.replace(/^\[[^\]]+\]\s*/, "");
                    return (
                      <Link
                        key={c.other_short}
                        href={`/?selected=${c.other_short}`}
                        className="block bg-white rounded px-2 py-1 hover:bg-orange-100"
                      >
                        <span className={`font-mono font-extrabold ${oth.bold}`}>{oth.abbr}</span>
                        <span className="ml-1 text-slate-700">{otherTitle}</span>
                        <span className="ml-1 text-[10px] text-slate-500">
                          SKU {c.common_skus.length}개 겹침
                        </span>
                      </Link>
                    );
                  })}
                  {cardConflicts.length > 2 && (
                    <div className="text-[10px] text-orange-700">+ {cardConflicts.length - 2}건 더</div>
                  )}
                </div>
              )}

              {/* 운영관리 메모 (재고/클레임) */}
              {(e.ops_stock_note || e.ops_claim_note) && (
                <div className="px-3 py-2 border-t bg-white text-[11px] space-y-1">
                  {e.ops_stock_note && (
                    <div className="bg-amber-50 border-l-2 border-amber-400 px-2 py-1 rounded">
                      <div className="text-[10px] font-semibold text-amber-900">📦 재고</div>
                      <div className="text-slate-700 whitespace-pre-wrap line-clamp-3">{e.ops_stock_note}</div>
                    </div>
                  )}
                  {e.ops_claim_note && (
                    <div className="bg-rose-50 border-l-2 border-rose-400 px-2 py-1 rounded">
                      <div className="text-[10px] font-semibold text-rose-900">🚨 클레임</div>
                      <div className="text-slate-700 whitespace-pre-wrap line-clamp-3">{e.ops_claim_note}</div>
                    </div>
                  )}
                </div>
              )}

              {e.memo && !e.ops_stock_note && !e.ops_claim_note && (
                <div className="px-3 py-2 border-t bg-white text-[11px] text-slate-600 line-clamp-2" title={e.memo}>
                  📝 {e.memo}
                </div>
              )}

              {/* 종료 행사의 회고 — 작성 여부 표시 */}
              {e.status === "closed" && (
                <div className="px-3 py-2 border-t bg-white text-[11px]">
                  {e.ops_retro_note && e.ops_retro_note.trim() ? (
                    <div className="bg-violet-50 border-l-2 border-violet-400 px-2 py-1 rounded">
                      <div className="text-[10px] font-semibold text-violet-900">📝 회고</div>
                      <div className="text-slate-700 whitespace-pre-wrap line-clamp-3">{e.ops_retro_note}</div>
                    </div>
                  ) : (
                    <Link
                      href={`/?selected=${e.short_id}`}
                      className="block bg-amber-50 border border-amber-200 px-2 py-1 rounded text-amber-900 hover:bg-amber-100 text-center font-semibold"
                    >
                      📝 회고 작성 필요 — 클릭해서 작성
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-400 text-center mt-2">
        ※ 매출/마진은 정산자동화웹 매칭 결과. 우측 패널에서 갱신하거나 다음 폴링(sales-all)을 기다리세요.
      </div>
    </div>
  );
}
