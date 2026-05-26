"use client";

import Link from "next/link";
import { useState } from "react";

// 정산자동화웹 주요 페이지 — 사용자 자주 가는 흐름 기반.
// 정산자동화웹 코드는 별도 시스템이라 수정 안 하고, MD 에이전트 안에 iframe 으로 embed.
const TABS = [
  { key: "dashboard", label: "📊 대시보드", path: "/" },
  { key: "skus", label: "📦 SKU 마스터", path: "/skus" },
  { key: "ads", label: "💰 광고비", path: "/ads" },
  { key: "settings", label: "⚙️ 설정", path: "/settings" },
];

const SETTLE_BASE = process.env.NEXT_PUBLIC_SETTLE_BASE_URL || "http://3.37.214.243";

export default function JeongsanPage() {
  const [tab, setTab] = useState("dashboard");
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const iframeUrl = SETTLE_BASE + current.path;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* MD 에이전트 sticky 헤더 — 정산자동화웹 보면서도 언제든 MD 다른 페이지 이동 */}
      <header className="bg-white border-b px-4 py-2 flex items-center gap-2 sticky top-0 z-10">
        <Link href="/" className="text-sm font-bold text-slate-900 hover:underline">
          📅 도아 MD
        </Link>
        <div className="h-4 w-px bg-slate-300 mx-1" />
        <Link href="/" className="text-xs px-2 py-1 rounded hover:bg-slate-100 text-slate-700">캘린더</Link>
        <Link href="/events" className="text-xs px-2 py-1 rounded hover:bg-slate-100 text-slate-700">표</Link>
        <Link href="/contacts" className="text-xs px-2 py-1 rounded hover:bg-slate-100 text-slate-700">연락처</Link>
        <Link href="/simulator" className="text-xs px-2 py-1 rounded hover:bg-slate-100 text-slate-700">시뮬</Link>
        <div className="h-4 w-px bg-slate-300 mx-1" />
        <span className="text-xs text-slate-500">정산자동화웹 보기</span>

        {/* 정산자동화웹 탭 */}
        <div className="flex items-center gap-1 ml-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-2 py-1 rounded border ${
                tab === t.key
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener"
          className="ml-auto text-xs px-2 py-1 border rounded hover:bg-slate-50 text-slate-700"
          title="새 창에서 열기"
        >
          ↗ 새 창
        </a>
      </header>

      {/* iframe 전체 화면 */}
      <div className="flex-1 bg-white">
        <iframe
          key={iframeUrl}
          src={iframeUrl}
          className="w-full h-[calc(100vh-49px)] border-0"
          title={`정산자동화웹 — ${current.label}`}
        />
      </div>

      <div className="bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900 px-4 py-1.5 flex items-center gap-2">
        ℹ️ 정산자동화웹은 별도 시스템 ({SETTLE_BASE}) — MD 에이전트 안에서 보기 전용.
        로그인 안 됐으면 새 창에서 한 번 로그인 후 돌아오세요.
      </div>
    </main>
  );
}
