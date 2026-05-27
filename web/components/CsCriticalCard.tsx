"use client";

import { useState } from "react";
import type { CsCriticalGroup, CsRepeatCaller } from "@/lib/data";

interface Props {
  critical: CsCriticalGroup[];
  repeat: CsRepeatCaller[];
}

const CATEGORY_META: Record<string, { icon: string; color: string; bg: string }> = {
  "환불": { icon: "💸", color: "text-rose-800", bg: "bg-rose-50 border-rose-300" },
  "취소": { icon: "🚫", color: "text-orange-800", bg: "bg-orange-50 border-orange-300" },
  "교환·반품": { icon: "🔄", color: "text-amber-800", bg: "bg-amber-50 border-amber-300" },
  "불량·상품이상": { icon: "⚠️", color: "text-red-900", bg: "bg-red-50 border-red-400" },
  "배송지연": { icon: "🚚", color: "text-yellow-900", bg: "bg-yellow-50 border-yellow-400" },
  "강한불만": { icon: "🔥", color: "text-rose-900", bg: "bg-rose-100 border-rose-500" },
  "재발송": { icon: "📦", color: "text-violet-800", bg: "bg-violet-50 border-violet-300" },
};

export default function CsCriticalCard({ critical, repeat }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalCritical = critical.reduce((s, g) => s + g.count, 0);
  if (totalCritical === 0 && repeat.length === 0) return null;

  return (
    <div className="mb-4 bg-white border-2 border-rose-400 rounded-lg p-3">
      <div className="text-sm font-bold text-rose-900 mb-2 flex items-baseline justify-between">
        <span>🚨 CS 큰 이슈 — 최근 7일</span>
        <span className="text-[10px] text-rose-700 font-normal">
          위험 신호 <b>{totalCritical}건</b>
          {repeat.length > 0 && <> · 반복 컨택 고객 <b>{repeat.length}명</b></>}
        </span>
      </div>

      {critical.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-2">
          {critical.map((g) => {
            const meta = CATEGORY_META[g.category] || { icon: "❓", color: "text-slate-700", bg: "bg-slate-50 border-slate-300" };
            const isOpen = expanded === g.category;
            return (
              <button
                key={g.category}
                onClick={() => setExpanded(isOpen ? null : g.category)}
                className={`rounded p-2 border-2 text-left ${meta.bg} hover:brightness-95 transition`}
              >
                <div className={`text-xs font-bold ${meta.color}`}>
                  {meta.icon} {g.category}
                </div>
                <div className={`text-xl font-extrabold ${meta.color}`}>{g.count}건</div>
                <div className={`text-[10px] mt-0.5 ${meta.color}`}>
                  {isOpen ? "↑ 닫기" : `↓ 샘플 ${Math.min(g.samples.length, 5)}건 보기`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {expanded && (() => {
        const g = critical.find((x) => x.category === expanded);
        if (!g) return null;
        const meta = CATEGORY_META[g.category];
        return (
          <div className={`mb-2 rounded p-2 ${meta?.bg ?? "bg-slate-50"}`}>
            <div className="text-[10px] font-bold mb-1">📋 {g.category} 샘플</div>
            <ul className="space-y-1">
              {g.samples.map((s, i) => (
                <li key={i} className="text-[11px] bg-white rounded p-1.5 border">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[10px] text-slate-500 font-mono">{s.date.slice(5)} {s.time?.slice(0, 5)}</span>
                    <span className="text-[10px] px-1 rounded bg-slate-100">{s.channel}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{s.sender}…</span>
                  </div>
                  <div className="text-slate-800">{s.message}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {repeat.length > 0 && (
        <div className="border-t border-rose-200 pt-2">
          <div className="text-[10px] font-bold text-rose-800 mb-1">
            🔁 반복 컨택 고객 (7일 이내 5건+ 인입) — 불만 가능성, 빠른 응대 권장
          </div>
          <div className="flex flex-wrap gap-1.5">
            {repeat.slice(0, 12).map((r, i) => (
              <span
                key={i}
                className="text-[10px] bg-rose-50 border border-rose-300 rounded px-2 py-0.5 font-mono"
                title={`${r.channel} · ${r.first} ~ ${r.last}`}
              >
                {r.sender_short}… <b className="text-rose-700">{r.count}건</b>
              </span>
            ))}
            {repeat.length > 12 && (
              <span className="text-[10px] text-slate-500">…외 {repeat.length - 12}명</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
