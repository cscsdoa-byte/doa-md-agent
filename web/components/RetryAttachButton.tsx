"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "@/lib/api";

interface Props {
  eventId: string;
  channel: string;
  brand?: string;
}

export default function RetryAttachButton({ eventId, channel, brand }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(apiUrl(`/api/event/${eventId}/attach-channel-totals`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, brand }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string; stderr?: string };
      if (!r.ok || !data.ok) {
        setMsg(`❌ ${data.error || "실패"}`);
      } else {
        setMsg("✅ 갱신 완료");
        router.refresh();
      }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-semibold disabled:opacity-50"
        title={`${channel} 채널 전체 매출을 ${eventId.slice(0, 6)} 행사에 attach`}
      >
        {busy ? "⏳ 처리중" : "🔁 매출 매칭 재시도"}
      </button>
      {msg && <span className="text-[10px] text-slate-600">{msg}</span>}
    </div>
  );
}
