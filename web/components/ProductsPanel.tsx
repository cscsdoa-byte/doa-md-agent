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
  manual_notes?: string;
  channel_urls?: Record<string, string>;
}

interface Props {
  products: string[];
  kb: Record<string, ProductKb>;
}

const CHANNEL_OPTIONS = [
  "자사몰", "스마트스토어", "쿠팡", "11번가", "토스쇼핑",
  "지마켓", "옥션", "카카오톡스토어",
  "NS홈쇼핑", "쇼핑엔티", "CJ온스타일", "롯데홈쇼핑",
  "K쇼핑", "공영홈쇼핑", "신세계홈쇼핑", "홈쇼핑모아",
];

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
  const [selected, setSelected] = useState<string>(products[0] ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [draftChannel, setDraftChannel] = useState(CHANNEL_OPTIONS[0]);
  const [draftUrl, setDraftUrl] = useState("");

  async function rebuildOne(product: string) {
    if (!confirm(`'${product}' 상품 지식을 다시 빌드할까요?\nClaude API 호출 1회 (~$0.01, 30초~1분)`)) return;
    setBusy(product);
    setMsg(null);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(product)}`), { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) setMsg(`❌ ${j.error || "실패"}`);
      else setMsg(`✓ ${product} 재빌드 완료 — F5 새로고침`);
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
      if (!r.ok || j.error) setMsg(`❌ ${j.error || "실패"}`);
      else { setMsg(`✓ 메모 저장 — F5 새로고침`); setEditingNote(false); }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function addUrl(product: string, currentUrls: Record<string, string>) {
    const url = draftUrl.trim();
    if (!url) { alert("URL 입력 필요"); return; }
    setBusy(product);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(product)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel_urls: { ...currentUrls, [draftChannel]: url } }),
      });
      const j = await r.json();
      if (!r.ok || j.error) setMsg(`❌ ${j.error || "실패"}`);
      else { setMsg(`✓ ${draftChannel} 링크 추가 — F5`); setDraftUrl(""); }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function removeUrl(product: string, channel: string, currentUrls: Record<string, string>) {
    if (!confirm(`${channel} 링크 삭제?`)) return;
    const newUrls = { ...currentUrls };
    delete newUrls[channel];
    setBusy(product);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(product)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel_urls: newUrls }),
      });
      const j = await r.json();
      if (!r.ok || j.error) setMsg(`❌ ${j.error || "실패"}`);
      else setMsg(`✓ 삭제됨 — F5`);
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const k = kb[selected];
  const hasKb = !!k;
  const urls = k?.channel_urls ?? {};
  const urlChannels = Object.keys(urls);

  return (
    <div className="space-y-3">
      {/* 상단 메시지 */}
      {msg && (
        <div className="bg-slate-100 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-700">{msg}</div>
      )}

      {/* 상품 선택 탭 */}
      <div className="bg-white border border-slate-200 rounded p-2 flex flex-wrap gap-1">
        {products.map((p) => {
          const has = !!kb[p];
          const isSel = selected === p;
          return (
            <button
              key={p}
              onClick={() => { setSelected(p); setEditingNote(false); setDraftUrl(""); }}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                isSel
                  ? "bg-slate-800 text-white"
                  : has
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "bg-slate-50 text-slate-400 hover:bg-slate-100"
              }`}
            >
              {p}{!has && " (미빌드)"}
            </button>
          );
        })}
      </div>

      {/* 선택된 상품 상세 */}
      <div className="bg-white border border-slate-200 rounded p-4 space-y-4">
        {/* 헤더 */}
        <div className="flex items-baseline justify-between flex-wrap gap-2 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{selected}</h2>
            {k?.summary && <div className="text-sm text-slate-600 mt-0.5">{k.summary}</div>}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {k?._reply_count !== undefined && <span>📚 답변 {k._reply_count}건</span>}
            {k?._built_at && <span>· 빌드 {k._built_at.slice(5, 10)}</span>}
            <button
              onClick={() => rebuildOne(selected)}
              disabled={busy === selected}
              className="ml-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 disabled:opacity-50 font-semibold"
            >
              {busy === selected ? "처리중..." : "↻ 재빌드"}
            </button>
          </div>
        </div>

        {!hasKb && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
            아직 이 상품의 KB 가 빌드되지 않았어요. CS 데이터에 답변이 쌓이거나 ↻ 재빌드 하면 채워집니다.
          </div>
        )}

        {/* 2 컬럼: 좌측 KB / 우측 채널·메모 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 좌: KB 정보 */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 mb-1">📋 자동 추출 정보 (KB)</div>
            {hasKb ? (
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "특징", v: k.features },
                  { label: "가격", v: k.pricing_hints },
                  { label: "구성", v: k.packaging_options },
                  { label: "보관·유통", v: k.storage_shelf_life },
                  { label: "주의사항", v: k.caveats },
                  { label: "자주 묻는 점", v: k.common_concerns },
                  { label: "어울리는", v: k.pair_recommendations },
                  { label: "회사 자주 쓰는 표현", v: k.frequent_phrases },
                ].map((f, i) => {
                  const t = flatten(f.v);
                  if (!t) return null;
                  return (
                    <div key={i} className="bg-slate-50 rounded p-2">
                      <div className="text-[10px] font-semibold text-slate-500 mb-0.5">{f.label}</div>
                      <div className="text-slate-800 leading-relaxed">{t}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400">정보 없음</div>
            )}
          </div>

          {/* 우: 채널 링크 + 메모 */}
          <div className="space-y-3">
            {/* 채널 링크 */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>🔗 채널별 상품 페이지</span>
                <span className="text-[10px] text-slate-400 font-normal">{urlChannels.length}/{CHANNEL_OPTIONS.length}</span>
              </div>
              {urlChannels.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {urlChannels.map((ch) => (
                    <div key={ch} className="flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1">
                      <a
                        href={urls[ch]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-blue-700 hover:underline font-semibold truncate"
                        title={urls[ch]}
                      >
                        {ch} ↗
                      </a>
                      <button
                        onClick={() => removeUrl(selected, ch, urls)}
                        className="text-slate-400 hover:text-rose-600 text-sm leading-none px-1"
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 mb-2 italic">
                  등록된 링크 없음 — 채널 사이트에서 상품 URL 복사해 추가
                </div>
              )}

              {/* 링크 추가 폼 */}
              <div className="bg-slate-50 border border-slate-200 rounded p-2 space-y-1.5">
                <select
                  value={draftChannel}
                  onChange={(e) => setDraftChannel(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                >
                  {CHANNEL_OPTIONS.map((c) => {
                    const taken = !!urls[c];
                    return (
                      <option key={c} value={c}>{c}{taken && " (이미 등록됨, 덮어쓰기)"}</option>
                    );
                  })}
                </select>
                <input
                  type="url"
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-xs border border-slate-300 rounded px-2 py-1"
                />
                <button
                  onClick={() => addUrl(selected, urls)}
                  disabled={busy === selected || !draftUrl.trim()}
                  className="w-full text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-semibold"
                >
                  + 링크 추가
                </button>
              </div>
            </div>

            {/* 직접 메모 */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>📝 직접 입력 메모</span>
                <span className="text-[10px] text-slate-400 font-normal">AI 답변에 반드시 반영</span>
              </div>
              {editingNote ? (
                <div className="space-y-1">
                  <textarea
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder="알레르기·원재료·추가 안내사항 등&#10;예: 두쫀모 알레르기 정보 — 밀, 우유, 견과류(피스타치오)"
                    className="w-full text-xs border border-slate-300 rounded p-2 h-24 resize-none focus:outline-none focus:border-slate-500"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => saveNote(selected)}
                      disabled={busy === selected}
                      className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 font-semibold"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => { setEditingNote(false); setDraftNote(k?.manual_notes ?? ""); }}
                      className="text-xs px-3 py-1 bg-slate-100 rounded hover:bg-slate-200"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : k?.manual_notes ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-slate-800 whitespace-pre-wrap">
                  {k.manual_notes}
                  <button
                    onClick={() => { setEditingNote(true); setDraftNote(k.manual_notes!); }}
                    className="block mt-1 text-[10px] text-emerald-700 hover:underline"
                  >
                    ✎ 편집
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingNote(true); setDraftNote(""); }}
                  className="w-full text-xs text-slate-500 hover:text-slate-700 bg-slate-50 border border-dashed border-slate-300 rounded p-2 hover:bg-slate-100"
                >
                  + 메모 추가 (사이트 보면서 알레르기·원재료 등 보강)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-slate-400 text-center pt-2">
        ※ 채널 링크 등록 → 클릭하면 새 탭에서 채널 상품 페이지 열림 → 정보 확인 후 메모 보강 → AI 답변에 반영
      </div>
    </div>
  );
}
