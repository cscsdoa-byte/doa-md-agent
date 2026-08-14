import Link from "next/link";
import Calendar from "@/components/Calendar";
import ChannelPL from "@/components/ChannelPL";
import ConflictBanner from "@/components/ConflictBanner";
import CsCriticalCard from "@/components/CsCriticalCard";
import CsWidget from "@/components/CsWidget";
import MdPL from "@/components/MdPL";
import TodaysActionsCard from "@/components/TodaysActionsCard";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";
import { fetchChannelPL } from "@/lib/settle";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [payload, channels, channelPL] = await Promise.all([
    loadEvents(),
    loadChannels(),
    fetchChannelPL().catch(() => ({ totals: null, prev_totals: null, range: null, channels: [] })),
  ]);
  const generatedAt = payload.generated_at?.slice(0, 16).replace("T", " ") ?? "";
  const settleBase = process.env.NEXT_PUBLIC_SETTLE_BASE_URL || "http://3.37.214.243";
  const opsCount = payload.events.filter(
    (e) => e.status === "running" || e.status === "selected"
  ).length;
  // 회고 미작성 — closed + sale_end 지난 지 14일 이내 + ops_retro_note 비어있음
  const retroPendingCount = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    let n = 0;
    for (const e of payload.events) {
      if (e.status !== "closed") continue;
      if (!e.sale_end) continue;
      const end = new Date(e.sale_end);
      if (isNaN(end.getTime())) continue;
      end.setHours(0, 0, 0, 0);
      if (end > today || end < cutoff) continue;
      if (e.ops_retro_note && e.ops_retro_note.trim()) continue;
      n++;
    }
    return n;
  })();

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-4 md:mb-6">
          <div className="mb-3">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">📅 도아 MD 행사 캘린더</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              데이터 갱신: {generatedAt} · 전체 {payload.total}건 · 도아 적합 {payload.doa_fit}건
            </p>
          </div>
          {/* 네비 버튼 — 모바일은 가로 스크롤, 데스크탑은 wrap */}
          <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap pb-1 -mx-3 px-3 md:mx-0 md:px-0 md:overflow-visible">
            <Link
              href="/ops"
              className={`shrink-0 px-3 py-1.5 text-xs md:text-sm rounded font-medium whitespace-nowrap ${
                opsCount > 0
                  ? "bg-pink-100 border border-pink-400 hover:bg-pink-200 text-pink-900"
                  : "bg-white border hover:bg-slate-50 text-slate-700"
              }`}
              title="진행중·선정 행사 한눈 보드"
            >
              🛠️ 운영 보드{opsCount > 0 && <span className="ml-1 font-extrabold">({opsCount})</span>}
            </Link>
            <Link
              href="/events"
              className={`shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap rounded ${
                retroPendingCount > 0
                  ? "bg-violet-100 border border-violet-400 hover:bg-violet-200 text-violet-900 font-medium"
                  : "bg-white border hover:bg-slate-50 text-slate-700"
              }`}
              title={retroPendingCount > 0 ? `회고 미작성 ${retroPendingCount}건 (14일 이내 종료)` : ""}
            >
              📊 행사 표
              {retroPendingCount > 0 && (
                <span className="ml-1 font-extrabold">· 📝{retroPendingCount}</span>
              )}
            </Link>
            <Link
              href="/jeongsan"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 text-amber-900 font-medium"
              title="정산자동화웹을 MD 에이전트 안에서 같이 보기"
            >
              💰 정산자동화
            </Link>
            <Link
              href="/toss-upload"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-sky-100 border border-sky-300 rounded hover:bg-sky-200 text-sky-900 font-medium"
              title="토스 정산 csv 업로드 (매월 1회)"
            >
              🧾 토스 정산
            </Link>
            <Link
              href="/cs-upload"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="이지데스크 CS .xls 업로드"
            >
              💬 CS 업로드
            </Link>
            <Link
              href="/cs-manual"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="CS 답변 매뉴얼 + AI 답변 추천"
            >
              📖 CS 매뉴얼
            </Link>
            <Link
              href="/products"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="상품 카탈로그 — KB 자동 추출 + 직접 메모"
            >
              📦 상품
            </Link>
            <Link
              href="/comments"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="광고·SNS 댓글 모니터링 (인스타/유튜브/카카오/페북/틱톡)"
            >
              💬 댓글
            </Link>
            <Link
              href="/channels"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="채널 종합 운영 보드"
            >
              📡 채널
            </Link>
            <Link
              href="/matrix"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="상품 × 채널 매트릭스 — 한눈에 입점 상태"
            >
              🧩 매트릭스
            </Link>
            <Link
              href="/templates"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              🔁 템플릿
            </Link>
            <Link
              href="/contacts"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              📇 MD 연락처
            </Link>
            <Link
              href="/sourcing"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
              title="신제품 공급처(공장) 컨택 진척 보드"
            >
              🧭 소싱 보드
            </Link>
            <Link
              href="/simulator"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              🧮 마진 시뮬레이터
            </Link>
            <a
              href={settleBase}
              target="_blank"
              rel="noopener"
              className="shrink-0 px-3 py-1.5 text-xs md:text-sm whitespace-nowrap bg-white border rounded hover:bg-slate-50 text-slate-700"
            >
              정산자동화웹 →
            </a>
          </div>
        </header>

        {/* 핵심: 캘린더 — 상단으로, 강조 박스 */}
        <section className="bg-white rounded-2xl shadow-xl border-2 border-indigo-200 p-4 md:p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">📅</span>
            <h2 className="text-lg md:text-xl font-bold text-slate-900">행사 캘린더</h2>
            <span className="text-xs text-slate-500 ml-auto">전체 {payload.total}건 · 도아 적합 {payload.doa_fit}건</span>
          </div>
          <Calendar
            events={payload.events}
            channels={channels}
            contacts={payload.contacts ?? []}
            templates={payload.templates ?? []}
          />
        </section>

        {/* 액션·경고 카드 (캘린더 다음으로 이동) */}
        <TodaysActionsCard events={payload.events} />
        <ConflictBanner events={payload.events} />
        <CsCriticalCard critical={payload.cs_critical ?? []} repeat={payload.cs_repeat ?? []} />

        {/* 하단: PL·통계 — 기본 접힘, 클릭해서 펼침 */}
        <details className="bg-white border border-slate-200 rounded-lg mt-6">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
            📊 채널 손익 (펼치기)
          </summary>
          <div className="p-4 border-t border-slate-200">
            <ChannelPL
              totals={channelPL.totals}
              prevTotals={channelPL.prev_totals}
              range={channelPL.range}
              channels={channelPL.channels}
              events={payload.events}
              channelsMaster={payload.channels_master}
            />
          </div>
        </details>

        <details className="bg-white border border-slate-200 rounded-lg mt-3">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
            📈 MD 손익 (펼치기)
          </summary>
          <div className="p-4 border-t border-slate-200">
            <MdPL events={payload.events} />
          </div>
        </details>

        <details className="bg-white border border-slate-200 rounded-lg mt-3">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
            💬 CS 통계 (펼치기)
          </summary>
          <div className="p-4 border-t border-slate-200">
            <CsWidget cs={payload.cs_daily ?? []} hourly={payload.cs_hourly} top={payload.cs_top} />
          </div>
        </details>

        <footer className="mt-8 text-xs text-slate-400 text-center space-y-1">
          <div>
            관리:{" "}
            <Link href="/vendors" className="text-slate-500 hover:text-slate-700 hover:underline">📦 채널 마스터</Link>
            {" · "}
            <Link href="/stats" className="text-slate-500 hover:text-slate-700 hover:underline">📈 ROI 통계</Link>
          </div>
          <div>
            데이터는 <code>data/events.json</code> 기반. 갱신:{" "}
            <code>uv run python -m crawler.run crawl &amp;&amp; uv run python -m crawler.run dump-json</code>
          </div>
        </footer>
      </div>
    </main>
  );
}
