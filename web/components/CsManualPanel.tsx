"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import { classifyMessage, type CsManualItem } from "@/lib/cs-manual";

interface Props {
  items: CsManualItem[];
}

const SEVERITY_BAR: Record<string, string> = {
  info: "border-l-slate-400",
  warn: "border-l-amber-500",
  danger: "border-l-rose-500",
};

const SEVERITY_TEXT: Record<string, string> = {
  info: "text-slate-600",
  warn: "text-amber-700",
  danger: "text-rose-700",
};

export default function CsManualPanel({ items }: Props) {
  const [search, setSearch] = useState("");
  const [customerMsg, setCustomerMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<{ reply?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // 메시지 또는 검색어 기반 필터링
  const matched = useMemo(() => {
    if (customerMsg.trim()) {
      return classifyMessage(customerMsg.trim());
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return items.filter(
        (it) =>
          it.category.includes(q) ||
          it.customer_intent.toLowerCase().includes(q) ||
          it.intent_keywords.some((k) => k.includes(q)) ||
          it.reply_templates.some((t) => t.text.toLowerCase().includes(q)),
      );
    }
    return items;
  }, [items, customerMsg, search]);

  function copyToClipboard(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function askAi() {
    if (!customerMsg.trim()) {
      alert("고객 메시지를 입력하세요.");
      return;
    }
    setAiBusy(true);
    setAiResult(null);
    try {
      const r = await fetch(apiUrl("/api/cs-ai-reply"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: customerMsg.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        setAiResult({ error: j.error || "AI 호출 실패" });
      } else {
        setAiResult({ reply: j.reply });
      }
    } catch (e) {
      setAiResult({ error: (e as Error).message });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 메시지 입력 + AI */}
      <div className="bg-white border border-slate-200 rounded p-4">
        <div className="text-sm font-bold text-slate-800 mb-2">🤖 고객 메시지 → 답변 추천</div>
        <textarea
          value={customerMsg}
          onChange={(e) => setCustomerMsg(e.target.value)}
          placeholder="고객 메시지를 붙여넣으면 카테고리 자동 매칭됩니다.&#10;예: 입금했어요. 주문 확인 부탁드려요."
          className="w-full border border-slate-300 rounded p-2 text-sm h-20 resize-none focus:outline-none focus:border-slate-500"
        />
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <button
            onClick={askAi}
            disabled={aiBusy || !customerMsg.trim()}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {aiBusy ? "⏳ AI 답변 생성 중…" : "🤖 AI 답변 생성 (Claude)"}
          </button>
          <button
            onClick={() => { setCustomerMsg(""); setAiResult(null); }}
            disabled={!customerMsg && !aiResult}
            className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded hover:bg-slate-200 disabled:opacity-50"
          >
            지우기
          </button>
          <span className="text-[11px] text-slate-500">
            매칭된 카테고리 {matched.length}개
          </span>
        </div>
        {aiResult?.error && (
          <div className="mt-2 bg-rose-50 border border-rose-200 rounded p-2 text-xs text-rose-800">
            ❌ {aiResult.error}
            {aiResult.error.includes("API") && (
              <div className="mt-1 text-[10px] text-rose-600">
                서버 .env 에 <code>ANTHROPIC_API_KEY</code> 설정 필요
              </div>
            )}
          </div>
        )}
        {aiResult?.reply && (
          <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded p-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] font-bold text-indigo-800">🤖 Claude AI 추천 답변</span>
              <button
                onClick={() => copyToClipboard(aiResult.reply!, "ai")}
                className="text-[10px] px-2 py-0.5 bg-white border border-indigo-300 rounded hover:bg-indigo-100"
              >
                {copied === "ai" ? "✓ 복사됨" : "📋 복사"}
              </button>
            </div>
            <pre className="text-xs whitespace-pre-wrap text-slate-800">{aiResult.reply}</pre>
            <div className="mt-2 text-[10px] text-indigo-700">
              ※ AI 답변은 참고용 — 정확한 정보(주문번호/금액 등)는 직접 확인 후 발송
            </div>
          </div>
        )}
      </div>

      {/* 검색 — 메시지 없을 때 */}
      {!customerMsg.trim() && (
        <div className="bg-white border border-slate-200 rounded p-2 flex items-center gap-2">
          <span className="text-xs text-slate-500 pl-2">🔍 검색</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="카테고리·키워드·답변 텍스트 검색"
            className="flex-1 text-sm px-2 py-1 focus:outline-none"
          />
        </div>
      )}

      {/* 매뉴얼 카드들 */}
      <div className="space-y-3">
        {matched.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded p-4 text-center text-slate-500 text-sm">
            매칭되는 항목 없음
          </div>
        ) : (
          matched.map((item) => (
            <div
              key={item.id}
              className={`bg-white border border-slate-200 border-l-4 ${SEVERITY_BAR[item.severity]} rounded p-3`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <div className="font-bold text-slate-800">
                  <span className="mr-1">{item.icon}</span>{item.category}
                  <span className="ml-2 text-[11px] text-slate-500 font-normal">— {item.customer_intent}</span>
                </div>
                <span className={`text-[10px] font-semibold ${SEVERITY_TEXT[item.severity]}`}>
                  {item.severity === "danger" ? "🚨 상담사 우선" : item.severity === "warn" ? "⚠️ 신중 응대" : "✓ 자동 가능"}
                </span>
              </div>

              {item.escalation && (
                <div className="mb-2 text-[11px] bg-rose-50 border border-rose-200 rounded p-1.5 text-rose-800">
                  {item.escalation}
                </div>
              )}

              <div className="space-y-1.5">
                {item.reply_templates.map((tpl, ti) => {
                  const key = `${item.id}-${ti}`;
                  return (
                    <div key={ti} className="bg-slate-50 border border-slate-200 rounded p-2">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[11px] font-semibold text-slate-600">📝 {tpl.label}</span>
                        <button
                          onClick={() => copyToClipboard(tpl.text, key)}
                          className="text-[10px] px-2 py-0.5 bg-white border border-slate-300 rounded hover:bg-slate-100"
                        >
                          {copied === key ? "✓ 복사됨" : "📋 복사"}
                        </button>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap text-slate-800">{tpl.text}</pre>
                    </div>
                  );
                })}
              </div>

              {item.policy_notes && item.policy_notes.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-500">
                  <div className="font-semibold mb-0.5">📌 정책 메모</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {item.policy_notes.map((p, pi) => <li key={pi}>{p}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
