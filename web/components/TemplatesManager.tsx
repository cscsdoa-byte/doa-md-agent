"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventTemplate } from "@/lib/data";
import type { ChannelDef } from "@/lib/channels";
import { themeOf } from "@/lib/channelTheme";
import { apiUrl } from "@/lib/api";

export default function TemplatesManager({
  templates,
  channels,
}: {
  templates: EventTemplate[];
  channels: ChannelDef[];
}) {
  const router = useRouter();
  const [_p, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    channel_key: channels[0]?.key ?? "",
    title_pattern: "",
    category: "",
    recurrence: "weekly",
    memo: "",
  });

  async function add() {
    setError(null);
    if (!form.name || !form.channel_key || !form.title_pattern) {
      setError("이름·채널·제목패턴 필수");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      setForm({ ...form, name: "", title_pattern: "", category: "", memo: "" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, name: string) {
    if (!confirm(`템플릿 "${name}" 을 삭제할까요?`)) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/templates/${id}`), { method: "DELETE" });
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
      <div className="bg-white border rounded p-4 space-y-2">
        <div className="text-sm font-semibold">+ 새 템플릿</div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="템플릿 이름 * (예: 네이버 오늘끝딜 주간)"
            className="text-sm border rounded px-2 py-1.5"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
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
            placeholder="제목 패턴 * (예: [오늘끝딜] N월 N째주 행사)"
            className="text-sm border rounded px-2 py-1.5 col-span-2"
            value={form.title_pattern}
            onChange={(e) => setForm({ ...form, title_pattern: e.target.value })}
          />
          <input
            type="text"
            placeholder="카테고리 (선택, 예: 신선)"
            className="text-sm border rounded px-2 py-1.5"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            type="text"
            placeholder="반복 주기 (weekly/monthly 등)"
            className="text-sm border rounded px-2 py-1.5"
            value={form.recurrence}
            onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
          />
        </div>
        <textarea
          placeholder="메모 (담당 MD, 자주 등록하는 SKU, 광고비 패턴 등)"
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

      {templates.length === 0 ? (
        <div className="bg-white border rounded p-12 text-center text-slate-400 text-sm">
          등록된 템플릿 없음. 자주 잡는 행사(네이버 오늘끝딜 주간 등)를 등록해두면 매번 입력 안 해도 됩니다.
        </div>
      ) : (
        <div className="bg-white border rounded divide-y">
          {templates.map((t) => {
            const th = themeOf(t.channel_key);
            const chName = channels.find((c) => c.key === t.channel_key)?.name ?? t.channel_key;
            return (
              <div key={t.id} className="p-4 flex items-start gap-3">
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-extrabold text-sm ${th.bold}`}>[{th.abbr}]</span>
                    <span className="text-sm font-semibold">{t.name}</span>
                    <span className="text-xs text-slate-400">{chName}</span>
                    {t.recurrence && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{t.recurrence}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-700">{t.title_pattern}</div>
                  {t.category && <div className="text-xs text-slate-500">카테고리: {t.category}</div>}
                  {t.memo && <div className="text-xs text-slate-500 mt-1 bg-amber-50 px-2 py-1 rounded border-l-2 border-amber-300">📝 {t.memo}</div>}
                </div>
                <button
                  onClick={() => remove(t.id, t.name)}
                  disabled={busy}
                  className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
