"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/api";

interface ProductKb {
  summary?: string | null;
  features?: unknown;
  storage_shelf_life?: unknown;
  packaging_options?: unknown;
  pricing_hints?: unknown;
  common_concerns?: unknown;
  pair_recommendations?: unknown;
  caveats?: unknown;
  frequent_phrases?: unknown;
  _reply_count?: number;
  _built_at?: string;
  /** 사용자 직접 입력 메타 (선택) */
  manual_notes?: string;
}

interface Props {
  products: string[];
  kb: Record<string, ProductKb>;
}

function flatten(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(" · ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => {
        const f = flatten(val);
        return f ? `${k}: ${f}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

export default function ProductsPanel({ products, kb }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");

  async function rebuildOne(product: string) {
    if (!confirm(`'${product}' 상품 지식을 다시 빌드할까요?\nClaude API 호출 1회 (~$0.01)`)) return;
    setBusy(product);
    setMsg(null);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(product)}`), {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setMsg(`❌ ${j.error || "실패"}`);
      } else {
        setMsg(`✓ ${product} 재빌드 완료 — 새로고침하면 반영됨`);
      }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveNote(product: string) {
    setBusy(product);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(product)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manual_notes: draftNote }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setMsg(`❌ ${j.error || "실패"}`);
      } else {
        setMsg(`✓ ${product} 메모 저장 — 새로고침하면 반영`);
        setEditing(null);
      }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const built = products.filter((p) => kb[p]);
  const notBuilt = products.filter((p) => !kb[p]);

  return (
    <div className="space-y-4">
      {msg && (
        <div className="bg-slate-100 border border-slate-200 rounded px-3 py-2 text-sm text-slate-700">
          {msg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-600 flex items-center justify-between flex-wrap gap-2">
        <div>
          <b className="text-slate-800">{built.length}</b>/{products.length} 상품 KB 빌드됨
          {notBuilt.length > 0 && (
            <span className="ml-2 text-slate-400">(미빌드: {notBuilt.join(", ")} — cs_messages 답변 부족)</span>
          )}
        </div>
        <div className="text-slate-400">
          매일 cs-upload 후 자동 incremental 학습 — 변화 큰 상품만 자동 재빌드
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((p) => {
          const k = kb[p];
          const hasKb = !!k;
          const summary = k?.summary || (hasKb ? "" : "(미빌드)");
          const isEditing = editing === p;
          return (
            <div key={p} className="bg-white border border-slate-200 rounded p-3">
              <div className="flex items-baseline justify-between mb-1.5 gap-2">
                <div className="font-bold text-slate-800">{p}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  {k?._reply_count !== undefined && (
                    <span>답변 {k._reply_count}건</span>
                  )}
                  {k?._built_at && (
                    <span>· {k._built_at.slice(5, 10)}</span>
                  )}
                  <button
                    onClick={() => rebuildOne(p)}
                    disabled={busy === p}
                    className="ml-1 px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 disabled:opacity-50"
                  >
                    {busy === p ? "..." : "↻ 재빌드"}
                  </button>
                </div>
              </div>

              {summary && (
                <div className="text-xs text-slate-700 mb-2">{summary}</div>
              )}

              {hasKb && (
                <div className="space-y-1 text-[11px] text-slate-600 mb-2">
                  {[
                    { label: "특징", v: k.features },
                    { label: "가격", v: k.pricing_hints },
                    { label: "구성", v: k.packaging_options },
                    { label: "보관·유통", v: k.storage_shelf_life },
                    { label: "주의", v: k.caveats },
                    { label: "자주 묻는 점", v: k.common_concerns },
                    { label: "어울리는", v: k.pair_recommendations },
                    { label: "회사 자주 쓰는 표현", v: k.frequent_phrases },
                  ].map((f, i) => {
                    const t = flatten(f.v);
                    if (!t) return null;
                    return (
                      <div key={i} className="flex gap-1">
                        <span className="text-slate-400 shrink-0">{f.label}:</span>
                        <span className="text-slate-700">{t}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 사용자 직접 메모 영역 */}
              <div className="pt-2 border-t border-slate-100">
                {isEditing ? (
                  <div>
                    <textarea
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder="알레르기 정보, 원재료, 추가 안내 사항 등 직접 입력"
                      className="w-full text-xs border border-slate-300 rounded p-1.5 h-16 resize-none focus:outline-none focus:border-slate-500"
                    />
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => saveNote(p)}
                        disabled={busy === p}
                        className="text-[11px] px-2 py-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-[11px] px-2 py-0.5 bg-slate-100 rounded hover:bg-slate-200"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(p);
                      setDraftNote(k?.manual_notes ?? "");
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    {k?.manual_notes ? `📝 메모: ${k.manual_notes.slice(0, 50)}${k.manual_notes.length > 50 ? "…" : ""}` : "+ 메모 추가 (직접 보강)"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-400 text-center">
        ※ KB 는 cs_messages 발신 답변에서 자동 추출. 메모 추가하면 AI 답변에 함께 반영됨.
      </div>
    </div>
  );
}
