"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";

interface AdComment {
  id: number; platform: string; post_url?: string | null; post_label?: string | null;
  comment_text: string; author?: string | null; posted_at?: string | null;
  sentiment?: string | null; severity?: number; keywords?: string | null;
  flagged?: number; handled?: number; notes?: string | null; imported_at: string;
}

const PLATFORMS = [
  { v: "instagram", label: "📷 인스타", color: "text-pink-700" },
  { v: "youtube", label: "▶ 유튜브", color: "text-red-700" },
  { v: "kakao", label: "💬 카카오", color: "text-yellow-700" },
  { v: "facebook", label: "Ⓕ 페북", color: "text-blue-700" },
  { v: "tiktok", label: "♪ 틱톡", color: "text-slate-700" },
  { v: "sns_own", label: "📱 자체", color: "text-slate-600" },
];

const SEVERITY_BADGE: Record<number, { label: string; cls: string }> = {
  3: { label: "🚨 긴급", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  2: { label: "부정", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  1: { label: "주의", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  0: { label: "중립", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

export default function CommentsPanel({ comments }: { comments: AdComment[] }) {
  const [filter, setFilter] = useState<"all" | "unhandled" | "high">("unhandled");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 등록 폼
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    platform: "instagram", comment_text: "", post_url: "", post_label: "", author: "", notes: "",
  });

  const filtered = useMemo(() => {
    return comments.filter((c) => {
      if (filter === "unhandled" && c.handled === 1) return false;
      if (filter === "high" && (c.severity ?? 0) < 2) return false;
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      return true;
    });
  }, [comments, filter, platformFilter]);

  async function submitComment() {
    if (!draft.comment_text.trim()) { alert("댓글 내용 필수"); return; }
    setBusy(-1); setMsg(null);
    try {
      const r = await fetch(apiUrl("/api/comments"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!r.ok || j.error) setMsg(`❌ ${j.error || "실패"}`);
      else {
        const sev = j.row?.severity ?? 0;
        setMsg(`✓ 등록됨 (severity ${sev}) — F5 새로고침`);
        setDraft({ platform: draft.platform, comment_text: "", post_url: "", post_label: "", author: "", notes: "" });
        setShowForm(false);
      }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function toggleHandled(c: AdComment) {
    setBusy(c.id);
    try {
      await fetch(apiUrl(`/api/comments?id=${c.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handled: c.handled ? 0 : 1 }),
      });
      setMsg(`✓ 처리상태 변경 — F5 새로고침`);
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function toggleFlag(c: AdComment) {
    setBusy(c.id);
    try {
      await fetch(apiUrl(`/api/comments?id=${c.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flagged: c.flagged ? 0 : 1 }),
      });
      setMsg(`✓ 플래그 변경 — F5`);
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function deleteComment(c: AdComment) {
    if (!confirm(`이 댓글을 삭제할까요?`)) return;
    setBusy(c.id);
    try {
      await fetch(apiUrl(`/api/comments?id=${c.id}`), { method: "DELETE" });
      setMsg(`✓ 삭제 — F5`);
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="bg-slate-100 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-700">{msg}</div>}

      {/* 필터 + 등록 버튼 */}
      <div className="bg-white border border-slate-200 rounded p-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">필터:</span>
        {(["unhandled", "high", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded ${filter === f ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
          >
            {f === "unhandled" ? "미처리" : f === "high" ? "부정만" : "전체"}
          </button>
        ))}
        <span className="ml-2 text-slate-500">플랫폼:</span>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 bg-white"
        >
          <option value="all">전체</option>
          {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-semibold"
        >
          {showForm ? "− 닫기" : "+ 댓글 등록"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={draft.platform}
              onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
              className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
            <input
              type="url"
              value={draft.post_url}
              onChange={(e) => setDraft({ ...draft, post_url: e.target.value })}
              placeholder="게시물 URL (선택)"
              className="text-xs border border-slate-300 rounded px-2 py-1.5 md:col-span-2"
            />
            <input
              value={draft.post_label}
              onChange={(e) => setDraft({ ...draft, post_label: e.target.value })}
              placeholder="게시물 라벨 (예: 두쫀모 유튜브 광고)"
              className="text-xs border border-slate-300 rounded px-2 py-1.5"
            />
            <input
              value={draft.author}
              onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              placeholder="작성자 (선택)"
              className="text-xs border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
          <textarea
            value={draft.comment_text}
            onChange={(e) => setDraft({ ...draft, comment_text: e.target.value })}
            placeholder="댓글 내용 (필수) — 키워드 자동 분류됨"
            className="w-full text-xs border border-slate-300 rounded p-2 h-20 resize-none"
          />
          <input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="처리 메모 (선택)"
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5"
          />
          <div className="flex gap-2">
            <button
              onClick={submitComment}
              disabled={busy === -1 || !draft.comment_text.trim()}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 text-sm font-semibold"
            >
              {busy === -1 ? "등록 중..." : "등록"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 bg-slate-100 rounded hover:bg-slate-200 text-sm"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 댓글 리스트 */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded p-6 text-center text-sm text-slate-500">
            {filter === "unhandled" ? "미처리 댓글 없음 (좋아요!)" : filter === "high" ? "부정 댓글 없음" : "등록된 댓글 없음"}
          </div>
        ) : (
          filtered.map((c) => {
            const sev = SEVERITY_BADGE[c.severity ?? 0];
            const pf = PLATFORMS.find((p) => p.v === c.platform);
            const handled = c.handled === 1;
            return (
              <div key={c.id} className={`bg-white border rounded p-3 ${
                handled ? "border-slate-200 opacity-60" :
                (c.severity ?? 0) >= 3 ? "border-l-4 border-l-rose-500 border-slate-200" :
                (c.severity ?? 0) >= 2 ? "border-l-4 border-l-orange-500 border-slate-200" :
                "border-l-4 border-l-amber-400 border-slate-200"
              }`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    <span className={`font-bold ${pf?.color ?? "text-slate-700"}`}>{pf?.label ?? c.platform}</span>
                    <span className={`px-1.5 py-0.5 rounded border font-semibold ${sev.cls}`}>{sev.label}</span>
                    {c.flagged === 1 && <span className="text-amber-600 font-bold">⭐</span>}
                    {handled && <span className="text-emerald-700 font-semibold">✓ 처리됨</span>}
                    {c.post_label && <span className="text-slate-500">· {c.post_label}</span>}
                    {c.author && <span className="text-slate-500">· {c.author}</span>}
                    {c.posted_at && <span className="text-slate-400">· {c.posted_at.slice(5, 16).replace("T", " ")}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleFlag(c)}
                      disabled={busy === c.id}
                      className="text-[10px] px-1.5 py-0.5 rounded hover:bg-slate-100"
                      title="플래그"
                    >
                      {c.flagged ? "⭐" : "☆"}
                    </button>
                    <button
                      onClick={() => toggleHandled(c)}
                      disabled={busy === c.id}
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        handled ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      }`}
                    >
                      {handled ? "↶ 미처리" : "✓ 처리"}
                    </button>
                    <button
                      onClick={() => deleteComment(c)}
                      disabled={busy === c.id}
                      className="text-[10px] px-1.5 py-0.5 rounded hover:bg-rose-100 text-slate-500"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-800 whitespace-pre-wrap mb-1">{c.comment_text}</div>
                {c.post_url && (
                  <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
                    원본 보기 ↗
                  </a>
                )}
                {c.notes && (
                  <div className="text-[10px] text-slate-500 mt-1 bg-slate-50 px-2 py-1 rounded">📝 {c.notes}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
