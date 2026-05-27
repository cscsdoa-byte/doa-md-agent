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
  interface ReplyOption { label: string; text: string }
  interface AnalysisExtracted {
    order_ids: string[]; phones: string[]; amounts: string[]; products: string[]; dates: string[];
  }
  interface AnalysisData {
    intent: string;
    sentiment: string;
    urgency: number;
    extracted: AnalysisExtracted;
    similar_replies: { intent: string; customer_msg: string; agent_reply: string; count: number }[];
  }
  interface AiResult {
    analysis?: AnalysisData | null;
    analysis_summary?: string;
    replies?: ReplyOption[];
    follow_up_actions?: string[];
    escalation?: string;
    error?: string;
    raw?: string;
  }
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
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
        setAiResult({ error: j.error || "AI 호출 실패", raw: j.raw });
      } else {
        setAiResult(j as AiResult);
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
            {aiResult.raw && (
              <pre className="mt-1 text-[10px] overflow-auto bg-white p-1 rounded">{aiResult.raw}</pre>
            )}
          </div>
        )}
        {aiResult && !aiResult.error && (
          <div className="mt-3 space-y-3">
            {/* 분석 카드 */}
            {aiResult.analysis && (
              <div className="bg-slate-50 border border-slate-200 border-l-4 border-l-slate-500 rounded p-3">
                <div className="text-[11px] font-bold text-slate-800 mb-1.5">🔍 분석 결과</div>
                {aiResult.analysis_summary && (
                  <div className="text-xs text-slate-700 mb-2">{aiResult.analysis_summary}</div>
                )}
                <div className="flex flex-wrap gap-1.5 text-[10px] mb-1">
                  <span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                    의도: <b>{aiResult.analysis.intent}</b>
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border ${
                    aiResult.analysis.urgency >= 3 ? "bg-rose-50 border-rose-300 text-rose-800" :
                    aiResult.analysis.urgency >= 2 ? "bg-amber-50 border-amber-300 text-amber-800" :
                    "bg-white border-slate-300"
                  }`}>
                    감정: <b>{aiResult.analysis.sentiment}</b> · 긴급도 {aiResult.analysis.urgency}/3
                  </span>
                  <span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                    과거 답변 매칭: <b>{aiResult.analysis.similar_replies.length}건</b>
                  </span>
                </div>
                {(() => {
                  const e = aiResult.analysis!.extracted;
                  const lines: { k: string; v: string }[] = [];
                  if (e.order_ids.length) lines.push({ k: "주문번호", v: e.order_ids.join(", ") });
                  if (e.phones.length) lines.push({ k: "전화번호", v: e.phones.join(", ") });
                  if (e.amounts.length) lines.push({ k: "금액", v: e.amounts.join(", ") });
                  if (e.products.length) lines.push({ k: "상품", v: e.products.join(", ") });
                  if (e.dates.length) lines.push({ k: "날짜", v: e.dates.join(", ") });
                  if (lines.length === 0) return null;
                  return (
                    <div className="mt-1.5 text-[10px] grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5">
                      {lines.map((l, i) => (
                        <div key={i} className="text-slate-600">
                          <span className="text-slate-400">{l.k}:</span> <b className="text-slate-800 font-mono">{l.v}</b>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Escalation 경고 */}
            {aiResult.escalation && (
              <div className="bg-rose-50 border border-rose-300 border-l-4 border-l-rose-600 rounded p-2 text-xs text-rose-900">
                🚨 <b>{aiResult.escalation}</b>
              </div>
            )}

            {/* 답변 3개 옵션 */}
            {aiResult.replies && aiResult.replies.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-800">🤖 Claude 답변 옵션 (선택해서 복사)</div>
                {aiResult.replies.map((opt, i) => {
                  const key = `ai-${i}`;
                  return (
                    <div key={i} className="bg-slate-50 border border-slate-200 border-l-4 border-l-indigo-500 rounded p-2">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[11px] font-semibold text-slate-700">📝 {opt.label}</span>
                        <button
                          onClick={() => copyToClipboard(opt.text, key)}
                          className="text-[10px] px-2 py-0.5 bg-white border border-slate-300 rounded hover:bg-slate-100"
                        >
                          {copied === key ? "✓ 복사됨" : "📋 복사"}
                        </button>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap text-slate-800">{opt.text}</pre>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 후속 액션 */}
            {aiResult.follow_up_actions && aiResult.follow_up_actions.length > 0 && (
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-[11px] font-bold text-slate-800 mb-1">✅ 후속 액션 (답변 후 처리)</div>
                <ul className="space-y-0.5">
                  {aiResult.follow_up_actions.map((a, i) => (
                    <li key={i} className="text-[11px] text-slate-700 flex items-baseline gap-1.5">
                      <span className="text-slate-400">{i + 1}.</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 컨텍스트 투명성 — 매칭된 과거 답변 */}
            {aiResult.analysis?.similar_replies && aiResult.analysis.similar_replies.length > 0 && (
              <details className="bg-white border border-slate-200 rounded p-2">
                <summary className="text-[11px] font-semibold text-slate-600 cursor-pointer">
                  📚 컨텍스트로 사용된 과거 운영 답변 {aiResult.analysis.similar_replies.length}건 (펼치기)
                </summary>
                <div className="mt-2 space-y-1.5">
                  {aiResult.analysis.similar_replies.map((p, i) => (
                    <div key={i} className="text-[10px] bg-slate-50 rounded p-1.5 border border-slate-200">
                      <div className="text-slate-500 mb-0.5">[{i + 1}] {p.intent} · 과거 {p.count}회 발신</div>
                      <div className="text-slate-700 mb-0.5">👤 {p.customer_msg}</div>
                      <div className="text-slate-800">💬 {p.agent_reply}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="text-[10px] text-slate-500">
              ※ 정확한 정보(주문번호/금액/날짜)는 직접 시스템에서 확인 후 발송
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
