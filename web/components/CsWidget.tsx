import Link from "next/link";
import type { CsDaily } from "@/lib/data";

interface Props {
  cs: CsDaily[];
}

const CHANNEL_COLORS: Record<string, string> = {
  카카오: "bg-yellow-400",
  SMS: "bg-blue-400",
  네이버: "bg-emerald-500",
};

export default function CsWidget({ cs }: Props) {
  const total = cs.reduce((s, d) => s + d.in + d.out, 0);
  // 데이터 없으면 안내 카드만
  if (total === 0) {
    return (
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-500 flex items-center justify-between">
        <div>
          💬 <b>CS 데이터 없음</b> — 이지데스크 .xls 업로드하면 일별 카톡/SMS 인입량 자동 표시
        </div>
        <Link href="/cs-upload" className="px-2 py-1 bg-emerald-600 text-white text-[11px] rounded hover:bg-emerald-700">
          📤 업로드
        </Link>
      </div>
    );
  }

  const totalIn = cs.reduce((s, d) => s + d.in, 0);
  const totalOut = cs.reduce((s, d) => s + d.out, 0);
  const days = cs.filter((d) => d.in + d.out > 0).length;
  const avgIn = days > 0 ? Math.round(totalIn / days) : 0;
  // 채널 점유 (인입 기준)
  const chTotal: Record<string, number> = {};
  for (const d of cs) {
    for (const [ch, n] of Object.entries(d.by_channel)) {
      chTotal[ch] = (chTotal[ch] || 0) + n;
    }
  }
  const totalCh = Object.values(chTotal).reduce((s, n) => s + n, 0);
  const channels = Object.entries(chTotal).sort(([, a], [, b]) => b - a);

  // 일별 막대 — 인입+발신 최대값 기준
  const maxBar = Math.max(...cs.map((d) => d.in + d.out), 1);

  return (
    <div className="mb-4 bg-white border-l-4 border-blue-400 rounded p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="text-sm font-bold text-slate-800">💬 CS — 최근 {cs.length}일</span>
          <span className="ml-2 text-[11px] text-slate-500">
            인입 <b className="text-blue-700">{totalIn.toLocaleString()}</b>건 · 발신 <b className="text-slate-600">{totalOut.toLocaleString()}</b>건 · 일평균 인입 {avgIn}건
          </span>
        </div>
        <Link href="/cs-upload" className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
          📤 .xls 업로드
        </Link>
      </div>

      {/* 채널 점유 — 가로 stacked 막대 */}
      <div className="mb-2">
        <div className="text-[10px] text-slate-500 mb-1">채널 점유 (인입+발신)</div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
          {channels.map(([ch, n]) => {
            const pct = (n / totalCh) * 100;
            const color = CHANNEL_COLORS[ch] || "bg-slate-400";
            return (
              <div key={ch} className={`h-full ${color}`} style={{ width: `${pct}%` }} title={`${ch} ${n.toLocaleString()}건 (${pct.toFixed(0)}%)`} />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
          {channels.map(([ch, n]) => {
            const pct = (n / totalCh) * 100;
            const color = CHANNEL_COLORS[ch] || "bg-slate-400";
            return (
              <span key={ch} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${color} inline-block`}></span>
                <b>{ch}</b> {n.toLocaleString()} ({pct.toFixed(0)}%)
              </span>
            );
          })}
        </div>
      </div>

      {/* 일별 막대 차트 */}
      <div>
        <div className="text-[10px] text-slate-500 mb-1">일별 인입·발신</div>
        <div className="flex items-end gap-0.5 h-16">
          {cs.map((d) => {
            const inH = (d.in / maxBar) * 100;
            const outH = (d.out / maxBar) * 100;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col justify-end gap-px"
                title={`${d.date} · 인입 ${d.in} · 발신 ${d.out}`}
              >
                <div className="bg-slate-400" style={{ height: `${outH}%`, minHeight: d.out > 0 ? "1px" : "0" }}></div>
                <div className="bg-blue-500" style={{ height: `${inH}%`, minHeight: d.in > 0 ? "1px" : "0" }}></div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
          <span>{cs[0]?.date.slice(5) ?? ""}</span>
          <span>{cs[cs.length - 1]?.date.slice(5) ?? ""}</span>
        </div>
      </div>
    </div>
  );
}
