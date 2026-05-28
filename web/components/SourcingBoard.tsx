"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Supplier, SourcingProduct, SourcingContact } from "@/lib/data";
import { apiUrl } from "@/lib/api";

const PRODUCT_CATEGORIES = ["떡류", "냉동떡", "한과", "기타"];
const PRODUCT_STATUSES = [
  { v: "planning", label: "기획" },
  { v: "sourcing", label: "소싱중" },
  { v: "sample", label: "샘플" },
  { v: "decided", label: "공급확정" },
  { v: "launched", label: "출시" },
  { v: "dropped", label: "보류/취소" },
];
const CONTACT_STATUSES = [
  { v: "not_sent",     label: "미발송" },
  { v: "sent_waiting", label: "발송(대기)" },
  { v: "replied",      label: "답변옴" },
  { v: "sample",       label: "샘플진행" },
  { v: "negotiating",  label: "단가협상" },
  { v: "confirmed",    label: "확정" },
  { v: "on_hold",      label: "보류" },
  { v: "rejected",     label: "거절" },
];

const blankProductForm = {
  name: "",
  category: "떡류",
  spec_notes: "",
  target_launch_date: "",
  status: "planning",
  notes: "",
};

export default function SourcingBoard({
  suppliers,
  products,
  contacts,
  contactLabels,
  productLabels,
}: {
  suppliers: Supplier[];
  products: SourcingProduct[];
  contacts: SourcingContact[];
  contactLabels: Record<string, string>;
  productLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [_isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    products[0]?.id ?? null
  );
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState(blankProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const selected = products.find((p) => p.id === selectedId) ?? null;
  const selectedContacts = useMemo(
    () => contacts.filter((c) => c.product_id === selectedId),
    [contacts, selectedId]
  );

  const contactCountByProduct = useMemo(() => {
    const m = new Map<string, { total: number; stale: number; confirmed: number }>();
    for (const c of contacts) {
      const cur = m.get(c.product_id) ?? { total: 0, stale: 0, confirmed: 0 };
      cur.total += 1;
      if (c.stale.stale) cur.stale += 1;
      if (c.status === "confirmed") cur.confirmed += 1;
      m.set(c.product_id, cur);
    }
    return m;
  }, [contacts]);

  function newProduct() {
    setEditingProductId(null);
    setProductForm(blankProductForm);
    setShowProductForm(true);
    setError(null);
  }

  function editProduct(p: SourcingProduct) {
    setEditingProductId(p.id);
    setProductForm({
      name: p.name,
      category: p.category ?? "떡류",
      spec_notes: p.spec_notes ?? "",
      target_launch_date: p.target_launch_date ?? "",
      status: p.status,
      notes: p.notes ?? "",
    });
    setShowProductForm(true);
    setError(null);
  }

  async function saveProduct() {
    setError(null);
    if (!productForm.name.trim()) {
      setError("신제품명 필수");
      return;
    }
    const body: Record<string, unknown> = {
      name: productForm.name.trim(),
      category: productForm.category || undefined,
      spec_notes: productForm.spec_notes || undefined,
      target_launch_date: productForm.target_launch_date || undefined,
      status: productForm.status || undefined,
      notes: productForm.notes || undefined,
    };
    setBusy(true);
    try {
      const url = editingProductId
        ? apiUrl(`/api/sourcing/products/${editingProductId}`)
        : apiUrl("/api/sourcing/products");
      const r = await fetch(url, {
        method: editingProductId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      setShowProductForm(false);
      setProductForm(blankProductForm);
      setEditingProductId(null);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(p: SourcingProduct) {
    if (!confirm(`'${p.name}' 신제품을 삭제할까요?\n(연결된 공급처 컨택도 함께 삭제)`)) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/sourcing/products/${p.id}`), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      if (selectedId === p.id) setSelectedId(null);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      {/* 좌: 신제품 카드 리스트 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">신제품 ({products.length})</h2>
          <button
            onClick={newProduct}
            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + 신제품
          </button>
        </div>

        {showProductForm && (
          <div className="bg-white border-2 border-blue-400 rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              {editingProductId ? "신제품 수정" : "+ 새 신제품"}
            </div>
            <input
              placeholder="신제품명 *"
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              className="w-full text-sm border rounded px-2 py-1.5"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={productForm.category}
                onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                className="text-sm border rounded px-2 py-1.5"
              >
                {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={productForm.status}
                onChange={(e) => setProductForm({ ...productForm, status: e.target.value })}
                className="text-sm border rounded px-2 py-1.5"
              >
                {PRODUCT_STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </div>
            <label className="text-xs text-slate-500 block">
              출시 목표일 (스테일 계산 기준)
              <input
                type="date"
                value={productForm.target_launch_date}
                onChange={(e) => setProductForm({ ...productForm, target_launch_date: e.target.value })}
                className="w-full text-sm border rounded px-2 py-1.5 mt-1"
              />
            </label>
            <textarea
              placeholder="스펙·컨셉 메모"
              rows={2}
              value={productForm.spec_notes}
              onChange={(e) => setProductForm({ ...productForm, spec_notes: e.target.value })}
              className="w-full text-sm border rounded px-2 py-1.5"
            />
            <div className="flex justify-end gap-2 items-center">
              {error && <span className="text-xs text-red-600">⚠ {error}</span>}
              <button
                onClick={() => {
                  setShowProductForm(false);
                  setError(null);
                }}
                className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={saveProduct}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "저장…" : "저장"}
              </button>
            </div>
          </div>
        )}

        {products.length === 0 && !showProductForm && (
          <div className="bg-white border rounded p-6 text-center text-slate-400 text-xs">
            등록된 신제품 없음. [+ 신제품] 으로 시작하세요.
          </div>
        )}

        <div className="space-y-2">
          {products.map((p) => {
            const counts = contactCountByProduct.get(p.id) ?? { total: 0, stale: 0, confirmed: 0 };
            const isSelected = p.id === selectedId;
            const dday = computeDday(p.target_launch_date);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left bg-white border rounded p-3 hover:border-blue-400 transition ${
                  isSelected ? "border-blue-500 ring-2 ring-blue-100" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className={productBadgeClass(p.status)}>
                        {productLabels[p.status] ?? p.status}
                      </span>
                      {p.category && <span>{p.category}</span>}
                      {dday && <span className={dday.urgent ? "text-red-600 font-semibold" : ""}>{dday.label}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-slate-500">공급처 {counts.total}</span>
                  {counts.confirmed > 0 && (
                    <span className="text-green-600 font-semibold">✓ 확정 {counts.confirmed}</span>
                  )}
                  {counts.stale > 0 && (
                    <span className="text-red-600 font-semibold">⚠ 지연 {counts.stale}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 우: 선택된 신제품의 공급처 컨택 표 */}
      <div className="space-y-3">
        {!selected ? (
          <div className="bg-white border rounded p-12 text-center text-slate-400 text-sm">
            ← 좌측에서 신제품을 선택하세요.
          </div>
        ) : (
          <ProductPanel
            product={selected}
            contacts={selectedContacts}
            suppliers={suppliers}
            contactLabels={contactLabels}
            productLabels={productLabels}
            busy={busy}
            setBusy={setBusy}
            onEdit={() => editProduct(selected)}
            onDelete={() => deleteProduct(selected)}
            onChange={() => startTransition(() => router.refresh())}
          />
        )}
      </div>
    </div>
  );
}

function ProductPanel({
  product,
  contacts,
  suppliers,
  contactLabels,
  productLabels,
  busy,
  setBusy,
  onEdit,
  onDelete,
  onChange,
}: {
  product: SourcingProduct;
  contacts: SourcingContact[];
  suppliers: Supplier[];
  contactLabels: Record<string, string>;
  productLabels: Record<string, string>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onChange: () => void;
}) {
  const [newSupplierId, setNewSupplierId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const dday = computeDday(product.target_launch_date);

  // 이미 컨택 등록된 공급처는 드롭다운에서 제외
  const usedSupplierIds = new Set(contacts.map((c) => c.supplier_id));
  const availableSuppliers = suppliers.filter((s) => !usedSupplierIds.has(s.id));

  async function addContact() {
    if (!newSupplierId) {
      setErr("공급처 선택");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/sourcing/contacts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          supplier_id: newSupplierId,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || `HTTP ${r.status}`);
        return;
      }
      setNewSupplierId("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function updateContact(id: number, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/sourcing/contacts/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || `HTTP ${r.status}`);
        return;
      }
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function deleteContact(c: SourcingContact) {
    if (!confirm(`'${c.supplier_name}' 컨택 기록을 삭제할까요?`)) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/sourcing/contacts/${c.id}`), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || `HTTP ${r.status}`);
        return;
      }
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 신제품 헤더 */}
      <div className="bg-white border rounded p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-bold">{product.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className={productBadgeClass(product.status)}>
                {productLabels[product.status] ?? product.status}
              </span>
              {product.category && (
                <span className="bg-slate-100 px-1.5 py-0.5 rounded">{product.category}</span>
              )}
              {dday && (
                <span className={dday.urgent ? "text-red-600 font-bold" : "text-slate-500"}>
                  출시 목표 {product.target_launch_date} ({dday.label})
                </span>
              )}
            </div>
            {product.spec_notes && (
              <div className="mt-2 text-xs text-slate-600 bg-amber-50 px-2 py-1.5 rounded border-l-2 border-amber-300">
                📋 {product.spec_notes}
              </div>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={onEdit} className="text-blue-600 hover:underline">수정</button>
            <button onClick={onDelete} className="text-red-600 hover:underline">삭제</button>
          </div>
        </div>
      </div>

      {/* 공급처 추가 */}
      <div className="bg-white border rounded p-3 flex flex-wrap gap-2 items-center">
        <label className="text-sm font-semibold text-slate-700">+ 공급처 컨택 추가</label>
        <select
          value={newSupplierId}
          onChange={(e) => setNewSupplierId(e.target.value)}
          className="text-sm border rounded px-2 py-1.5 flex-1 min-w-[240px]"
        >
          <option value="">— 공급처 선택 —</option>
          {availableSuppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.category ? `  [${s.category}]` : ""}
              {s.scale ? `  (${s.scale})` : ""}
              {s.address ? `  · ${s.address}` : ""}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !newSupplierId}
          onClick={addContact}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          추가
        </button>
        {availableSuppliers.length === 0 && (
          <span className="text-xs text-slate-500 w-full">
            모든 공급처가 이미 등록됨.{" "}
            <a href="/sourcing/suppliers" className="text-blue-600 hover:underline">
              마스터에서 더 추가 →
            </a>
          </span>
        )}
        {err && <span className="text-xs text-red-600 w-full">⚠ {err}</span>}
      </div>

      {/* 컨택 표 */}
      {contacts.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center text-slate-400 text-sm">
          이 신제품의 공급처 컨택 없음. 위 드롭다운에서 공급처를 골라 추가하세요.
        </div>
      ) : (
        <div className="bg-white border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                <th className="text-left px-3 py-2">공급처</th>
                <th className="text-left px-3 py-2">상태</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">마지막 컨택</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">견적</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">다음 액션</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => {
                const stale = c.stale.stale;
                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-50 ${stale ? "bg-red-50" : ""}`}
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{c.supplier_name}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                        {c.supplier_contact_person && <span>👤 {c.supplier_contact_person}</span>}
                        {c.supplier_phone && <span>📞 {c.supplier_phone}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={c.status}
                        disabled={busy}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          updateContact(c.id, {
                            status: newStatus,
                            // 활동 상태로 바뀌면 마지막 컨택 갱신
                            contacted_now: ["sent_waiting", "replied", "sample", "negotiating"].includes(newStatus),
                          });
                        }}
                        className={`text-xs border rounded px-1.5 py-1 ${statusSelectClass(c.status)}`}
                      >
                        {CONTACT_STATUSES.map((s) => (
                          <option key={s.v} value={s.v}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top hidden md:table-cell text-xs">
                      {c.last_contacted_at ? (
                        <div>
                          <div>{c.last_contacted_at.slice(0, 10)}</div>
                          {c.stale.days_since !== null && (
                            <div className={stale ? "text-red-600 font-bold" : "text-slate-500"}>
                              {stale && "⚠ "}
                              {c.stale.days_since}일 경과
                              {stale && ` (기준 ${c.stale.threshold}일)`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      <button
                        onClick={() => updateContact(c.id, { contacted_now: true })}
                        disabled={busy}
                        className="text-[10px] text-blue-600 hover:underline mt-1"
                      >
                        지금 컨택했음
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top hidden md:table-cell text-xs">
                      <InlineNumber
                        value={c.quoted_unit_price}
                        suffix="원"
                        placeholder="단가"
                        busy={busy}
                        onSave={(v) => updateContact(c.id, { quoted_unit_price: v })}
                      />
                      {c.quoted_moq && (
                        <div className="text-[10px] text-slate-500">MOQ {c.quoted_moq.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top hidden lg:table-cell">
                      <InlineText
                        value={c.next_action ?? ""}
                        placeholder="다음 액션…"
                        busy={busy}
                        onSave={(v) => updateContact(c.id, { next_action: v || null })}
                      />
                      {c.notes && (
                        <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{c.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        onClick={() => deleteContact(c)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function InlineNumber({
  value,
  suffix,
  placeholder,
  busy,
  onSave,
}: {
  value: number | null;
  suffix?: string;
  placeholder?: string;
  busy: boolean;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value == null ? "" : String(value));
  if (!editing) {
    return (
      <button
        onClick={() => {
          setV(value == null ? "" : String(value));
          setEditing(true);
        }}
        className="text-left hover:bg-slate-100 px-1 py-0.5 rounded w-full"
      >
        {value == null ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          <span>{value.toLocaleString()}{suffix}</span>
        )}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      value={v}
      disabled={busy}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = v === "" ? null : Number(v);
        if (parsed !== value) onSave(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value == null ? "" : String(value));
          setEditing(false);
        }
      }}
      className="text-xs border rounded px-1 py-0.5 w-24"
    />
  );
}

function InlineText({
  value,
  placeholder,
  busy,
  onSave,
}: {
  value: string;
  placeholder?: string;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (!editing) {
    return (
      <button
        onClick={() => {
          setV(value);
          setEditing(true);
        }}
        className="text-left hover:bg-slate-100 px-1 py-0.5 rounded w-full text-xs"
      >
        {value || <span className="text-slate-400">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={v}
      disabled={busy}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          setEditing(false);
        }
      }}
      className="text-xs border rounded px-1 py-0.5 w-full"
    />
  );
}

function computeDday(date: string | null): { label: string; urgent: boolean } | null {
  if (!date) return null;
  const target = new Date(date + "T00:00:00");
  const now = new Date();
  const days = Math.floor((target.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: `D+${-days} (지남)`, urgent: false };
  if (days === 0) return { label: "D-day", urgent: true };
  return { label: `D-${days}`, urgent: days <= 14 };
}

function productBadgeClass(status: string): string {
  const base = "text-xs px-1.5 py-0.5 rounded font-medium ";
  switch (status) {
    case "planning": return base + "bg-slate-100 text-slate-600";
    case "sourcing": return base + "bg-blue-100 text-blue-700";
    case "sample":   return base + "bg-purple-100 text-purple-700";
    case "decided":  return base + "bg-green-100 text-green-700";
    case "launched": return base + "bg-emerald-100 text-emerald-700";
    case "dropped":  return base + "bg-red-100 text-red-600";
    default:         return base + "bg-slate-100 text-slate-500";
  }
}

function statusSelectClass(status: string): string {
  switch (status) {
    case "confirmed":    return "bg-green-50 text-green-700 border-green-300";
    case "negotiating":  return "bg-blue-50 text-blue-700 border-blue-300";
    case "sample":       return "bg-purple-50 text-purple-700 border-purple-300";
    case "replied":      return "bg-yellow-50 text-yellow-700 border-yellow-300";
    case "sent_waiting": return "bg-amber-50 text-amber-700 border-amber-300";
    case "on_hold":      return "bg-slate-100 text-slate-600";
    case "rejected":     return "bg-red-50 text-red-600 border-red-300";
    default:             return "bg-slate-50 text-slate-600";
  }
}
