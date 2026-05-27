import Link from "next/link";
import type { CsDaily, CsHourly, CsTopQuestion } from "@/lib/data";

// 인입 TOP 질문 → 챗봇 자동답변 시나리오 가이드 매핑.
// 키워드 포함시 추천 답변 안 (사용자가 카카오 챗봇/이지데스크 캔드답변에 붙여넣기 베이스).
const AUTO_REPLY_GUIDE: { match: RegExp; tip: string }[] = [
  { match: /입금|송금/, tip: "💡 자동: 「입금 확인 중입니다. 주문번호 알려주시면 즉시 확인해드릴게요」 + 주문번호 입력 받기" },
  { match: /배송조회|배송|언제 와|어디|도착/, tip: "💡 자동: 「주문번호 알려주시면 배송 상태 안내드릴게요」 + 배송 추적 링크" },
  { match: /상담원|상담사|상담연결|상담원연결/, tip: "💡 자동: 인증 플로우 → 상담원 연결 (이미 운영중)" },
  { match: /전화번호|폰번호|번호/, tip: "💡 자동: 「휴대폰 번호를 -없이 숫자만 입력해주세요」 + 인증번호 발송" },
  { match: /환불|취소|반품|교환/, tip: "🚨 상담사 우선 — 자동 대응 X, 큰 이슈 카드로 분류됨" },
  { match: /주문|문의/, tip: "💡 자동: 「주문번호 또는 전화번호 알려주시면 확인해드릴게요」" },
  { match: /확인|부탁/, tip: "💡 자동: 「어떤 부분 확인이 필요하신가요? 주문번호 알려주시면 빠르게 처리됩니다」" },
];

function autoReplyTip(sample: string): string | null {
  for (const { match, tip } of AUTO_REPLY_GUIDE) {
    if (match.test(sample)) return tip;
  }
  return null;
}

interface Props {
  cs: CsDaily[];
  hourly?: CsHourly[];
  top?: CsTopQuestion[];
  canned?: CsTopQuestion[];
}

const CHANNEL_COLORS: Record<string, string> = {
  카카오: "bg-yellow-400",
  SMS: "bg-blue-400",
  네이버: "bg-emerald-500",
};

export default function CsWidget({ cs, hourly, top, canned }: Props) {
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
      <div className="mb-2">
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

      {/* 시간대별 평균 (최근 7일) */}
      {hourly && hourly.length > 0 && (() => {
        const maxH = Math.max(...hourly.map((h) => h.in + h.out), 1);
        const peakHour = hourly.reduce((p, c) => (c.in > p.in ? c : p), hourly[0]);
        return (
          <div className="mb-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-500 mb-1">
              시간대 평균 (최근 7일) · 피크 <b className="text-rose-700">{peakHour.hour}시</b> 일평균 {peakHour.in}건 인입
            </div>
            <div className="flex items-end gap-px h-10">
              {hourly.map((h) => {
                const inH = ((h.in) / maxH) * 100;
                const outH = ((h.out) / maxH) * 100;
                const isPeak = h.hour === peakHour.hour;
                return (
                  <div key={h.hour} className="flex-1 flex flex-col justify-end gap-px" title={`${h.hour}시 · 인입 ${h.in} · 발신 ${h.out}`}>
                    <div className="bg-slate-300" style={{ height: `${outH}%`, minHeight: h.out > 0 ? "1px" : "0" }}></div>
                    <div className={isPeak ? "bg-rose-500" : "bg-blue-400"} style={{ height: `${inH}%`, minHeight: h.in > 0 ? "1px" : "0" }}></div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 mt-1">
              <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span>
            </div>
          </div>
        );
      })()}

      {/* 짧은 질문 top — 자동응답 후보 (시스템 메시지 제외, 진짜 고객 입력만) */}
      {top && top.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">
            🤖 고객 인입 질문 TOP — <b>챗봇 자동응답 후보</b> (최근 30일, 20자 미만, 시스템 메시지 제외)
          </div>
          <ol className="space-y-1">
            {top.slice(0, 5).map((q, i) => {
              const tip = autoReplyTip(q.sample);
              return (
                <li key={i} className="bg-emerald-50 px-2 py-1 rounded">
                  <div className="text-[11px] flex items-baseline gap-2">
                    <span className="font-mono text-slate-400">{i + 1}.</span>
                    <span className="flex-1 truncate" title={q.sample}>{q.sample}</span>
                    <span className="text-[10px] text-emerald-700 font-bold whitespace-nowrap">{q.count}회</span>
                    {q.variants > 1 && (
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">+{q.variants - 1}변형</span>
                    )}
                  </div>
                  {tip && (
                    <div className="text-[10px] text-emerald-800 mt-0.5 ml-4">{tip}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* 반복 발신 (캔드답변) — 자동화 효과 측정 */}
      {canned && canned.length > 0 && (
        <div className="pt-2 mt-2 border-t border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">
            🔁 반복 발신 답변 TOP — <b>이미 운영 중인 캔드답변</b> (챗봇 시나리오 매핑 우선순위)
          </div>
          <ol className="space-y-0.5">
            {canned.slice(0, 5).map((q, i) => (
              <li key={i} className="text-[11px] flex items-baseline gap-2 bg-blue-50 px-2 py-1 rounded">
                <span className="font-mono text-slate-400">{i + 1}.</span>
                <span className="flex-1 truncate" title={q.sample}>{q.sample}</span>
                <span className="text-[10px] text-blue-700 font-bold whitespace-nowrap">{q.count}회</span>
                {q.variants > 1 && (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">+{q.variants - 1}변형</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
