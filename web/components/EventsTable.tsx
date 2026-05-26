"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, EventItem } from "@/lib/data";
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

export default function EventsTable({ events, contacts, channelOptions }: Props) {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [hideClosed, setHideClosed] = useState(true);
  const [hideRSS, setHideRSS] = useState(true);
  const [doaOnly, setDoaOnly] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "status", dir: "asc" });

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
      if (hideClosed && (e.status === "closed" || e.status === "skip")) return false;
      if (hideRSS && !e.sale_start) return false;
      if (doaOnly && !e.is_doa_fit) return false;
      if (q) {
        const hay = `${e.title} ${e.vendor_name ?? ""} ${e.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, channelFilter, statusFilter, hideClosed, hideRSS, doaOnly]);

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

  const toggleSort = (k: SortKey) => {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  };

  // 행 클릭 → 캘린더로 이동 + 자동 선택 (Calendar 의 useSearchParams 가 처리)
  const goToCalendar = (dedup_id: string) => {
    router.push(`/?selected=${dedup_id}`);
  };

  const sortIcon = (k: SortKey) => (sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div>
      {/* 필터 바 */}
      <div className="bg-white border rounded p-3 mb-3 flex flex-wrap items-center gap-2 text-sm">
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
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
          종료/패스 숨김
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-700">
          <input type="checkbox" checked={hideRSS} onChange={(e) => setHideRSS(e.target.checked)} />
          기간 없는 RSS 안내문 숨김
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-700">
          <input type="checkbox" checked={doaOnly} onChange={(e) => setDoaOnly(e.target.checked)} />
          도아 적합만
        </label>
        <div className="ml-auto text-xs text-slate-600">
          <b>{totals.count}</b>건 · 행사 매출 <b>{fmt(totals.sale)}</b>원 · 영업이익 <b className="text-emerald-700">{fmt(totals.op)}</b>원
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
                    onClick={() => goToCalendar(e.dedup_id)}
                    title="클릭하면 캘린더에서 이 행사를 열어 수정할 수 있어요"
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
                      {contact ? (
                        <div>
                          <div className="font-medium">{contact.name}</div>
                          {contact.kakao_id && <div className="text-[10px] text-slate-500">{contact.kakao_id}</div>}
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
        ※ 행 클릭 → 캘린더로 이동 + 우측 패널에서 수정 / 컬럼 헤더 클릭으로 정렬 / 기본은 종료·패스 + RSS 안내문 숨김
      </div>
    </div>
  );
}
