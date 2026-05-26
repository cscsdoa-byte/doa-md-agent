"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import type { Contact, EventAttachment, EventItem, EventTemplate } from "@/lib/data";
import type { ChannelDef } from "@/lib/channels";
import { themeOf } from "@/lib/channelTheme";
import { detectConflicts } from "@/lib/conflict";
import { daysFromToday, nextSeasons, seasonForDate } from "@/lib/season";

const STATUS_BADGE: Record<string, string> = {
  new: "bg-slate-200 text-slate-800 border-l-4 border-slate-500",
  reviewing: "bg-amber-200 text-amber-900 border-l-4 border-amber-600",
  applied: "bg-blue-200 text-blue-900 border-l-4 border-blue-600",
  selected: "bg-emerald-200 text-emerald-900 border-l-4 border-emerald-600",
  running: "bg-pink-300 text-pink-900 border-l-4 border-pink-700 font-bold",
  closed: "bg-slate-100 text-slate-500 border-l-4 border-slate-300 line-through",
  skip: "bg-slate-100 text-slate-400 border-l-4 border-slate-300 line-through opacity-70",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new",       label: "신규" },
  { value: "reviewing", label: "검토중" },
  { value: "applied",   label: "신청완료" },
  { value: "selected",  label: "선정" },
  { value: "running",   label: "진행중" },
  { value: "closed",    label: "종료" },
  { value: "skip",      label: "패스" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventDateKey(e: EventItem): string | null {
  const ref = e.sale_start || e.deadline_at || e.posted_at;
  const d = parseDate(ref);
  return d ? fmtKey(d) : null;
}

function inRange(e: EventItem, key: string): boolean {
  if (e.sale_start && e.sale_end) {
    const s = parseDate(e.sale_start);
    const en = parseDate(e.sale_end);
    if (s && en) {
      const k = parseDate(key);
      if (k && k >= s && k <= en) return true;
    }
  }
  return eventDateKey(e) === key;
}

function daysUntil(iso: string | null): number | null {
  const d = parseDate(iso);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export default function Calendar({
  events,
  channels,
  contacts,
  templates,
}: {
  events: EventItem[];
  channels: ChannelDef[];
  contacts: Contact[];
  templates: EventTemplate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doaOnly, setDoaOnly] = useState(true);

  // URL ?selected=<short_id 또는 dedup_id> 으로 들어오면 자동 선택 + 해당 행사 월로 이동
  const searchParams = useSearchParams();
  useEffect(() => {
    const sel = searchParams.get("selected");
    if (!sel) return;
    const ev = events.find((e) => e.dedup_id === sel || e.dedup_id.startsWith(sel));
    if (!ev) return;
    setSelectedId(ev.dedup_id);
    // 행사가 속한 월로 이동 (sale_start 우선, 없으면 posted_at)
    const anchor = ev.sale_start || ev.posted_at;
    if (anchor) {
      const d = new Date(anchor);
      if (!isNaN(d.getTime())) {
        setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  }, [searchParams, events]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 우측 패널 inline 폼 상태
  const [memoDraft, setMemoDraft] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [skuId, setSkuId] = useState("");
  const [skuPrice, setSkuPrice] = useState("");
  const [skuQty, setSkuQty] = useState("");
  // 본문 수정 (수동 등록 행사 한정)
  const [editTitle, setEditTitle] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editEventType, setEditEventType] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [editBurden, setEditBurden] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const [editVendor, setEditVendor] = useState("");
  const [editVendorContact, setEditVendorContact] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  // SKU 검색 (우측 패널)
  const [skuQuery, setSkuQuery] = useState("");
  const [skuHits, setSkuHits] = useState<{ id: number; product_name: string; cost: number; shipping_fee: number }[]>([]);
  const [skuSearching, setSkuSearching] = useState(false);

  async function searchSkusRight() {
    if (!skuQuery.trim()) { setSkuHits([]); return; }
    setSkuSearching(true);
    try {
      const r = await fetch(apiUrl(`/api/skus?q=${encodeURIComponent(skuQuery)}&limit=15`));
      const j = await r.json();
      setSkuHits(j.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSkuSearching(false);
    }
  }
  // 광고비 draft
  const [adSpendDraft, setAdSpendDraft] = useState("");
  // 진행중 운영관리 — 재고/클레임 메모 drafts
  const [stockDraft, setStockDraft] = useState("");
  const [claimDraft, setClaimDraft] = useState("");
  // 첨부(구좌 캡쳐) 업로드 상태
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [captionDraft, setCaptionDraft] = useState<Record<number, string>>({});

  // 새 행사 추가 폼 토글 — 판매채널만
  const salesChannels = useMemo(() => channels.filter((c) => c.is_sales), [channels]);
  const [newOpen, setNewOpen] = useState(false);
  const [newCh, setNewCh] = useState(salesChannels[0]?.key || "");
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [newSaleStart, setNewSaleStart] = useState("");
  const [newSaleEnd, setNewSaleEnd] = useState("");
  // 노션 매핑 필드
  const [newEventType, setNewEventType] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [newBurden, setNewBurden] = useState("");
  const [newExpected, setNewExpected] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const [newVendorContact, setNewVendorContact] = useState("");
  // SKU 자동 등록 (정산자동화웹 검색)
  const [newSkuQuery, setNewSkuQuery] = useState("");
  const [newSkuHits, setNewSkuHits] = useState<{ id: number; product_name: string; cost: number; shipping_fee: number }[]>([]);
  const [newSkuSearching, setNewSkuSearching] = useState(false);
  const [newPickedSku, setNewPickedSku] = useState<{ id: number; product_name: string; cost: number; shipping_fee: number } | null>(null);
  const [newSkuPrice, setNewSkuPrice] = useState("");
  const [newSkuQty, setNewSkuQty] = useState("");
  const [newAdSpend, setNewAdSpend] = useState("");

  // 빈 날짜 칸 클릭 → 그 날짜로 새 행사 폼 prefill + 펼치기
  function openNewEventForDate(dateKey: string) {
    setNewSaleStart(dateKey);
    setNewSaleEnd(dateKey);
    setNewOpen(true);
    if (typeof window !== "undefined") {
      setTimeout(() => {
        document.getElementById("new-event-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  async function searchSkusForNew() {
    if (!newSkuQuery.trim()) {
      setNewSkuHits([]);
      return;
    }
    setNewSkuSearching(true);
    try {
      const r = await fetch(apiUrl(`/api/skus?q=${encodeURIComponent(newSkuQuery)}&limit=15`));
      const j = await r.json();
      setNewSkuHits(j.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNewSkuSearching(false);
    }
  }

  async function apiCall(
    label: string,
    url: string,
    method: string,
    body?: object,
  ): Promise<boolean> {
    setError(null);
    setBusy(label);
    try {
      const r = await fetch(apiUrl(url), {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(
    () => events.filter((e) => (doaOnly ? e.is_doa_fit === 1 : true)),
    [events, doaOnly],
  );

  const monthGrid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const lastDay = new Date(year, month + 1, 0);
    const totalCells = Math.ceil((startWeekday + lastDay.getDate()) / 7) * 7;
    const cells: { date: Date; key: string; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, month, i - startWeekday + 1);
      cells.push({ date: d, key: fmtKey(d), inMonth: d.getMonth() === month });
    }
    return cells;
  }, [cursor]);

  const byDate = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const cell of monthGrid) {
      m.set(cell.key, filtered.filter((e) => inRange(e, cell.key)));
    }
    return m;
  }, [filtered, monthGrid]);

  const selected = selectedId ? events.find((e) => e.dedup_id === selectedId) ?? null : null;
  const todayKey = fmtKey(new Date());

  // 선택 행사 변경 시 폼 초기화
  useEffect(() => {
    if (selected) {
      setMemoDraft(selected.memo ?? "");
      setPeriodStart(selected.sale_start ?? "");
      setPeriodEnd(selected.sale_end ?? "");
      setSkuId("");
      setSkuPrice("");
      setSkuQty("");
      setEditTitle(selected.title);
      setEditDeadline(selected.deadline_at ? selected.deadline_at.slice(0, 10) : "");
      setEditCategory(selected.category ?? "");
      setEditEventType(selected.event_type ?? "");
      setEditDiscount(selected.discount_rate != null ? String(selected.discount_rate * 100) : "");
      setEditBurden(selected.discount_burden ?? "");
      setEditExpected(selected.expected_revenue != null ? String(selected.expected_revenue) : "");
      setEditVendor(selected.vendor_name ?? "");
      setEditVendorContact(selected.vendor_contact ?? "");
      setEditOwner(selected.md_owner_name ?? "");
      setEditChannel(selected.channel_key);
      setShowEdit(false);
      setAdSpendDraft(selected.ad_spend_manual ? String(selected.ad_spend_manual) : "");
      setStockDraft(selected.ops_stock_note ?? "");
      setClaimDraft(selected.ops_claim_note ?? "");
      setUploadCaption("");
      setCaptionDraft({});
      setSkuQuery(""); setSkuHits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function saveAdSpend() {
    if (!selected) return;
    const v = parseInt(adSpendDraft || "0", 10) || 0;
    await apiCall("ad-spend", `/api/event/${selected.short_id}`, "PATCH", { ad_spend: v });
  }

  async function saveOpsNote(kind: "stock" | "claim", value: string) {
    if (!selected) return;
    setError(null);
    setBusy(`ops-${kind}`);
    try {
      const r = await fetch(apiUrl(`/api/event/${selected.short_id}/ops-note`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleAttachUpload(file: File) {
    if (!selected) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (uploadCaption.trim()) fd.append("caption", uploadCaption.trim());
      const r = await fetch(apiUrl(`/api/event/${selected.short_id}/attachment`), {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      setUploadCaption("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachDelete(attach: EventAttachment) {
    if (!selected) return;
    if (!confirm(`이 캡쳐를 삭제할까요?\n${attach.caption ?? attach.original_name ?? attach.filename}`)) return;
    await apiCall("attach-del", `/api/event/${selected.short_id}/attachment/${attach.id}`, "DELETE");
  }

  async function handleAttachCaption(attach: EventAttachment) {
    if (!selected) return;
    const next = captionDraft[attach.id] ?? "";
    if (next === (attach.caption ?? "")) return;
    await apiCall(
      "attach-cap",
      `/api/event/${selected.short_id}/attachment/${attach.id}`,
      "PATCH",
      { caption: next },
    );
  }

  async function saveEditFields() {
    if (!selected) return;
    await apiCall("update", `/api/event/${selected.short_id}`, "PATCH", {
      title: editTitle,
      deadline: editDeadline,
      category: editCategory,
      event_type: editEventType,
      discount_rate: editDiscount ? parseFloat(editDiscount) / 100 : -1,  // -1 = clear
      discount_burden: editBurden,
      expected_revenue: editExpected ? parseInt(editExpected, 10) : 0,    // 0 = clear
      vendor_name: editVendor,
      vendor_contact: editVendorContact,
      md_owner_name: editOwner,
      channel_key: editChannel !== selected.channel_key ? editChannel : undefined,
    });
    setShowEdit(false);
  }
  async function deleteEvent() {
    if (!selected) return;
    const isManual = selected.source === "manual";
    const msg = isManual
      ? `이 행사를 삭제합니다. 복구 불가.\n\n${selected.title}\n\n진행할까요?`
      : `이 행사는 RSS로 수집된 행사라 삭제하면 다음 polling 에서 재수집됩니다.\n상태/메모/SKU/기간/매출은 초기화 됩니다.\n\n${selected.title}\n\n초기화할까요?`;
    if (!confirm(msg)) return;
    const mode = isManual ? "delete" : "reset";
    const ok = await apiCall("delete", `/api/event/${selected.short_id}?mode=${mode}`, "DELETE");
    if (ok && isManual) setSelectedId(null); // 삭제된 경우 선택 해제
  }

  async function saveStatus(s: string) {
    if (selected) await apiCall("status", `/api/event/${selected.short_id}`, "PATCH", { status: s });
  }
  async function saveMemo() {
    if (selected) await apiCall("memo", `/api/event/${selected.short_id}`, "PATCH", { memo: memoDraft });
  }
  async function savePeriod() {
    if (selected && periodStart && periodEnd) {
      await apiCall("period", `/api/event/${selected.short_id}`, "PATCH", {
        sale_start: periodStart,
        sale_end: periodEnd,
      });
    }
  }
  async function addSku() {
    if (!selected) return;
    const id = parseInt(skuId, 10);
    const price = parseInt(skuPrice, 10);
    const qty = parseInt(skuQty || "0", 10);
    if (!id || !price) {
      setError("SKU id, 행사가 필수");
      return;
    }
    const ok = await apiCall("register", `/api/event/${selected.short_id}/register`, "POST", {
      sku_id: id,
      sale_price: price,
      qty,
    });
    if (ok) {
      setSkuId(""); setSkuPrice(""); setSkuQty("");
    }
  }
  async function removeSku(sku_id: number) {
    if (!selected) return;
    await apiCall("unregister", `/api/event/${selected.short_id}/register?sku_id=${sku_id}`, "DELETE");
  }
  async function syncSales() {
    if (!selected) return;
    await apiCall("sales", `/api/event/${selected.short_id}/sales`, "POST");
  }
  async function createEvent() {
    if (!newCh || !newTitle) {
      setError("채널과 제목 필수");
      return;
    }
    if ((newSaleStart && !newSaleEnd) || (!newSaleStart && newSaleEnd)) {
      setError("진행기간은 시작·종료 둘 다 입력");
      return;
    }
    if (newPickedSku && (!newSkuPrice || parseInt(newSkuPrice, 10) <= 0)) {
      setError("SKU 선택 시 행사가 필수");
      return;
    }
    setError(null);
    setBusy("add-event");
    try {
      // 1. 행사 등록
      const r = await fetch(apiUrl(`/api/event`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_key: newCh,
          title: newTitle,
          deadline: newDeadline || undefined,
          category: newCategory || undefined,
          memo: newMemo || undefined,
          sale_start: newSaleStart || undefined,
          sale_end: newSaleEnd || undefined,
          event_type: newEventType || undefined,
          discount_rate: newDiscount ? parseFloat(newDiscount) / 100 : undefined,
          discount_burden: newBurden || undefined,
          expected_revenue: newExpected ? parseInt(newExpected, 10) : undefined,
          vendor_name: newVendor || undefined,
          vendor_contact: newVendorContact || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.dedup_id) {
        setError(j.error || "행사 등록 실패");
        return;
      }
      const newId = j.dedup_id.slice(0, 6);

      // 2. SKU 자동 등록 (선택 사항)
      if (newPickedSku && newSkuPrice) {
        await fetch(apiUrl(`/api/event/${newId}/register`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku_id: newPickedSku.id,
            sale_price: parseInt(newSkuPrice, 10),
            qty: parseInt(newSkuQty || "0", 10) || 0,
          }),
        });
      }

      // 3. 광고비 (선택 사항)
      const ad = parseInt(newAdSpend || "0", 10);
      if (ad > 0) {
        await fetch(apiUrl(`/api/event/${newId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ad_spend: ad }),
        });
      }

      // 폼 초기화 + 닫기
      setNewTitle(""); setNewDeadline(""); setNewCategory(""); setNewMemo("");
      setNewSaleStart(""); setNewSaleEnd("");
      setNewSkuQuery(""); setNewSkuHits([]); setNewPickedSku(null);
      setNewSkuPrice(""); setNewSkuQty(""); setNewAdSpend("");
      setNewEventType(""); setNewDiscount(""); setNewBurden("");
      setNewExpected(""); setNewVendor(""); setNewVendorContact("");
      setNewOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // 라이브 중 = status=running 이거나 (sale_start~sale_end 가 오늘 포함 + 종료 아닌 상태)
  const liveEvents = useMemo(() => {
    const todayK = fmtKey(new Date());
    return events.filter((e) => {
      if (e.status === "closed" || e.status === "skip") return false;
      if (e.status === "running") return true;
      if (e.sale_start && e.sale_end) {
        return todayK >= e.sale_start.slice(0, 10) && todayK <= e.sale_end.slice(0, 10);
      }
      return false;
    });
  }, [events]);

  // 오늘 마감 + 내일 마감 행사 (도아 적합만, 미진행)
  const urgent = useMemo(() => {
    return events.filter((e) => {
      if (e.is_doa_fit !== 1) return false;
      if (["closed", "skip", "running", "selected"].includes(e.status)) return false;
      const d = daysUntil(e.deadline_at);
      return d !== null && d >= 0 && d <= 1;
    });
  }, [events]);

  // D-0 (오늘 자정 마감) — 별도 강조용
  const today0 = useMemo(
    () => urgent.filter((e) => daysUntil(e.deadline_at) === 0),
    [urgent],
  );

  // 카니발리제이션 충돌 검출
  const conflicts = useMemo(() => detectConflicts(events), [events]);

  // 다음 시즌 (떡집 매출에 중요한 명절/기념일)
  const upcomingSeasons = useMemo(() => nextSeasons(new Date(), 4, 5), []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      {/* Calendar */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-semibold">
            {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-1.5 mr-2">
              <input type="checkbox" checked={doaOnly} onChange={(e) => setDoaOnly(e.target.checked)} />
              <span>도아 적합만</span>
            </label>
            <button
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
              onClick={() => setNewOpen((v) => !v)}
            >
              {newOpen ? "취소" : "+ MD 직접 행사"}
            </button>
            <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              ← 이전
            </button>
            <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50" onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); }}>
              오늘
            </button>
            <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              다음 →
            </button>
          </div>
        </div>

        {newOpen && (
          <div id="new-event-form" className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded space-y-2">
            <div className="text-sm font-semibold text-emerald-900">MD 직접 연락받은 행사 등록</div>
            {templates.length > 0 && (
              <div>
                <label className="text-xs text-emerald-900 block mb-1">템플릿에서 가져오기 (선택)</label>
                <select
                  className="w-full text-sm border rounded px-2 py-1.5"
                  defaultValue=""
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === parseInt(e.target.value, 10));
                    if (t) {
                      setNewCh(t.channel_key);
                      setNewTitle(t.title_pattern);
                      setNewCategory(t.category ?? "");
                      setNewMemo(t.memo ?? "");
                    }
                  }}
                >
                  <option value="">— 직접 입력 —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{themeOf(t.channel_key).abbr}] {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-emerald-900 block mb-1">채널 *</label>
                <select className="w-full text-sm border rounded px-2 py-1.5" value={newCh} onChange={(e) => setNewCh(e.target.value)}>
                  <optgroup label="── 운영 중 (판매채널) ──">
                    {channels.filter((c) => c.is_sales).map((c) => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── 정보채널 / 미입점 ──">
                    {channels.filter((c) => !c.is_sales).map((c) => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs text-emerald-900 block mb-1">행사 제목 *</label>
                <input type="text" placeholder="예: 6월 신선식품 기획전" className="w-full text-sm border rounded px-2 py-1.5" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-emerald-900 block mb-1">신청 마감일</label>
                <input type="date" className="w-full text-sm border rounded px-2 py-1.5" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-emerald-900 block mb-1">카테고리 (선택)</label>
                <input type="text" placeholder="예: 신선, 푸드" className="w-full text-sm border rounded px-2 py-1.5" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-emerald-900 block mb-1">진행기간 시작</label>
                <input type="date" className="w-full text-sm border rounded px-2 py-1.5" value={newSaleStart} onChange={(e) => setNewSaleStart(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-emerald-900 block mb-1">진행기간 종료</label>
                <input type="date" className="w-full text-sm border rounded px-2 py-1.5" value={newSaleEnd} onChange={(e) => setNewSaleEnd(e.target.value)} />
              </div>
            </div>
            {/* 노션 매핑 — 행사 상세 */}
            <div className="border-t border-emerald-200 pt-2 mt-2">
              <div className="text-xs font-semibold text-emerald-900 mb-1.5">행사 상세 (선택)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-emerald-900 block mb-0.5">행사유형</label>
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newEventType} onChange={(e) => setNewEventType(e.target.value)}>
                    <option value="">— 선택 —</option>
                    <option>기획전</option>
                    <option>오늘끝딜</option>
                    <option>타임특가</option>
                    <option>하루특가</option>
                    <option>톡딜</option>
                    <option>특가왕</option>
                    <option>메인구좌</option>
                    <option>라이브</option>
                    <option>푸드페스타</option>
                    <option>한입발견회</option>
                    <option>기타</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-emerald-900 block mb-0.5">할인율 (%)</label>
                  <input type="number" placeholder="10" className="w-full text-sm border rounded px-2 py-1.5" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-emerald-900 block mb-0.5">할인부담주체</label>
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newBurden} onChange={(e) => setNewBurden(e.target.value)}>
                    <option value="">— 선택 —</option>
                    <option>도아</option>
                    <option>채널</option>
                    <option>분담</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-emerald-900 block mb-0.5">예상매출 (원)</label>
                  <input type="number" placeholder="1000000" className="w-full text-sm border rounded px-2 py-1.5" value={newExpected} onChange={(e) => setNewExpected(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-emerald-900 block mb-0.5">업체명 (벤더사)</label>
                  <input type="text" placeholder="예: ㅇㅇ유통" className="w-full text-sm border rounded px-2 py-1.5" value={newVendor} onChange={(e) => setNewVendor(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-emerald-900 block mb-0.5">업체 연락처</label>
                  <input type="text" placeholder="010-..." className="w-full text-sm border rounded px-2 py-1.5" value={newVendorContact} onChange={(e) => setNewVendorContact(e.target.value)} />
                </div>
              </div>
            </div>

            <label className="text-xs text-emerald-900 block mb-0.5 mt-2">메모 / 코멘트</label>
            <textarea placeholder="메모 (MD 이름, 통화 내용, 행사 조건, 추가 코멘트 등)" rows={3} className="w-full text-sm border rounded px-2 py-1.5" value={newMemo} onChange={(e) => setNewMemo(e.target.value)} />

            {/* SKU 자동 등록 (선택 사항) */}
            <div className="border-t border-emerald-200 pt-2 mt-2">
              <div className="text-xs font-semibold text-emerald-900 mb-1.5">SKU 등록 (선택 — 정산자동화웹 검색)</div>
              {!newPickedSku ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="예: 밤설기, 쑥콩설기, 두쫀모…"
                    className="flex-1 text-sm border rounded px-2 py-1.5"
                    value={newSkuQuery}
                    onChange={(e) => setNewSkuQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") searchSkusForNew(); }}
                  />
                  <button
                    type="button"
                    onClick={searchSkusForNew}
                    disabled={newSkuSearching}
                    className="text-sm px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {newSkuSearching ? "검색 중…" : "🔍"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-emerald-100 px-2 py-1.5 rounded text-xs">
                  <span>
                    선택됨: <b>{newPickedSku.product_name}</b>
                    {" "}· 원가 {newPickedSku.cost.toLocaleString()}원
                    {" "}· 택배 {newPickedSku.shipping_fee.toLocaleString()}원
                  </span>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800 ml-2"
                    onClick={() => { setNewPickedSku(null); setNewSkuPrice(""); setNewSkuQty(""); }}
                    title="SKU 선택 해제"
                  >
                    ×
                  </button>
                </div>
              )}

              {newSkuHits.length > 0 && !newPickedSku && (
                <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                  {newSkuHits.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setNewPickedSku(s); setNewSkuHits([]); }}
                      className="w-full text-left text-xs bg-white hover:bg-emerald-50 border rounded px-2 py-1.5 flex justify-between gap-2"
                    >
                      <span className="flex-1">{s.product_name}</span>
                      <span className="text-gray-500">원가 {s.cost.toLocaleString()}원 · 택배 {s.shipping_fee.toLocaleString()}원</span>
                    </button>
                  ))}
                </div>
              )}

              {newPickedSku && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className="text-[11px] text-emerald-900 block mb-0.5">행사가 (원) *</label>
                    <input
                      type="number"
                      placeholder="29900"
                      className="w-full text-sm border rounded px-2 py-1.5"
                      value={newSkuPrice}
                      onChange={(e) => setNewSkuPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-emerald-900 block mb-0.5">예상 수량</label>
                    <input
                      type="number"
                      placeholder="100"
                      className="w-full text-sm border rounded px-2 py-1.5"
                      value={newSkuQty}
                      onChange={(e) => setNewSkuQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-emerald-900 block mb-0.5">광고비 (원)</label>
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full text-sm border rounded px-2 py-1.5"
                      value={newAdSpend}
                      onChange={(e) => setNewAdSpend(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50" onClick={() => setNewOpen(false)}>취소</button>
              <button className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50" disabled={busy !== null} onClick={createEvent}>
                {busy === "add-event" ? "등록 중…" : "등록"}
              </button>
            </div>
          </div>
        )}

        {today0.length > 0 && (
          <div className="mb-4 bg-red-600 text-white p-4 rounded shadow-lg">
            <div className="text-base font-bold flex items-center gap-2">
              🚨 오늘 자정 마감 {today0.length}건
              <span className="text-xs font-normal opacity-90">지금 신청 안 하면 일주일 날아갑니다</span>
            </div>
            <ul className="mt-2 space-y-1">
              {today0.map((e) => {
                const th = themeOf(e.channel_key);
                return (
                  <li key={e.dedup_id}>
                    <button onClick={() => setSelectedId(e.dedup_id)} className="text-sm text-left hover:underline w-full">
                      <span className="font-mono font-bold mr-2">[{th.abbr}]</span>
                      {e.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {urgent.length > today0.length && (
          <div className="mb-4 bg-orange-50 border-l-4 border-orange-500 p-3 rounded">
            <div className="text-sm font-bold text-orange-900">⚠ 내일 마감 ({urgent.length - today0.length}건)</div>
            <ul className="mt-1.5 space-y-1">
              {urgent.filter((e) => daysUntil(e.deadline_at) === 1).map((e) => {
                const th = themeOf(e.channel_key);
                return (
                  <li key={e.dedup_id}>
                    <button onClick={() => setSelectedId(e.dedup_id)} className="text-xs text-left hover:underline w-full">
                      <span className="font-mono font-bold mr-1.5">[{th.abbr}]</span>
                      <span className="text-orange-700 font-bold">D-1</span>{" "}
                      <span className="text-gray-800">{e.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {liveEvents.length > 0 && (
          <div className="mb-4 bg-pink-50 border-l-4 border-pink-500 p-3 rounded">
            <div className="text-sm font-bold text-pink-900">🔴 라이브 중 ({liveEvents.length}건)</div>
            <ul className="mt-1.5 space-y-1">
              {liveEvents.map((e) => {
                const th = themeOf(e.channel_key);
                const period =
                  e.sale_start && e.sale_end
                    ? `${e.sale_start.slice(0, 10)}~${e.sale_end.slice(0, 10)}`
                    : "기간 미정";
                const sale = e.sales?.totals?.sale ? Math.round(e.sales.totals.sale) : null;
                return (
                  <li key={e.dedup_id}>
                    <button onClick={() => setSelectedId(e.dedup_id)} className="text-xs text-left hover:underline w-full">
                      <span className="font-mono font-bold mr-1.5">[{th.abbr}]</span>
                      <span className="text-gray-800">{e.title}</span>
                      <span className="text-gray-500 ml-1.5">[{period}]</span>
                      {sale !== null && (
                        <span className="ml-1.5 text-emerald-700 font-medium">
                          매출 {sale.toLocaleString()}원
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {upcomingSeasons.length > 0 && (
          <div className="mb-4 bg-purple-50 border-l-4 border-purple-400 p-3 rounded">
            <div className="text-xs font-bold text-purple-900 mb-1.5">🎉 다음 시즌 (떡집 매출 핵심)</div>
            <div className="flex flex-wrap gap-2">
              {upcomingSeasons.map((s) => {
                const d = daysFromToday(s.date);
                const isTop = s.importance >= 9;
                return (
                  <span
                    key={s.date}
                    className={`text-xs px-2 py-1 rounded ${isTop ? "bg-purple-200 text-purple-900 font-bold" : "bg-white text-purple-700"}`}
                    title={s.date}
                  >
                    {s.name} <b>D-{d}</b>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`bg-gray-50 px-2 py-1.5 text-xs font-semibold ${i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-gray-700"}`}>
              {w}
            </div>
          ))}
          {monthGrid.map((cell) => {
            const items = byDate.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            return (
              <div
                key={cell.key}
                onClick={(e) => {
                  if (!cell.inMonth) return;
                  if ((e.target as HTMLElement).closest("button")) return;
                  openNewEventForDate(cell.key);
                }}
                className={`bg-white min-h-[110px] p-1.5 ${cell.inMonth ? "cursor-pointer hover:bg-emerald-50/60 transition-colors" : "bg-gray-50 text-gray-400"} ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}`}
                title={cell.inMonth ? `${cell.key} 클릭하면 이 날짜로 새 행사 등록` : ""}
              >
                <div className={`text-xs mb-1 ${isToday ? "font-bold text-blue-600" : ""}`}>{cell.date.getDate()}</div>
                {(() => {
                  const season = seasonForDate(cell.key);
                  return season ? (
                    <div className={`text-[10px] font-medium mb-1 ${season.importance >= 9 ? "text-red-600 font-bold" : "text-purple-600"}`}>
                      🎉 {season.name}
                    </div>
                  ) : null;
                })()}
                <div className="space-y-1">
                  {items.slice(0, 4).map((e) => {
                    const d = daysUntil(e.deadline_at);
                    const isUrgent = d !== null && d >= 0 && d <= 3 && e.status !== "closed" && e.status !== "skip";
                    const hasConflict = conflicts.has(e.dedup_id);
                    const th = themeOf(e.channel_key);
                    return (
                      <button
                        key={e.dedup_id}
                        onClick={() => setSelectedId(e.dedup_id)}
                        className={`w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded truncate ${STATUS_BADGE[e.status] ?? "bg-gray-100 text-gray-700"} ${selectedId === e.dedup_id ? "ring-1 ring-blue-500" : ""} hover:opacity-80 flex items-center gap-1`}
                        title={`${th.label} · ${e.title}`}
                      >
                        <span className={`font-mono font-extrabold shrink-0 text-[11px] ${th.bold}`}>{th.abbr}</span>
                        {isUrgent && <span className="text-red-600 font-bold shrink-0" title="마감 임박">⚠</span>}
                        {hasConflict && <span className="text-orange-600 font-bold shrink-0" title="다른 채널과 같은 SKU·기간 충돌">⚡</span>}
                        <span className="truncate">
                          {e.title.replace(/^\[[^\]]+\]\s*/, "")}
                        </span>
                      </button>
                    );
                  })}
                  {items.length > 4 && <div className="text-[10px] text-gray-500 px-1">+{items.length - 4}건</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <aside className="bg-white border rounded p-4 h-fit sticky top-4 space-y-3">
        {!selected ? (
          <div className="text-sm text-gray-500 py-12 text-center">
            왼쪽 캘린더의 행사를 클릭하면<br />
            여기에 상세 정보가 표시됩니다.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-500">{selected.short_id}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[selected.status]}`}>{selected.status_label}</span>
              {selected.source === "manual" && <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800">수동등록</span>}
              {(() => {
                const d = daysUntil(selected.deadline_at);
                if (d === null) return null;
                if (d < 0) return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">마감지남</span>;
                if (d === 0) return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold">오늘 마감</span>;
                if (d <= 3) return <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-bold">D-{d}</span>;
                return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">D-{d}</span>;
              })()}
            </div>
            <h3 className="text-base font-semibold leading-snug">{selected.title}</h3>
            <div className="text-xs text-gray-600 space-y-0.5">
              <div>채널: <b>[{themeOf(selected.channel_key).abbr}] {themeOf(selected.channel_key).label}</b></div>
              {selected.event_type && <div>행사유형: <b className="text-indigo-700">{selected.event_type}</b></div>}
              {selected.category && <div>카테고리: {selected.category}</div>}
              {selected.deadline_at && <div>마감: {selected.deadline_at.replace("T", " ").slice(0, 16)}</div>}
              {selected.discount_rate != null && (
                <div>할인율: <b>{(selected.discount_rate * 100).toFixed(0)}%</b>
                  {selected.discount_burden && <span className="text-gray-500"> · 부담: {selected.discount_burden}</span>}
                </div>
              )}
              {selected.expected_revenue != null && (
                <div>예상매출: <b className="text-emerald-700">{selected.expected_revenue.toLocaleString()}원</b></div>
              )}
              {(selected.vendor_name || selected.vendor_contact) && (
                <div>업체: {selected.vendor_name ?? "-"}{selected.vendor_contact && <span className="text-gray-500"> · {selected.vendor_contact}</span>}</div>
              )}
            </div>

            {(() => {
              const conflictList = conflicts.get(selected.dedup_id);
              if (!conflictList || conflictList.length === 0) return null;
              return (
                <div className="text-xs bg-orange-50 border-l-4 border-orange-500 p-2 rounded space-y-1">
                  <div className="font-bold text-orange-800">⚡ 카니발리제이션 경고 ({conflictList.length}건)</div>
                  <div className="text-orange-700 text-[11px]">같은 SKU·같은 기간 다른 채널 동시 진행:</div>
                  {conflictList.map((c) => {
                    const oth = themeOf(c.other_channel);
                    return (
                      <button
                        key={c.other_id}
                        onClick={() => setSelectedId(c.other_id)}
                        className="block w-full text-left text-[11px] hover:underline text-orange-900"
                      >
                        <span className="font-mono font-bold">[{oth.abbr}]</span> {c.other_title}
                        <span className="text-orange-600 ml-1">· 겹치는 SKU: {c.common_skus.join(", ")}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* 상태 변경 */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">상태 변경</label>
              <select className="w-full text-sm border rounded px-2 py-1.5 bg-white disabled:opacity-50" value={selected.status} disabled={busy !== null} onChange={(e) => saveStatus(e.target.value)}>
                {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>

            {/* 메모 */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">메모</label>
              <textarea rows={2} className="w-full text-sm border rounded px-2 py-1.5" value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} />
              <div className="flex justify-end mt-1">
                <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" disabled={busy !== null || memoDraft === (selected.memo ?? "")} onClick={saveMemo}>
                  {busy === "memo" ? "저장 중…" : "메모 저장"}
                </button>
              </div>
            </div>

            {/* 진행 기간 */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">진행 기간</label>
              <div className="flex gap-2">
                <input type="date" className="flex-1 text-sm border rounded px-2 py-1.5" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                <span className="self-center text-gray-400">~</span>
                <input type="date" className="flex-1 text-sm border rounded px-2 py-1.5" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
              <div className="flex justify-end mt-1">
                <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" disabled={busy !== null || !periodStart || !periodEnd} onClick={savePeriod}>
                  {busy === "period" ? "저장 중…" : "기간 저장"}
                </button>
              </div>
            </div>

            {/* 등록 SKU */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">등록 SKU</label>
              <div className="space-y-1 mb-2">
                {selected.applied_skus.length === 0 && <div className="text-xs text-gray-400 italic">없음</div>}
                {selected.applied_skus.map((s) => {
                  const feeRate = themeOf(selected.channel_key);
                  void feeRate; // channel theme 사용은 다른 곳에서. 시뮬은 channel default rate 가 yaml 측이라 단순 URL 전달.
                  const simUrl = `/simulator?cost=0&price=${s.sale_price}&ship=0&commission=10.6`;
                  // 주의: cost/ship 은 정산자동화웹 SKU 마스터에서 fetch 해야 정확. 일단 단순 prefill.
                  return (
                    <div key={s.sku_id} className="flex items-center justify-between text-xs bg-violet-50 px-2 py-1 rounded">
                      <span className="flex-1 truncate">{s.sku_name ?? `#${s.sku_id}`} · {s.sale_price.toLocaleString()}원 · {s.qty_est}건</span>
                      <a
                        href={simUrl}
                        target="_blank"
                        rel="noopener"
                        className="ml-2 text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                        title="이 SKU 시뮬레이터로 분석"
                      >
                        🧮
                      </a>
                      <button className="text-red-600 hover:text-red-800 ml-2" onClick={() => removeSku(s.sku_id)} disabled={busy !== null} title="제거">×</button>
                    </div>
                  );
                })}
              </div>
              {/* SKU 이름으로 검색 */}
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="SKU 이름 검색 (예: 밤설기, 두쫀모)"
                  className="flex-1 text-xs border rounded px-2 py-1"
                  value={skuQuery}
                  onChange={(e) => setSkuQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchSkusRight(); }}
                />
                <button
                  type="button"
                  className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded hover:bg-violet-200 disabled:opacity-50"
                  disabled={skuSearching}
                  onClick={searchSkusRight}
                >
                  {skuSearching ? "…" : "🔍"}
                </button>
              </div>
              {skuHits.length > 0 && (
                <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                  {skuHits.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSkuId(String(s.id)); setSkuHits([]); setSkuQuery(s.product_name); }}
                      className="w-full text-left text-[11px] bg-white hover:bg-violet-50 border rounded px-2 py-1"
                    >
                      <b>{s.product_name}</b>
                      <span className="text-gray-500 ml-1">· 원가 {s.cost.toLocaleString()}원 · 택배 {s.shipping_fee.toLocaleString()}원</span>
                    </button>
                  ))}
                </div>
              )}
              {skuId && (
                <div className="text-[11px] text-violet-700 mt-1">선택된 SKU id: <b>{skuId}</b></div>
              )}
              <div className="grid grid-cols-2 gap-1 mt-1">
                <input type="number" placeholder="행사가 (원)" className="text-xs border rounded px-2 py-1" value={skuPrice} onChange={(e) => setSkuPrice(e.target.value)} />
                <input type="number" placeholder="수량" className="text-xs border rounded px-2 py-1" value={skuQty} onChange={(e) => setSkuQty(e.target.value)} />
              </div>
              <div className="flex justify-end mt-1">
                <button className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50" disabled={busy !== null || !skuId} onClick={addSku}>
                  {busy === "register" ? "등록 중…" : "SKU 추가"}
                </button>
              </div>
            </div>

            {/* 매출 매칭 */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">매출 매칭 (정산자동화웹)</label>
              {selected.sales?.totals ? (
                <div className="text-xs bg-emerald-50 p-2 rounded space-y-0.5">
                  <div>매출 <b>{Math.round(selected.sales.totals.sale).toLocaleString()}</b>원</div>
                  <div>영업이익 <b>{Math.round(selected.sales.totals.operating_profit).toLocaleString()}</b>원</div>
                  <div>{Math.round(selected.sales.totals.qty)}건 / {Math.round(selected.sales.totals.orders)}주문</div>
                  {selected.sales_synced_at && <div className="text-[10px] text-gray-500 mt-1">갱신: {selected.sales_synced_at.slice(0, 16)}</div>}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic mb-1">매출 데이터 없음</div>
              )}
              <button
                className="w-full mt-1 text-xs px-2 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                disabled={busy !== null || selected.applied_skus.length === 0 || !selected.sale_start || !selected.sale_end}
                onClick={syncSales}
                title={selected.applied_skus.length === 0 ? "SKU 먼저 등록" : !selected.sale_start ? "진행 기간 먼저 설정" : ""}
              >
                {busy === "sales" ? "정산자동화웹 호출 중…" : "💰 매출 매칭 (정산자동화웹 호출)"}
              </button>
            </div>

            {/* 광고비 + ROAS */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">광고비 (행사별 실제 집행)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="flex-1 text-sm border rounded px-2 py-1.5"
                  value={adSpendDraft}
                  placeholder="원"
                  onChange={(e) => setAdSpendDraft(e.target.value)}
                />
                <button
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={saveAdSpend}
                >
                  {busy === "ad-spend" ? "저장 중…" : "저장"}
                </button>
              </div>
              {(() => {
                const ad = selected.ad_spend_manual ?? 0;
                const sale = selected.sales?.totals?.sale ?? 0;
                const op = selected.sales?.totals?.operating_profit ?? 0;
                if (!ad) return <div className="text-[10px] text-gray-400 mt-1">광고비 입력 시 ROAS·실순이익 자동 계산</div>;
                const roas = sale ? sale / ad : 0;
                const netProfit = op - ad;
                const netMargin = sale ? (netProfit / sale) * 100 : 0;
                return (
                  <div className="text-xs bg-blue-50 p-2 mt-1 rounded space-y-0.5">
                    <div>ROAS: <b>{roas.toFixed(2)}배</b> {roas >= 3 ? "✅" : roas >= 2 ? "⚠" : "🚨"}</div>
                    <div>실제 순이익(영업이익 − 광고비): <b>{Math.round(netProfit).toLocaleString()}원</b></div>
                    <div>실 순이익률: <b>{netMargin.toFixed(1)}%</b></div>
                    <div className="text-[10px] text-gray-500">※ 정산자동화웹 ad_spend(전 채널) 무시, 입력값 기준</div>
                  </div>
                );
              })()}
            </div>

            {/* 담당 MD — 행사별 owner (md_owner_name) 우선, 없으면 채널 contacts */}
            {selected.md_owner_name ? (
              <div>
                <label className="text-xs text-gray-600 block mb-1">담당 MD (이 행사)</label>
                <div className="text-xs bg-blue-50 border border-blue-200 px-2 py-1.5 rounded font-semibold text-blue-900">
                  👤 {selected.md_owner_name}
                </div>
              </div>
            ) : (() => {
              const chContacts = contacts.filter((c) => c.channel_key === selected.channel_key);
              if (chContacts.length === 0) {
                return (
                  <div className="text-xs text-gray-500">
                    이 채널 담당 MD 등록 없음 —{" "}
                    <Link href="/contacts" className="text-blue-600 hover:underline">📇 연락처에서 추가</Link>
                  </div>
                );
              }
              return (
                <div>
                  <label className="text-xs text-gray-600 block mb-1">채널 담당 MD (참고용)</label>
                  <div className="space-y-1">
                    {chContacts.map((c) => (
                      <div key={c.id} className="text-xs bg-gray-50 px-2 py-1.5 rounded">
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-[11px] text-gray-600 flex flex-wrap gap-x-2">
                          {c.kakao_id && <span>💬 {c.kakao_id}</span>}
                          {c.phone && <span>📞 {c.phone}</span>}
                        </div>
                        {c.memo && <div className="text-[11px] text-gray-500 mt-0.5">{c.memo}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">↑ 이 행사 담당 직접 지정하려면 수정 폼의 '담당 MD' 입력</div>
                </div>
              );
            })()}

            <div className="pt-2 border-t">
              <a href={selected.url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline break-all">
                {selected.url}
              </a>
            </div>

            {/* 행사 본문 수정 + 삭제 */}
            <div className="pt-3 border-t space-y-2">
              {!showEdit ? (
                <div className="flex gap-2 items-center">
                  <button
                    className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50 flex-1"
                    onClick={() => setShowEdit(true)}
                    disabled={busy !== null}
                    title={selected.source === "manual" ? "제목/마감/카테고리 수정" : "수동 등록 행사만 본문 수정 가능 — 다른 행사는 메모로"}
                  >
                    ✎ 본문 수정
                  </button>
                  <button
                    className={`text-xs px-3 py-1.5 rounded ${selected.source === "manual" ? "bg-red-600 text-white hover:bg-red-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}
                    onClick={deleteEvent}
                    disabled={busy !== null}
                    title={selected.source === "manual" ? "행사 완전 삭제" : "상태/메모/SKU/기간 초기화 (RSS 행사라 행사 자체는 다시 잡힘)"}
                  >
                    {selected.source === "manual" ? "🗑 삭제" : "↺ 초기화"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2 bg-gray-50 p-2 rounded">
                  <div>
                    <label className="text-[11px] text-gray-600 block mb-0.5">제목</label>
                    <input
                      type="text"
                      className="w-full text-sm border rounded px-2 py-1.5"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      disabled={selected.source !== "manual"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">마감일</label>
                      <input type="date" className="w-full text-sm border rounded px-2 py-1.5" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">카테고리</label>
                      <input type="text" className="w-full text-sm border rounded px-2 py-1.5" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">행사유형</label>
                      <select className="w-full text-sm border rounded px-2 py-1.5" value={editEventType} onChange={(e) => setEditEventType(e.target.value)}>
                        <option value="">—</option>
                        <option>기획전</option>
                        <option>오늘끝딜</option>
                        <option>타임특가</option>
                        <option>하루특가</option>
                        <option>톡딜</option>
                        <option>특가왕</option>
                        <option>메인구좌</option>
                        <option>라이브</option>
                        <option>푸드페스타</option>
                        <option>한입발견회</option>
                        <option>기타</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">할인율 (%)</label>
                      <input type="number" placeholder="예: 10" className="w-full text-sm border rounded px-2 py-1.5" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">할인부담주체</label>
                      <select className="w-full text-sm border rounded px-2 py-1.5" value={editBurden} onChange={(e) => setEditBurden(e.target.value)}>
                        <option value="">—</option>
                        <option>도아</option>
                        <option>채널</option>
                        <option>분담</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">예상매출 (원)</label>
                      <input type="number" placeholder="1000000" className="w-full text-sm border rounded px-2 py-1.5" value={editExpected} onChange={(e) => setEditExpected(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">업체명</label>
                      <input type="text" placeholder="ㅇㅇ유통" className="w-full text-sm border rounded px-2 py-1.5" value={editVendor} onChange={(e) => setEditVendor(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-0.5">업체 연락처</label>
                      <input type="text" placeholder="010-..." className="w-full text-sm border rounded px-2 py-1.5" value={editVendorContact} onChange={(e) => setEditVendorContact(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] text-gray-600 block mb-0.5">담당 MD (자유 입력)</label>
                      <input type="text" placeholder="홍길동 / 이아무개" className="w-full text-sm border rounded px-2 py-1.5" value={editOwner} onChange={(e) => setEditOwner(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] text-gray-600 block mb-0.5">채널 (잘못 등록한 경우 변경)</label>
                      <select className="w-full text-sm border rounded px-2 py-1.5" value={editChannel} onChange={(e) => setEditChannel(e.target.value)}>
                        {channels.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.name} {c.is_sales ? "(판매)" : "(정보)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {selected.source !== "manual" && (
                    <div className="text-[11px] text-amber-700">
                      ※ RSS 수집 행사의 제목은 원본이라 수정 불가. 마감일/카테고리만 변경 가능.
                    </div>
                  )}
                  <div className="flex justify-end gap-1">
                    <button className="text-xs px-2 py-1 border rounded hover:bg-gray-100" onClick={() => setShowEdit(false)} disabled={busy !== null}>취소</button>
                    <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" onClick={saveEditFields} disabled={busy !== null}>저장</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">⚠ {error}</div>}
        {isPending && <div className="text-xs text-blue-500">화면 갱신 중…</div>}
      </aside>
    </div>
  );
}
