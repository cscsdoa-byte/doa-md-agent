"use client";

import { useState } from "react";
import type { CsCriticalGroup, CsRepeatCaller } from "@/lib/data";

interface Props {
  critical: CsCriticalGroup[];
  repeat: CsRepeatCaller[];
}

// 카테고리 아이콘만 의미를 색으로 (위험도 ≈ 진하기). 카드 배경은 동일 회색조.
const CATEGORY_META: Record<string, { icon: string; severityColor: string }> = {
  "불량·상품이상": { icon: "⚠️", severityColor: "text-rose-700" },
  "강한불만":     { icon: "🔥", severityColor: "text-rose-700" },
  "환불":         { icon: "💸", severityColor: "text-rose-600" },
  "취소":         { icon: "🚫", severityColor: "text-amber-700" },
  "배송지연":     { icon: "🚚", severityColor: "text-amber-700" },
  "교환·반품":    { icon: "🔄", severityColor: "text-slate-600" },
  "재발송":       { icon: "📦", severityColor: "text-slate-600" },
};

export default function CsCriticalCard({ critical, repeat }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalCritical = critical.reduce((s, g) => s + g.count, 0);
  if (totalCritical === 0 && repeat.length === 0) return null;

  return (
    <div className="mb-4 bg-white border border-slate-200 border-l-4 border-l-rose-500 rounded p-3">
      <div className="text-sm font-bold text-slate-800 mb-2 flex items-baseline justify-between">
        <span>🚨 CS 큰 이슈 — 최근 7일</span>
        <span className="text-[11px] text-slate-500 font-normal">
          위험 신호 <b className="text-rose-600">{totalCritical}건</b>
          {repeat.length > 0 && <> · 반복 컨택 <b className="text-rose-600">{repeat.length}명</b></>}
        </span>
      </div>

      {critical.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-2">
          {critical.map((g) => {
            const meta = CATEGORY_META[g.category] || { icon: "❓", severityColor: "text-slate-600" };
            const isOpen = expanded === g.category;
            return (
              <button
                key={g.category}
                onClick={() => setExpanded(isOpen ? null : g.category)}
                className={`rounded p-2 border text-left bg-slate-50 hover:bg-slate-100 transition ${
                  isOpen ? "border-slate-400" : "border-slate-200"
                }`}
              >
                <div className="text-xs font-semibold text-slate-700">
                  <span className="mr-0.5">{meta.icon}</span>{g.category}
                </div>
                <div className={`text-xl font-extrabold ${meta.severityColor}`}>{g.count}건</div>
                <div className="text-[10px] mt-0.5 text-slate-400">
                  {isOpen ? "↑ 닫기" : `↓ 샘플 ${Math.min(g.samples.length, 5)}건`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {expanded && (() => {
        const g = critical.find((x) => x.category === expanded);
        if (!g) return null;
        return (
          <div className="mb-2 rounded p-2 bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold text-slate-600 mb-1">📋 {g.category} 샘플</div>
            <ul className="space-y-1">
              {g.samples.map((s, i) => (
                <li key={i} className="text-[11px] bg-white rounded p-1.5 border border-slate-200">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[10px] text-slate-500 font-mono">{s.date.slice(5)} {s.time?.slice(0, 5)}</span>
                    <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-600">{s.channel}</span>
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
        <div className="border-t border-slate-100 pt-2">
          <div className="text-[10px] font-semibold text-slate-600 mb-1">
            🔁 반복 컨택 고객 (7일 이내 5건+ 인입)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {repeat.slice(0, 12).map((r, i) => (
              <span
                key={i}
                className="text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-0.5 font-mono text-slate-700"
                title={`${r.channel} · ${r.first} ~ ${r.last}`}
              >
                {r.sender_short}… <b className="text-rose-600">{r.count}건</b>
              </span>
            ))}
            {repeat.length > 12 && (
              <span className="text-[10px] text-slate-400">…외 {repeat.length - 12}명</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
