"use client";

import { useMemo, useState } from "react";

interface ProductKb {
  category?: string;
  channel_urls?: Record<string, string>;
}

interface Props {
  products: string[];
  channels: string[];
  kb: Record<string, ProductKb>;
}

// 채널 그룹 — 시각적 구분용
const CHANNEL_GROUPS: { label: string; channels: string[]; bg: string }[] = [
  { label: "직접 운영", channels: ["자사몰", "카카오톡스토어"], bg: "bg-emerald-50" },
  { label: "오픈마켓", channels: ["스마트스토어", "쿠팡", "11번가", "지마켓", "옥션", "토스쇼핑"], bg: "bg-blue-50" },
  { label: "홈쇼핑", channels: ["NS홈쇼핑", "쇼핑엔티", "CJ온스타일", "롯데홈쇼핑", "K쇼핑", "공영홈쇼핑", "신세계홈쇼핑", "홈쇼핑모아"], bg: "bg-violet-50" },
  { label: "SNS", channels: ["인스타그램", "유튜브", "네이버블로그", "페이스북"], bg: "bg-amber-50" },
];

function groupOf(channel: string): { label: string; bg: string } | null {
  for (const g of CHANNEL_GROUPS) {
    if (g.channels.includes(channel)) return { label: g.label, bg: g.bg };
  }
  return null;
}

export default function MatrixView({ products, channels, kb }: Props) {
  const [showOnlyRegistered, setShowOnlyRegistered] = useState(false);
  const [hoverCh, setHoverCh] = useState<string | null>(null);
  const [hoverPr, setHoverPr] = useState<string | null>(null);

  // 통계
  const stats = useMemo(() => {
    let total = 0;
    let filled = 0;
    const byProduct: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    for (const p of products) {
      byProduct[p] = 0;
      for (const c of channels) {
        total++;
        const has = !!kb[p]?.channel_urls?.[c];
        if (has) {
          filled++;
          byProduct[p]++;
          byChannel[c] = (byChannel[c] || 0) + 1;
        }
      }
    }
    return { total, filled, byProduct, byChannel };
  }, [products, channels, kb]);

  const visibleChannels = showOnlyRegistered
    ? channels.filter((c) => (stats.byChannel[c] || 0) > 0)
    : channels;

  return (
    <div className="space-y-3">
      {/* 요약 + 필터 */}
      <div className="bg-white border border-slate-200 rounded p-3 flex items-center flex-wrap gap-3 text-xs">
        <div>
          <b className="text-slate-800">{products.length}</b> 상품 × <b className="text-slate-800">{visibleChannels.length}</b> 채널
          <span className="ml-2 text-slate-500">· 등록 {stats.filled}/{stats.total} ({((stats.filled / stats.total) * 100).toFixed(0)}%)</span>
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyRegistered}
            onChange={(e) => setShowOnlyRegistered(e.target.checked)}
          />
          등록된 채널만 보기
        </label>
      </div>

      {/* 채널 그룹 범례 */}
      <div className="bg-white border border-slate-200 rounded p-2 flex flex-wrap gap-2 text-[11px]">
        {CHANNEL_GROUPS.map((g) => (
          <span key={g.label} className={`px-2 py-0.5 ${g.bg} border border-slate-200 rounded font-semibold text-slate-700`}>
            {g.label} ({g.channels.length})
          </span>
        ))}
      </div>

      {/* 매트릭스 테이블 */}
      <div className="bg-white border border-slate-200 rounded overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="text-left px-3 py-2 sticky left-0 bg-slate-100 z-20 border-r border-slate-300 min-w-[140px]">
                상품 \ 채널
              </th>
              {visibleChannels.map((c) => {
                const g = groupOf(c);
                const isHover = hoverCh === c;
                return (
                  <th
                    key={c}
                    onMouseEnter={() => setHoverCh(c)}
                    onMouseLeave={() => setHoverCh(null)}
                    className={`px-1 py-2 text-center border-r border-slate-200 ${g?.bg ?? ""} ${isHover ? "bg-yellow-100" : ""}`}
                    style={{ writingMode: "vertical-rl", minWidth: "28px", maxWidth: "28px", height: "120px" }}
                  >
                    <span className="font-semibold text-slate-700 text-[11px]">
                      {c} <span className="text-slate-400">({stats.byChannel[c] || 0})</span>
                    </span>
                  </th>
                );
              })}
              <th className="px-2 py-2 text-center bg-slate-100 border-l border-slate-300 min-w-[40px]">
                <span className="text-[10px] text-slate-500">합계</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const isHoverRow = hoverPr === p;
              return (
                <tr
                  key={p}
                  onMouseEnter={() => setHoverPr(p)}
                  onMouseLeave={() => setHoverPr(null)}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${isHoverRow ? "bg-slate-50" : ""}`}
                >
                  <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-slate-200 font-semibold text-slate-800">
                    {p}
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                      {kb[p]?.category || "—"}
                    </div>
                  </td>
                  {visibleChannels.map((c) => {
                    const url = kb[p]?.channel_urls?.[c];
                    const g = groupOf(c);
                    const isHoverCol = hoverCh === c;
                    return (
                      <td
                        key={c}
                        className={`text-center p-0 border-r border-slate-100 ${
                          isHoverCol ? "bg-yellow-50" : g?.bg ? `${g.bg}/30` : ""
                        }`}
                      >
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full h-full px-1 py-2 hover:bg-emerald-100"
                            title={`${p} · ${c}\n${url}`}
                          >
                            <span className="text-emerald-700 text-sm font-bold">✓</span>
                          </a>
                        ) : (
                          <span className="block w-full h-full px-1 py-2 text-slate-300" title="미등록">
                            ·
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center bg-slate-50 border-l border-slate-300 font-bold text-slate-700">
                    {stats.byProduct[p]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-slate-400 text-center">
        ※ ✓ 클릭 → 소비자 페이지 새 탭으로. 마우스 오버 시 행/열 하이라이트.
        URL 추가·삭제는 <span className="text-blue-600">📦 상품 페이지</span> 에서.
      </div>
    </div>
  );
}
