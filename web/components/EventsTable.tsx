"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, EventItem } from "@/lib/data";
import { apiUrl } from "@/lib/api";
import { themeOf } from "@/lib/channelTheme";
import { STATUS_BADGE, STATUS_OPTIONS, STATUS_PRIORITY, statusLabel } from "@/lib/status";

interface Props {
  events: EventItem[];
  contacts: Contact[];
  channelOptions: { key: string; name: string }[];
}

type SortKey =
  | "status"
  | "channel"
  | "title"
  | "vendor"
  | "period"
  | "sale"
  | "operating_profit"
  | "margin_rate";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "-";
  return Math.round(n).toLocaleString();
}

function dateStr(s: string | null): string {
  return s ? s.slice(0, 10) : "-";
}

function defaultPeriodStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function defaultPeriodEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30); // 한 달 앞까지
  return d.toISOString().slice(0, 10);
}

export default function EventsTable({ events, contacts, channelOptions }: Props) {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd());
  const [hideRSS, setHideRSS] = useState(true);
  const [doaOnly, setDoaOnly] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "status", dir: "asc" });
  const [selectedDetail, setSelectedDetail] = useState<EventItem | null>(null);

  // 채널별 contacts 매핑 (가장 최근 contact 1명)
  const contactByChannel = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts) {
      if (!m[c.channel_key]) m[c.channel_key] = c;
    }
    return m;
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (channelFilter && e.channel_key !== channelFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (hideRSS && !e.sale_start) return false;
      if (doaOnly && !e.is_doa_fit) return false;
      // 기간 필터: 행사 진행기간 (sale_start ~ sale_end) 이 [periodStart, periodEnd] 와 겹치는지
      // sale_start 없는 행사는 hideRSS=true 면 이미 거름. false 면 deadline_at 으로 검사.
      if (periodStart && periodEnd) {
        const ss = e.sale_start ? e.sale_start.slice(0, 10) : null;
        const se = e.sale_end ? e.sale_end.slice(0, 10) : ss;
        if (ss && se) {
          // overlap: ss <= periodEnd && se >= periodStart
          if (ss > periodEnd || se < periodStart) return false;
        } else if (!hideRSS) {
          // RSS 안내문 (기간 없음) — deadline_at 이 범위 내인지로 대체
          const dl = e.deadline_at ? e.deadline_at.slice(0, 10) : null;
          if (!dl || dl < periodStart || dl > periodEnd) return false;
        }
      }
      if (q) {
        const hay = `${e.title} ${e.vendor_name ?? ""} ${e.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, channelFilter, statusFilter, periodStart, periodEnd, hideRSS, doaOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const k = sort.key;
      if (k === "status") {
        return (STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]) * dir;
      }
      if (k === "channel") {
        return a.channel_key.localeCompare(b.channel_key) * dir;
      }
      if (k === "title") return a.title.localeCompare(b.title) * dir;
      if (k === "vendor") {
        return (a.vendor_name ?? "").localeCompare(b.vendor_name ?? "") * dir;
      }
      if (k === "period") {
        const av = a.sale_start ?? "";
        const bv = b.sale_start ?? "";
        return av.localeCompare(bv) * dir;
      }
      if (k === "sale") {
        return ((a.sales?.totals?.sale ?? 0) - (b.sales?.totals?.sale ?? 0)) * dir;
      }
      if (k === "operating_profit") {
        return ((a.sales?.totals?.operating_profit ?? 0) - (b.sales?.totals?.operating_profit ?? 0)) * dir;
      }
      if (k === "margin_rate") {
        const ar = (a.sales?.totals?.sale ?? 0) > 0 ? (a.sales!.totals!.operating_profit ?? 0) / a.sales!.totals!.sale : 0;
        const br = (b.sales?.totals?.sale ?? 0) > 0 ? (b.sales!.totals!.operating_profit ?? 0) / b.sales!.totals!.sale : 0;
        return (ar - br) * dir;
      }
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  // 합계 (행사 매출, 영업이익)
  const totals = useMemo(() => {
    let sale = 0;
    let op = 0;
    let count = 0;
    let withSales = 0;
    for (const e of sorted) {
      count++;
      if (e.sales?.totals) {
        sale += e.sales.totals.sale ?? 0;
        op += e.sales.totals.operating_profit ?? 0;
        withSales++;
      }
    }
    return { sale, op, count, withSales };
  }, [sorted]);

  const router = useRouter();

  // events 갱신 시 모달에 보이는 selectedDetail 도 새 데이터로 동기화
  useEffect(() => {
    if (!selectedDetail) return;
    const fresh = events.find((e) => e.dedup_id === selectedDetail.dedup_id);
    if (fresh && fresh !== selectedDetail) setSelectedDetail(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const toggleSort = (k: SortKey) => {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  };

  // 행 클릭 → 모달로 세부 정보. "캘린더에서 수정" 버튼은 모달 안.
  const openDetail = (event: EventItem) => setSelectedDetail(event);
  const goToCalendar = (dedup_id: string) => {
    router.push(`/?selected=${dedup_id}`);
  };

  // 모달 인라인 저장 — 상태/메모/기간/담당MD/광고비
  const [savingField, setSavingField] = useState<string | null>(null);
  async function patchEvent(dedupId: string, body: Record<string, unknown>, label: string) {
    const shortId = dedupId.slice(0, 6);
    setSavingField(label);
    try {
      const r = await fetch(apiUrl(`/api/event/${shortId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`저장 실패 (${label}): ${j?.error || r.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setSavingField(null);
    }
  }

  const sortIcon = (k: SortKey) => (sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div>
      {/* 필터 바 */}
      <div className="bg-white border rounded p-3 mb-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">📅 기간</span>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          />
          <span className="text-xs text-slate-500">~</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          />
          <button
            onClick={() => { setPeriodStart(defaultPeriodStart()); setPeriodEnd(defaultPeriodEnd()); }}
            className="text-xs px-2 py-1 border rounded text-slate-600 hover:bg-slate-50"
          >
            기본
          </button>
          <button
            onClick={() => { setPeriodStart(""); setPeriodEnd(""); }}
            className="text-xs px-2 py-1 border rounded text-slate-600 hover:bg-slate-50"
          >
            전 기간
          </button>
          <div className="ml-auto text-xs text-slate-600">
            <b>{totals.count}</b>건 · 행사 매출 <b>{fmt(totals.sale)}</b>원 · 영업이익 <b className="text-emerald-700">{fmt(totals.op)}</b>원
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="제목/업체/메모 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2 py-1 border rounded text-sm w-56"
          />
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">전 채널</option>
            {channelOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">전 상태</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input type="checkbox" checked={hideRSS} onChange={(e) => setHideRSS(e.target.checked)} />
            RSS 안내문(기간없음) 숨김
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input type="checkbox" checked={doaOnly} onChange={(e) => setDoaOnly(e.target.checked)} />
            도아 적합만
          </label>
        </div>
      </div>

      {/* 표 */}
      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs text-slate-700">
            <tr>
              <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("status")}>
                상태{sortIcon("status")}
              </th>
              <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("channel")}>
                채널{sortIcon("channel")}
              </th>
              <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("title")}>
                행사명{sortIcon("title")}
              </th>
              <th className="px-2 py-2 text-left">담당 MD</th>
              <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("vendor")}>
                업체{sortIcon("vendor")}
              </th>
              <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("period")}>
                기간{sortIcon("period")}
              </th>
              <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("sale")}>
                매출{sortIcon("sale")}
              </th>
              <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("operating_profit")}>
                영업이익{sortIcon("operating_profit")}
              </th>
              <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("margin_rate")}>
                마진율{sortIcon("margin_rate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-400">
                  조건에 맞는 행사가 없습니다.
                </td>
              </tr>
            ) : (
              sorted.map((e) => {
                const th = themeOf(e.channel_key);
                const contact = contactByChannel[e.channel_key];
                const sale = e.sales?.totals?.sale ?? 0;
                const op = e.sales?.totals?.operating_profit ?? 0;
                const margin = sale > 0 ? (op / sale) * 100 : null;
                return (
                  <tr
                    key={e.dedup_id}
                    className="border-b hover:bg-blue-50 align-top cursor-pointer"
                    onClick={() => openDetail(e)}
                    title="클릭하면 세부 정보 보기"
                  >
                    <td className="px-2 py-2">
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[e.status] ?? "bg-gray-100"}`}>
                        {statusLabel(e.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>{" "}
                      <span className="text-xs">{th.label}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-800">{e.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{e.dedup_id.slice(0, 6)}</div>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {e.md_owner_name ? (
                        <div className="font-semibold text-blue-700">👤 {e.md_owner_name}</div>
                      ) : contact ? (
                        <div>
                          <div className="font-medium text-slate-500">{contact.name}</div>
                          <div className="text-[10px] text-slate-400">채널 담당 (참고용)</div>
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {e.vendor_name ? (
                        <div>
                          <div>{e.vendor_name}</div>
                          {e.vendor_contact && <div className="text-[10px] text-slate-500">{e.vendor_contact}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      {e.sale_start ? (
                        <span>
                          {dateStr(e.sale_start)}
                          {e.sale_end && e.sale_end !== e.sale_start ? ` ~ ${dateStr(e.sale_end)}` : ""}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(sale)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap text-emerald-700">{fmt(op)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {margin === null ? "-" : `${margin.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-slate-400 mt-2">
        ※ 기본 = 이번 달 1일 ~ +30일. 종료된 행사도 기간 안이면 포함. 클릭 → 세부 모달. 모달에서 "캘린더에서 수정" 가능.
      </div>

      {/* 세부 모달 */}
      {selectedDetail && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* 상태 드롭다운 — 즉시 변경 */}
                  <select
                    value={selectedDetail.status}
                    disabled={savingField === "status"}
                    onChange={(e) => patchEvent(selectedDetail.dedup_id, { status: e.target.value }, "status")}
                    className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${STATUS_BADGE[selectedDetail.status] ?? "bg-gray-100"}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {(() => {
                    const th = themeOf(selectedDetail.channel_key);
                    return (
                      <span className="text-xs">
                        <span className={`font-mono font-extrabold ${th.bold}`}>{th.abbr}</span>{" "}
                        {th.label}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] text-slate-400 font-mono">{selectedDetail.dedup_id.slice(0, 6)}</span>
                  {savingField && (
                    <span className="text-[10px] text-slate-500">⏳ {savingField} 저장 중...</span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900">{selectedDetail.title}</h3>
              </div>
              <button
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                onClick={() => setSelectedDetail(null)}
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">담당 MD</span><br/>
                  {selectedDetail.md_owner_name ? (
                    <b className="text-blue-700">👤 {selectedDetail.md_owner_name}</b>
                  ) : (
                    <span className="text-slate-400">(미지정)</span>
                  )}
                </div>
                <div><span className="text-slate-500">업체</span><br/>
                  {selectedDetail.vendor_name ? <b>{selectedDetail.vendor_name}</b> : <span className="text-slate-400">-</span>}
                  {selectedDetail.vendor_contact && <span className="text-slate-500 ml-1">({selectedDetail.vendor_contact})</span>}
                </div>
                <div><span className="text-slate-500">기간</span><br/>
                  {selectedDetail.sale_start ? (
                    <b>{selectedDetail.sale_start.slice(0, 10)}{selectedDetail.sale_end && selectedDetail.sale_end !== selectedDetail.sale_start ? ` ~ ${selectedDetail.sale_end.slice(0, 10)}` : ""}</b>
                  ) : <span className="text-slate-400">-</span>}
                </div>
                <div><span className="text-slate-500">행사 유형 / 할인</span><br/>
                  {selectedDetail.event_type || "-"}
                  {selectedDetail.discount_rate != null && ` · ${(selectedDetail.discount_rate * 100).toFixed(0)}%`}
                  {selectedDetail.discount_burden && ` (${selectedDetail.discount_burden})`}
                </div>
              </div>

              {/* ✏️ 빠른 수정 — 자주 쓰는 필드만 인라인 저장 */}
              <QuickEditSection
                event={selectedDetail}
                savingField={savingField}
                onSave={(body, label) => patchEvent(selectedDetail.dedup_id, body, label)}
              />

              {selectedDetail.memo && (
                <div className="bg-slate-50 border rounded p-2 text-xs whitespace-pre-wrap">
                  📝 {selectedDetail.memo}
                </div>
              )}

              {selectedDetail.applied_skus.length > 0 && (
                <div className="border rounded p-2">
                  <div className="text-xs font-semibold text-slate-700 mb-1">등록 SKU ({selectedDetail.applied_skus.length}건)</div>
                  <ul className="text-xs space-y-0.5">
                    {selectedDetail.applied_skus.map((s, i) => (
                      <li key={i}>
                        {s.sku_name ?? `#${s.sku_id}`} — {s.sale_price.toLocaleString()}원 × {s.qty_est}건
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDetail.sales?.totals && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="text-xs font-semibold text-amber-900 mb-1">🎯 실 매출 (정산자동화웹)</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <div>매출 <b>{Math.round(selectedDetail.sales.totals.sale).toLocaleString()}</b>원</div>
                    <div>주문 <b>{selectedDetail.sales.totals.orders ?? 0}</b> / 수량 <b>{selectedDetail.sales.totals.qty ?? 0}</b></div>
                    <div>영업이익 <b className="text-emerald-700">{Math.round(selectedDetail.sales.totals.operating_profit ?? 0).toLocaleString()}</b>원</div>
                    <div>광고비 <b className="text-rose-600">{Math.round((selectedDetail.sales.totals.ad_cost ?? selectedDetail.sales.totals.ad_spend) ?? 0).toLocaleString()}</b>원</div>
                  </div>
                  {selectedDetail.sales_synced_at && (
                    <div className="text-[10px] text-amber-700 mt-1">갱신 {selectedDetail.sales_synced_at.slice(0, 16).replace("T", " ")}</div>
                  )}
                </div>
              )}

              {selectedDetail.ad_spend_manual != null && selectedDetail.ad_spend_manual > 0 && (
                <div className="text-xs">
                  💰 광고비 수동 입력: <b>{selectedDetail.ad_spend_manual.toLocaleString()}</b>원
                </div>
              )}

              <a href={selectedDetail.url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline block break-all">
                {selectedDetail.url}
              </a>
            </div>

            <div className="p-3 border-t bg-slate-50 flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm border rounded hover:bg-white"
                onClick={() => setSelectedDetail(null)}
              >
                닫기
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                onClick={() => {
                  const id = selectedDetail.dedup_id;
                  setSelectedDetail(null);
                  goToCalendar(id);
                }}
              >
                📅 캘린더에서 수정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface QuickEditProps {
  event: EventItem;
  savingField: string | null;
  onSave: (body: Record<string, unknown>, label: string) => Promise<void>;
}

function QuickEditSection({ event, savingField, onSave }: QuickEditProps) {
  // 이벤트 바뀌면 draft 도 새로
  const [memo, setMemo] = useState(event.memo ?? "");
  const [periodStart, setPeriodStart] = useState(event.sale_start?.slice(0, 10) ?? "");
  const [periodEnd, setPeriodEnd] = useState(event.sale_end?.slice(0, 10) ?? "");
  const [owner, setOwner] = useState(event.md_owner_name ?? "");
  const [adSpend, setAdSpend] = useState(event.ad_spend_manual != null ? String(event.ad_spend_manual) : "");

  useEffect(() => {
    setMemo(event.memo ?? "");
    setPeriodStart(event.sale_start?.slice(0, 10) ?? "");
    setPeriodEnd(event.sale_end?.slice(0, 10) ?? "");
    setOwner(event.md_owner_name ?? "");
    setAdSpend(event.ad_spend_manual != null ? String(event.ad_spend_manual) : "");
  }, [event.dedup_id, event.memo, event.sale_start, event.sale_end, event.md_owner_name, event.ad_spend_manual]);

  const memoChanged = memo !== (event.memo ?? "");
  const periodChanged = periodStart !== (event.sale_start?.slice(0, 10) ?? "") || periodEnd !== (event.sale_end?.slice(0, 10) ?? "");
  const ownerChanged = owner !== (event.md_owner_name ?? "");
  const adChanged = adSpend !== (event.ad_spend_manual != null ? String(event.ad_spend_manual) : "");

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded p-3 space-y-2">
      <div className="text-xs font-bold text-blue-900">✏️ 빠른 수정</div>

      {/* 담당 MD */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-600 w-16 shrink-0">담당 MD</label>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="이름"
          className="flex-1 text-xs border rounded px-2 py-1 bg-white"
        />
        <button
          disabled={!ownerChanged || savingField !== null}
          onClick={() => onSave({ md_owner_name: owner }, "담당 MD")}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-slate-300"
        >
          저장
        </button>
      </div>

      {/* 기간 */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-600 w-16 shrink-0">기간</label>
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-white"
        />
        <span className="text-xs text-slate-400">~</span>
        <input
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-white"
        />
        <button
          disabled={!periodChanged || !periodStart || !periodEnd || savingField !== null}
          onClick={() => onSave({ sale_start: periodStart, sale_end: periodEnd }, "기간")}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-slate-300"
        >
          저장
        </button>
      </div>

      {/* 광고비 */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-600 w-16 shrink-0">광고비</label>
        <input
          type="number"
          value={adSpend}
          onChange={(e) => setAdSpend(e.target.value)}
          placeholder="0"
          className="flex-1 text-xs border rounded px-2 py-1 bg-white"
        />
        <span className="text-xs text-slate-500">원</span>
        <button
          disabled={!adChanged || savingField !== null}
          onClick={() => onSave({ ad_spend: parseInt(adSpend || "0", 10) || 0 }, "광고비")}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-slate-300"
        >
          저장
        </button>
      </div>

      {/* 메모 */}
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-600 w-16 shrink-0 mt-1">메모</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="진행 상황·이슈 메모"
          className="flex-1 text-xs border rounded px-2 py-1 bg-white resize-none"
        />
        <button
          disabled={!memoChanged || savingField !== null}
          onClick={() => onSave({ memo }, "메모")}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-slate-300 self-start"
        >
          저장
        </button>
      </div>

      <div className="text-[10px] text-slate-500 mt-1">
        ※ 더 자세한 수정 (SKU 등록 / 업체 / 행사 유형 등) 은 아래 "📅 캘린더에서 수정" 버튼
      </div>
    </div>
  );
}
