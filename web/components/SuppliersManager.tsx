"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Supplier } from "@/lib/data";
import { apiUrl } from "@/lib/api";

const CATEGORIES = ["떡류", "냉동떡", "한과", "포장재", "기타"];
const SCALES = ["소규모(공방)", "중소", "중대형"];
const STATUSES = [
  { v: "candidate", label: "후보" },
  { v: "active", label: "거래중" },
  { v: "paused", label: "보류" },
  { v: "dropped", label: "탈락" },
];

const blankForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  kakao_id: "",
  address: "",
  category: "떡류",
  scale: "중소",
  moq: "",
  lead_time_days: "",
  source: "",
  homepage: "",
  notes: "",
  status: "candidate",
};

type FormState = typeof blankForm;

export default function SuppliersManager({
  suppliers,
  statusLabels,
}: {
  suppliers: Supplier[];
  statusLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [_isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      if (filterCat !== "all" && s.category !== filterCat) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = [s.name, s.address, s.contact_person, s.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [suppliers, filterCat, filterStatus, query]);

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      contact_person: s.contact_person ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      kakao_id: s.kakao_id ?? "",
      address: s.address ?? "",
      category: s.category ?? "떡류",
      scale: s.scale ?? "중소",
      moq: s.moq == null ? "" : String(s.moq),
      lead_time_days: s.lead_time_days == null ? "" : String(s.lead_time_days),
      source: s.source ?? "",
      homepage: s.homepage ?? "",
      notes: s.notes ?? "",
      status: s.status,
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function cancelForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(false);
    setError(null);
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("공장명 필수");
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      contact_person: form.contact_person || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      kakao_id: form.kakao_id || undefined,
      address: form.address || undefined,
      category: form.category || undefined,
      scale: form.scale || undefined,
      moq: form.moq ? Number(form.moq) : undefined,
      lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : undefined,
      source: form.source || undefined,
      homepage: form.homepage || undefined,
      notes: form.notes || undefined,
      status: form.status || undefined,
    };
    setBusy(true);
    try {
      const url = editingId
        ? apiUrl(`/api/sourcing/suppliers/${editingId}`)
        : apiUrl("/api/sourcing/suppliers");
      const r = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      cancelForm();
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`'${s.name}' 공급처를 삭제할까요?\n(연결된 컨택 기록도 함께 삭제)`)) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/sourcing/suppliers/${s.id}`), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 컨트롤바 */}
      <div className="bg-white border rounded p-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 이름·지역·메모 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-sm border rounded px-2 py-1.5 flex-1 min-w-[200px]"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="text-sm border rounded px-2 py-1.5"
        >
          <option value="all">전체 카테고리</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border rounded px-2 py-1.5"
        >
          <option value="all">전체 상태</option>
          {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <button
          onClick={startNew}
          className="ml-auto px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + 새 공급처
        </button>
      </div>

      {/* 입력 폼 */}
      {showForm && (
        <div className="bg-white border-2 border-blue-400 rounded p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            {editingId ? `수정: ${form.name}` : "+ 새 공급처"}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <input
              placeholder="공장/상호명 *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="text-sm border rounded px-2 py-1.5 col-span-2 md:col-span-1"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={form.scale}
              onChange={(e) => setForm({ ...form, scale: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            >
              {SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              placeholder="담당자"
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="📞 전화번호"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="💬 카카오"
              value={form.kakao_id}
              onChange={(e) => setForm({ ...form, kakao_id: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="✉ 이메일"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="📍 소재지 (시·도)"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="홈페이지"
              value={form.homepage}
              onChange={(e) => setForm({ ...form, homepage: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="MOQ (수량)"
              type="number"
              value={form.moq}
              onChange={(e) => setForm({ ...form, moq: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <input
              placeholder="리드타임 (일)"
              type="number"
              value={form.lead_time_days}
              onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="text-sm border rounded px-2 py-1.5"
            >
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
            <input
              placeholder="발굴 출처 (예: 네이버 상품정보고시)"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="text-sm border rounded px-2 py-1.5 col-span-2 md:col-span-3"
            />
          </div>
          <textarea
            placeholder="메모 (특화 품목·인증·주의사항 등)"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full text-sm border rounded px-2 py-1.5"
          />
          <div className="flex justify-end gap-2 items-center">
            {error && <span className="text-xs text-red-600">⚠ {error}</span>}
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 text-sm border rounded hover:bg-slate-50"
            >
              취소
            </button>
            <button
              disabled={busy}
              onClick={save}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "저장 중…" : editingId ? "수정 저장" : "추가"}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="bg-white border rounded p-12 text-center text-slate-400 text-sm">
          {suppliers.length === 0
            ? "등록된 공급처 없음. 위 [+ 새 공급처] 로 첫 공장을 추가하세요."
            : "필터에 맞는 공급처 없음."}
        </div>
      ) : (
        <div className="bg-white border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                <th className="text-left px-3 py-2">공장명</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">카테고리/규모</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">지역</th>
                <th className="text-left px-3 py-2">연락처</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">메모</th>
                <th className="text-left px-3 py-2">상태</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 align-top">
                    <div className="font-semibold">{s.name}</div>
                    {s.contact_person && (
                      <div className="text-xs text-slate-500">👤 {s.contact_person}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top hidden md:table-cell">
                    {s.category && (
                      <span className="text-xs bg-slate-100 rounded px-1.5 py-0.5">{s.category}</span>
                    )}
                    {s.scale && (
                      <div className="text-xs text-slate-500 mt-1">{s.scale}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600 hidden md:table-cell">
                    {s.address}
                  </td>
                  <td className="px-3 py-2 align-top text-xs">
                    {s.phone && <div>📞 {s.phone}</div>}
                    {s.kakao_id && <div>💬 {s.kakao_id}</div>}
                    {s.email && <div className="truncate max-w-[150px]">✉ {s.email}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-slate-500 hidden lg:table-cell max-w-[200px]">
                    <div className="line-clamp-2">{s.notes}</div>
                    {s.source && (
                      <div className="text-[10px] text-slate-400 mt-1">↳ {s.source}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={statusBadgeClass(s.status)}>
                      {statusLabels[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(s)}
                      className="text-xs text-blue-600 hover:underline mr-2"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove(s)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500 border-t">
            {filtered.length} / {suppliers.length}곳
          </div>
        </div>
      )}
    </div>
  );
}

function statusBadgeClass(status: string): string {
  const base = "text-xs px-1.5 py-0.5 rounded font-medium ";
  switch (status) {
    case "active":    return base + "bg-green-100 text-green-700";
    case "candidate": return base + "bg-slate-100 text-slate-600";
    case "paused":    return base + "bg-amber-100 text-amber-700";
    case "dropped":   return base + "bg-red-100 text-red-600";
    default:          return base + "bg-slate-100 text-slate-500";
  }
}
