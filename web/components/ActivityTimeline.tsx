"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventActivity } from "@/lib/data";
import { apiUrl } from "@/lib/api";

interface Props {
  shortId: string;             // 행사 dedup_id 앞 6자
  activities: EventActivity[];
}

const KIND_ICON: Record<string, string> = {
  status: "🔄",
  memo: "📝",
  period: "📅",
  ad_spend: "💰",
  sku_register: "📦",
  sku_unregister: "🗑️",
  sales: "💵",
  comment: "💬",
  field: "✏️",
};

function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - t) / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return iso.slice(5, 10);  // MM-DD
}

export default function ActivityTimeline({ shortId, activities }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function addComment() {
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/event/${shortId}/comment`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`실패: ${j?.error || r.statusText}`);
        return;
      }
      setComment("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteActivity(id: number) {
    if (!confirm("이 활동 기록을 지울까요?")) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/event/${shortId}/comment?activity_id=${id}`), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`실패: ${j?.error || r.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span>💬 활동 타임라인 ({activities.length})</span>
      </div>

      {/* 코멘트 입력 */}
      <div className="flex gap-1">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
          placeholder="코멘트 (Enter 저장) — 예: 'MD가 광고비 +5만 요청'"
          disabled={busy}
          className="flex-1 text-xs border rounded px-2 py-1.5"
        />
        <button
          onClick={addComment}
          disabled={busy || !comment.trim()}
          className="text-xs px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
        >
          기록
        </button>
      </div>

      {/* 타임라인 */}
      {activities.length === 0 ? (
        <div className="text-[11px] text-slate-400 py-2">아직 활동 없음. 상태/메모/기간 등 변경 시 자동으로 쌓입니다.</div>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {activities.map((a) => {
            const icon = KIND_ICON[a.kind] ?? "•";
            const isComment = a.kind === "comment";
            return (
              <li
                key={a.id}
                className={`text-xs px-2 py-1 rounded flex items-start gap-1.5 group ${
                  isComment ? "bg-blue-50 border-l-2 border-blue-400" : "bg-slate-50"
                }`}
              >
                <span className="shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={isComment ? "text-blue-900 whitespace-pre-wrap" : "text-slate-700"}>
                    {a.text}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5" title={fmtTime(a.created_at)}>
                    {relativeTime(a.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => deleteActivity(a.id)}
                  disabled={busy}
                  className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 text-[10px]"
                  title="기록 지우기"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
