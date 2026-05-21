"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@/lib/data";
import type { ChannelDef } from "@/lib/channels";
import { themeOf } from "@/lib/channelTheme";

export default function ContactsManager({
  contacts,
  channels,
}: {
  contacts: Contact[];
  channels: ChannelDef[];
}) {
  const router = useRouter();
  const [_isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  // 신규 입력 폼
  const [form, setForm] = useState({
    channel_key: channels[0]?.key ?? "",
    name: "",
    kakao_id: "",
    phone: "",
    email: "",
    memo: "",
  });

  const grouped = useMemo(() => {
    const byCh = new Map<string, Contact[]>();
    for (const c of contacts) {
      if (filter !== "all" && c.channel_key !== filter) continue;
      const list = byCh.get(c.channel_key) ?? [];
      list.push(c);
      byCh.set(c.channel_key, list);
    }
    return Array.from(byCh.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [contacts, filter]);

  async function add() {
    setError(null);
    if (!form.channel_key || !form.name) {
      setError("채널·이름 필수");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      setForm({ channel_key: form.channel_key, name: "", kakao_id: "", phone: "", email: "", memo: "" });
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, name: string) {
    if (!confirm(`${name} 연락처를 삭제할까요?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
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
    <div className="space-y-6">
      {/* 추가 폼 */}
      <div className="bg-white border rounded p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-900">+ 새 연락처</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="text-sm border rounded px-2 py-1.5"
            value={form.channel_key}
            onChange={(e) => setForm({ ...form, channel_key: e.target.value })}
          >
            {channels.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="MD 이름 *"
            className="text-sm border rounded px-2 py-1.5"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="카카오톡 ID"
            className="text-sm border rounded px-2 py-1.5"
            value={form.kakao_id}
            onChange={(e) => setForm({ ...form, kakao_id: e.target.value })}
          />
          <input
            type="text"
            placeholder="전화번호"
            className="text-sm border rounded px-2 py-1.5"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            type="email"
            placeholder="이메일"
            className="text-sm border rounded px-2 py-1.5 col-span-2"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <textarea
          placeholder="메모 (담당 카테고리, 행사 패턴, 연락 시간대 등)"
          rows={2}
          className="w-full text-sm border rounded px-2 py-1.5"
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          {error && <span className="text-xs text-red-600 self-center">⚠ {error}</span>}
          <button
            disabled={busy}
            onClick={add}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "추가"}
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-600">채널 필터:</span>
        <button
          className={`text-xs px-2.5 py-1 rounded border ${filter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white hover:bg-slate-50"}`}
          onClick={() => setFilter("all")}
        >
          전체
        </button>
        {channels.map((c) => (
          <button
            key={c.key}
            className={`text-xs px-2.5 py-1 rounded border ${filter === c.key ? "bg-slate-800 text-white border-slate-800" : "bg-white hover:bg-slate-50"}`}
            onClick={() => setFilter(c.key)}
          >
            {themeOf(c.key).abbr} {c.name}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {contacts.length === 0 ? (
        <div className="bg-white border rounded p-12 text-center text-slate-400 text-sm">
          등록된 연락처 없음. 위 폼으로 첫 MD 정보를 추가하세요.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([ch, list]) => {
            const th = themeOf(ch);
            const chName = channels.find((c) => c.key === ch)?.name ?? ch;
            return (
              <div key={ch} className="bg-white border rounded">
                <div className="px-4 py-2 bg-slate-50 border-b text-sm font-semibold">
                  <span className="font-mono mr-2">[{th.abbr}]</span>
                  {chName}
                  <span className="text-slate-400 ml-2">{list.length}명</span>
                </div>
                <div className="divide-y">
                  {list.map((c) => (
                    <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 space-y-0.5">
                        <div className="text-sm font-semibold">{c.name}</div>
                        <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                          {c.kakao_id && <span>💬 {c.kakao_id}</span>}
                          {c.phone && <span>📞 {c.phone}</span>}
                          {c.email && <span>✉ {c.email}</span>}
                        </div>
                        {c.memo && (
                          <div className="text-xs text-slate-500 mt-1 bg-amber-50 px-2 py-1 rounded border-l-2 border-amber-300">
                            📝 {c.memo}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => remove(c.id, c.name)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
