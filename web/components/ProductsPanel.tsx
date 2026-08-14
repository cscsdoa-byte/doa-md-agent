"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

interface Issue {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
  severity?: "info" | "warn" | "critical";
}

interface ChannelData {
  url?: string;
  price?: number | null;
  rating?: number | null;
  review_count?: number | null;
  issues?: Issue[];
}

interface ProductKb {
  manual_notes?: string;
  channel_urls?: Record<string, string>; // 옛 형식 (호환)
  main_image?: string | null;
  detail_images?: string[];
  price?: number | null; // 옛 통합치
  rating?: number | null;
  review_count?: number | null;
  channels?: Record<string, ChannelData>; // 새 형식
  _price_fetched_at?: string;
  _price_source?: string;
}

interface Props {
  products: string[];
  kb: Record<string, ProductKb>;
}

// 11개 메인 채널. sources = 로고 후보 URL 리스트 (앞에서부터 시도, 실패시 다음).
// 빈 배열 또는 모두 실패시 컬러 chip 으로 fallback.
const CHANNELS: { key: string; sources: string[]; initial: string; bg: string; fg: string }[] = [
  { key: "자사몰",       sources: ["https://www.google.com/s2/favicons?domain=paldodduck.com&sz=64"], initial: "팔", bg: "bg-slate-700", fg: "text-white" },
  { key: "스마트스토어", sources: [
    "https://shopping.naver.com/favicon.ico",
    "https://www.google.com/s2/favicons?domain=naver.com&sz=64",
  ], initial: "N",  bg: "bg-[#03c75a]",     fg: "text-white" },
  { key: "쿠팡",         sources: ["https://www.google.com/s2/favicons?domain=coupang.com&sz=64"], initial: "쿠", bg: "bg-[#ee2b34]", fg: "text-white" },
  { key: "11번가",       sources: ["https://www.google.com/s2/favicons?domain=11st.co.kr&sz=64"], initial: "11", bg: "bg-[#ff0038]", fg: "text-white" },
  { key: "G마켓",        sources: ["https://www.google.com/s2/favicons?domain=gmarket.co.kr&sz=64"], initial: "G", bg: "bg-[#e51d28]", fg: "text-white" },
  { key: "옥션",         sources: ["https://www.google.com/s2/favicons?domain=auction.co.kr&sz=64"], initial: "옥", bg: "bg-[#ff7300]", fg: "text-white" },
  { key: "테무",         sources: ["https://www.google.com/s2/favicons?domain=temu.com&sz=64"], initial: "T", bg: "bg-[#fb6f1c]", fg: "text-white" },
  { key: "쇼핑엔티",     sources: [], initial: "엔", bg: "bg-[#e91e63]",     fg: "text-white" },
  { key: "NS홈쇼핑",     sources: [], initial: "NS", bg: "bg-[#0064b8]",     fg: "text-white" },
  { key: "카카오",       sources: ["https://www.google.com/s2/favicons?domain=gift.kakao.com&sz=64"], initial: "K", bg: "bg-[#fee500]", fg: "text-black" },
  { key: "토스",         sources: [
    "https://www.google.com/s2/favicons?domain=toss.im&sz=64",
    "https://static.toss.im/icons/png/4x/icon-toss-logo.png",
  ], initial: "T",  bg: "bg-[#0064ff]",     fg: "text-white" },
];

function ChannelLogo({ ch, size = 28 }: { ch: typeof CHANNELS[number]; size?: number }) {
  const [srcIdx, setSrcIdx] = useState(0);
  const src = ch.sources[srcIdx];
  if (!src) {
    // 컬러 chip — 이니셜 글자가 크고 명확하게
    return (
      <span
        style={{ width: size, height: size }}
        className={`shrink-0 rounded flex items-center justify-center font-bold ${ch.bg} ${ch.fg}`}
      >
        <span className={size >= 28 ? "text-[11px]" : "text-[10px]"}>{ch.initial}</span>
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={ch.key}
      width={size}
      height={size}
      onError={() => setSrcIdx((i) => i + 1)}
      className="shrink-0 rounded bg-white border border-slate-200 object-contain"
    />
  );
}

const CHANNEL_ALIAS: Record<string, string> = {
  "지마켓": "G마켓",
  "토스쇼핑": "토스",
  "카카오톡스토어": "카카오",
};

function pickOldUrl(urls: Record<string, string>, key: string): string {
  if (urls[key]) return urls[key];
  for (const [oldName, newName] of Object.entries(CHANNEL_ALIAS)) {
    if (newName === key && urls[oldName]) return urls[oldName];
  }
  return "";
}

// channels 새 형식 + 옛 channel_urls/price/rating 호환 머지
function getChannelData(item: ProductKb | undefined, ch: string): ChannelData {
  const cd = item?.channels?.[ch] ?? {};
  return {
    url: cd.url ?? pickOldUrl(item?.channel_urls ?? {}, ch),
    price: cd.price ?? null,
    rating: cd.rating ?? null,
    review_count: cd.review_count ?? null,
    issues: cd.issues ?? [],
  };
}

// 상품 카드 요약값 — 11번가 우선, 없으면 첫 등록 채널.
// 이슈는 '오늘 일자'만 집계 + 어떤 채널에서 났는지.
function summarizeProduct(item: ProductKb | undefined): {
  price: number | null; rating: number | null; reviewCount: number | null;
  todayIssueCount: number;
  todayIssueChannels: string[];
  todayMaxSeverity: "info" | "warn" | "critical" | null;
  totalIssueCount: number;
} {
  if (!item) return { price: null, rating: null, reviewCount: null, todayIssueCount: 0, todayIssueChannels: [], todayMaxSeverity: null, totalIssueCount: 0 };
  let price: number | null = null;
  let ratingSum = 0, ratingN = 0;
  let reviewCount = 0;
  const today = todayStr();
  const todaySet: { channel: string; severity?: string }[] = [];
  let totalIssueCount = 0;
  // 11번가 가격 우선
  for (const c of CHANNELS) {
    const cd = getChannelData(item, c.key);
    if (cd.price !== null && cd.price !== undefined) {
      if (c.key === "11번가" || price === null) price = cd.price;
    }
    if (cd.rating !== null && cd.rating !== undefined) {
      ratingSum += cd.rating; ratingN++;
    }
    if (cd.review_count) reviewCount += cd.review_count;
    if (cd.issues) {
      totalIssueCount += cd.issues.length;
      for (const i of cd.issues) {
        if (i.date === today) todaySet.push({ channel: c.key, severity: i.severity });
      }
    }
  }
  if (price === null && item.price !== undefined && item.price !== null) price = item.price;
  const rating = ratingN > 0 ? Math.round((ratingSum / ratingN) * 10) / 10 : (item.rating ?? null);
  if (reviewCount === 0 && item.review_count) reviewCount = item.review_count;

  const todayIssueChannels = Array.from(new Set(todaySet.map((x) => x.channel)));
  const sevs = todaySet.map((x) => x.severity);
  const todayMaxSeverity: "info" | "warn" | "critical" | null =
    sevs.includes("critical") ? "critical" :
    sevs.includes("warn") ? "warn" :
    todaySet.length > 0 ? "info" : null;

  return {
    price, rating, reviewCount: reviewCount || null,
    todayIssueCount: todaySet.length,
    todayIssueChannels,
    todayMaxSeverity,
    totalIssueCount,
  };
}

function fmtKRW(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
}

function StarRating({ value, size = "xs" }: { value: number | null | undefined; size?: "xs" | "sm" }) {
  if (value === null || value === undefined) return <span className="text-slate-300">★★★★★</span>;
  const full = Math.round(value);
  const cls = size === "sm" ? "text-sm" : "";
  return (
    <span className={`text-amber-500 ${cls}`}>
      {"★".repeat(full)}<span className="text-slate-300">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function ProductsPanel({ products: initialProducts, kb: initialKb }: Props) {
  const [kb, setKb] = useState<Record<string, ProductKb>>(initialKb);
  const [extraProducts, setExtraProducts] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);

  const productList = useMemo(() => {
    const kbKeys = Object.keys(kb);
    const seen = new Set<string>();
    const out: string[] = [];
    const source = kbKeys.length > 0 ? [...kbKeys, ...extraProducts] : [...initialProducts, ...extraProducts];
    for (const p of source) {
      if (!seen.has(p)) { seen.add(p); out.push(p); }
    }
    return out;
  }, [initialProducts, kb, extraProducts]);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 4000); }

  async function refreshKb() {
    try {
      const r = await fetch(apiUrl("/api/products"));
      const j = await r.json();
      if (j.kb) setKb(j.kb);
    } catch {/**/}
  }

  async function patchKb(name: string, payload: Record<string, unknown>, okMsg: string) {
    setBusy(name);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(name)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(`❌ ${j.error || "실패"}`); return false; }
      flash(`✓ ${okMsg}`);
      await refreshKb();
      return true;
    } catch (e) { flash(`❌ ${(e as Error).message}`); return false; }
    finally { setBusy(null); }
  }

  // 채널 1개 데이터 업데이트 — merge 후 channels 통째로 PATCH
  async function patchChannel(name: string, ch: string, partial: Partial<ChannelData>, okMsg: string) {
    const item = kb[name] ?? {};
    const channels = { ...(item.channels ?? {}) };
    // 기존 channel_urls 도 머지 (마이그레이션)
    if (!channels[ch]) {
      channels[ch] = { url: pickOldUrl(item.channel_urls ?? {}, ch) };
    }
    channels[ch] = { ...channels[ch], ...partial };
    await patchKb(name, { channels }, okMsg);
  }

  async function createProduct() {
    const name = prompt("새 상품명을 입력하세요 (예: 쑥인절미)");
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    setBusy("__new__");
    try {
      const r = await fetch(apiUrl(`/api/products?action=create&name=${encodeURIComponent(trimmed)}`), { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { flash(`❌ ${j.error}`); return; }
      flash(`✓ '${trimmed}' 추가됨`);
      setExtraProducts((p) => [...p, trimmed]);
      await refreshKb();
      setSelected(trimmed);
    } finally { setBusy(null); }
  }

  async function renameProduct(oldName: string) {
    const newName = prompt(`'${oldName}' → 새 이름?`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    setBusy(oldName);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(oldName)}&rename=${encodeURIComponent(trimmed)}`), {
        method: "PATCH", headers: { "content-type": "application/json" }, body: "{}",
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(`❌ ${j.error}`); return; }
      flash(`✓ '${oldName}' → '${trimmed}'`);
      if (selected === oldName) setSelected(trimmed);
      await refreshKb();
    } finally { setBusy(null); }
  }

  async function deleteProduct(name: string) {
    if (!confirm(`'${name}' 상품을 카탈로그에서 삭제할까요?\n(이미지·메모·채널 링크 모두 사라짐)`)) return;
    setBusy(name);
    try {
      const r = await fetch(apiUrl(`/api/products?product=${encodeURIComponent(name)}`), { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || j.error) { flash(`❌ ${j.error}`); return; }
      flash(`✓ '${name}' 삭제됨`);
      if (selected === name) setSelected(null);
      setExtraProducts((p) => p.filter((x) => x !== name));
      await refreshKb();
    } finally { setBusy(null); }
  }

  async function uploadFile(name: string, file: File, kind: "main" | "detail") {
    setBusy(name);
    flash("업로드 중…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(apiUrl(`/api/products/upload?product=${encodeURIComponent(name)}`), {
        method: "POST", body: fd,
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(`❌ 업로드 실패: ${j.error}`); return; }
      const url = j.url as string;
      if (kind === "main") {
        await patchKb(name, { main_image: url }, "메인 이미지 업로드");
      } else {
        const detailImages = kb[name]?.detail_images ?? [];
        await patchKb(name, { detail_images: [...detailImages, url] }, "상세 이미지 추가");
      }
    } catch (e) { flash(`❌ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  const sel: ProductKb = (selected && kb[selected]) ? kb[selected] : {};

  // 일자별 이슈 타임라인 (선택된 상품) — 모든 채널 이슈 합쳐서 날짜 역순
  const issueTimeline = useMemo(() => {
    if (!selected) return [];
    const item = kb[selected];
    const rows: ({ channel: string } & Issue)[] = [];
    for (const c of CHANNELS) {
      const cd = getChannelData(item, c.key);
      for (const i of cd.issues ?? []) rows.push({ channel: c.key, ...i });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [selected, kb]);

  return (
    <div className="space-y-4">
      {msg && (
        <div className="bg-slate-100 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-700">{msg}</div>
      )}

      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-slate-700">상품 ({productList.length})</div>
        <button
          onClick={createProduct}
          disabled={busy === "__new__"}
          className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 font-semibold"
        >+ 새 상품</button>
      </div>

      {/* 카드 그리드 — 선택되면 좌측 그리드 좁아지고 우측에 패널 */}
      <div className={`grid gap-3 ${selected ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"}`}>
        {productList.map((p) => {
          const item = kb[p];
          const s = summarizeProduct(item);
          const img = item?.main_image;
          const isSel = selected === p;
          return (
            <div
              key={p}
              className={`group relative bg-white border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                isSel ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200 hover:border-slate-400"
              }`}
              onClick={() => setSelected(isSel ? null : p)}
            >
              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                {img ? <img src={img} alt={p} className="w-full h-full object-cover" />
                     : <span className="text-slate-300 text-3xl">🖼</span>}
              </div>
              <div className="p-2">
                <div className="text-xs font-semibold text-slate-900 truncate">{p}</div>
                <div className="text-xs text-slate-700 font-bold mt-0.5">{fmtKRW(s.price)}</div>
                <div className="text-[10px] flex items-center gap-1 mt-0.5">
                  <StarRating value={s.rating} />
                  {s.reviewCount && <span className="text-slate-500">({s.reviewCount})</span>}
                </div>
                {s.todayIssueCount > 0 ? (
                  <div className={`text-[10px] mt-0.5 leading-tight ${
                    s.todayMaxSeverity === "critical" ? "text-rose-700 font-semibold" :
                    s.todayMaxSeverity === "warn" ? "text-amber-600" :
                    "text-slate-600"
                  }`}>
                    <div>
                      {s.todayMaxSeverity === "critical" ? "🔴" : s.todayMaxSeverity === "warn" ? "⚠" : "ℹ"} 오늘 {s.todayIssueCount}건
                    </div>
                    <div className="text-[10px] text-slate-500 truncate" title={s.todayIssueChannels.join(", ")}>
                      {s.todayIssueChannels.length <= 3
                        ? s.todayIssueChannels.join(", ")
                        : `${s.todayIssueChannels.slice(0, 2).join(", ")} 외 ${s.todayIssueChannels.length - 2}곳`}
                    </div>
                  </div>
                ) : s.totalIssueCount > 0 ? (
                  <div className="text-[10px] text-slate-400 mt-0.5">과거 이슈 {s.totalIssueCount}건</div>
                ) : null}
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); renameProduct(p); }}
                  className="px-1.5 py-0.5 text-[10px] bg-slate-800/80 text-white rounded hover:bg-slate-700">✎</button>
                <button onClick={(e) => { e.stopPropagation(); deleteProduct(p); }}
                  className="px-1.5 py-0.5 text-[10px] bg-rose-600/80 text-white rounded hover:bg-rose-700">×</button>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <SidePanel
          name={selected}
          item={sel}
          onClose={() => setSelected(null)}
          onRename={() => renameProduct(selected)}
          onDelete={() => deleteProduct(selected)}
          busy={busy === selected}
          onUploadMain={(f) => uploadFile(selected, f, "main")}
          onUploadDetail={(f) => uploadFile(selected, f, "detail")}
          onSetMainUrl={(url) => patchKb(selected, { main_image: url }, "메인 이미지 URL")}
          onRemoveMain={() => patchKb(selected, { main_image: null }, "메인 이미지 제거")}
          onAddDetailUrl={(url) => patchKb(selected, { detail_images: [...(sel.detail_images ?? []), url] }, "상세 이미지 URL 추가")}
          onRemoveDetail={(idx) => patchKb(selected, { detail_images: (sel.detail_images ?? []).filter((_, i) => i !== idx) }, "상세 이미지 삭제")}
          onSaveNote={(n) => patchKb(selected, { manual_notes: n }, "메모 저장")}
          onPatchChannel={(ch, partial, okMsg) => patchChannel(selected, ch, partial, okMsg)}
          timeline={issueTimeline}
          showAllIssues={showAllIssues}
          onToggleShowAll={() => setShowAllIssues((p) => !p)}
        />
      )}

      <div className="text-[10px] text-slate-400 text-center pt-2">
        ※ 모든 변경사항은 즉시 저장됩니다. 카드 클릭 → 옆 패널 열림. 채널 행 클릭 → 가격·평점·이슈 펼침.
      </div>
    </div>
  );
}


// ───────────────────────── 사이드 패널 ─────────────────────────

function SidePanel({
  name, item, onClose, onRename, onDelete, busy, onUploadMain, onUploadDetail, onSetMainUrl, onRemoveMain,
  onAddDetailUrl, onRemoveDetail, onSaveNote, onPatchChannel, timeline, showAllIssues, onToggleShowAll,
}: {
  name: string;
  item: ProductKb;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  busy: boolean;
  onUploadMain: (f: File) => void;
  onUploadDetail: (f: File) => void;
  onSetMainUrl: (url: string) => void;
  onRemoveMain: () => void;
  onAddDetailUrl: (url: string) => void;
  onRemoveDetail: (idx: number) => void;
  onSaveNote: (n: string) => void;
  onPatchChannel: (ch: string, partial: Partial<ChannelData>, okMsg: string) => void;
  timeline: ({ channel: string } & Issue)[];
  showAllIssues: boolean;
  onToggleShowAll: () => void;
}) {
  const [tab, setTab] = useState<"channels" | "timeline" | "images" | "memo">("channels");
  const mainFileRef = useRef<HTMLInputElement>(null);
  const detailFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 xl:w-2/5 bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        {item.main_image && (
          <img src={item.main_image} alt={name} className="w-12 h-12 rounded object-cover border" />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-slate-900 truncate">{name}</h2>
          <div className="text-[10px] text-slate-500">채널별 가격·평점·이슈 관리</div>
        </div>
        <button
          onClick={onRename}
          disabled={busy}
          className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded disabled:opacity-30"
          title="상품명 변경"
        >✎ 이름</button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="text-xs px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded disabled:opacity-30 font-semibold"
          title="상품 삭제"
        >× 삭제</button>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none ml-1" title="패널 닫기">×</button>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-slate-200 bg-white">
        {[
          { key: "channels", label: "🔗 채널" },
          { key: "timeline", label: `⚠️ 이슈 (${timeline.length})` },
          { key: "images",   label: "🖼 이미지" },
          { key: "memo",     label: "📝 메모" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 px-2 py-2 text-xs font-semibold transition ${
              tab === t.key ? "border-b-2 border-emerald-600 text-emerald-700 bg-emerald-50" : "text-slate-500 hover:bg-slate-50"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "channels" && (
          <div className="space-y-2">
            {CHANNELS.map((c) => (
              <ChannelCard
                key={c.key}
                channelMeta={c}
                data={getChannelData(item, c.key)}
                busy={busy}
                onSave={(partial, okMsg) => onPatchChannel(c.key, partial, okMsg)}
              />
            ))}
          </div>
        )}

        {tab === "timeline" && (
          <IssueTimeline
            timeline={timeline}
            showAll={showAllIssues}
            onToggle={onToggleShowAll}
            onDelete={(channel, issueId) => {
              const cd = getChannelData(item, channel);
              const next = (cd.issues ?? []).filter((i) => i.id !== issueId);
              onPatchChannel(channel, { issues: next }, "이슈 삭제");
            }}
          />
        )}

        {tab === "images" && (
          <ImageTab
            productName={name}
            mainImage={item.main_image ?? null}
            detailImages={item.detail_images ?? []}
            busy={busy}
            mainFileRef={mainFileRef}
            detailFileRef={detailFileRef}
            onUploadMain={onUploadMain}
            onUploadDetail={onUploadDetail}
            onSetMainUrl={onSetMainUrl}
            onRemoveMain={onRemoveMain}
            onAddDetailUrl={onAddDetailUrl}
            onRemoveDetail={onRemoveDetail}
          />
        )}

        {tab === "memo" && (
          <NoteTab note={item.manual_notes ?? ""} busy={busy} onSave={onSaveNote} />
        )}
      </div>
    </div>
  );
}


// ───────────────────────── 채널 카드 (펼치기) ─────────────────────────

function ChannelCard({
  channelMeta, data, busy, onSave,
}: {
  channelMeta: typeof CHANNELS[number];
  data: ChannelData;
  busy: boolean;
  onSave: (partial: Partial<ChannelData>, okMsg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(data.url ?? "");
  const [price, setPrice] = useState(data.price?.toString() ?? "");
  const [rating, setRating] = useState(data.rating?.toString() ?? "");
  const [reviewCount, setReviewCount] = useState(data.review_count?.toString() ?? "");
  const [newIssueDate, setNewIssueDate] = useState(todayStr());
  const [newIssueText, setNewIssueText] = useState("");
  const [newIssueSev, setNewIssueSev] = useState<"info" | "warn" | "critical">("info");

  useEffect(() => {
    setUrl(data.url ?? "");
    setPrice(data.price?.toString() ?? "");
    setRating(data.rating?.toString() ?? "");
    setReviewCount(data.review_count?.toString() ?? "");
  }, [data.url, data.price, data.rating, data.review_count]);

  const issues = data.issues ?? [];
  const hasData = !!(data.url || data.price || data.rating || issues.length);

  const hasUrl = !!data.url;
  return (
    <div className={`bg-white border rounded-lg overflow-hidden ${hasData ? "border-slate-300" : "border-slate-200"}`}>
      <div className="flex items-center gap-2 px-2 py-2 hover:bg-slate-50">
        {/* 로고 + 이름 클릭 → 외부 새창 (URL 있을 때만, 없으면 펼치기) */}
        {hasUrl ? (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 shrink-0 hover:bg-blue-50 rounded px-1 py-0.5"
            title={`${channelMeta.key} 상품 페이지 새 탭으로 열기\n${data.url}`}
          >
            <ChannelLogo ch={channelMeta} size={28} />
            <span className="font-semibold text-sm text-blue-700 w-16 truncate">{channelMeta.key}</span>
          </a>
        ) : (
          <button
            onClick={() => setOpen((p) => !p)}
            className="flex items-center gap-2 shrink-0"
            title="URL 등록 안 됨 — 펼쳐서 추가"
          >
            <ChannelLogo ch={channelMeta} size={28} />
            <span className="font-semibold text-sm text-slate-400 w-16 truncate">{channelMeta.key}</span>
          </button>
        )}
        {/* 가운데 요약 + 우측 ▼ 클릭 → 펼치기/접기 */}
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          title={open ? "접기" : "가격·평점·이슈 펼치기"}
        >
          <span className="text-xs text-slate-600 truncate flex-1">
            {data.price ? <span className="font-bold text-slate-900">{fmtKRW(data.price)}</span> : <span className="text-slate-400">가격 없음</span>}
            {data.rating !== null && data.rating !== undefined && <span className="ml-2">★ {data.rating}</span>}
            {data.review_count ? <span className="ml-1 text-slate-500">({data.review_count})</span> : null}
            {issues.length > 0 && <span className="ml-2 text-amber-600">⚠ {issues.length}</span>}
          </span>
          <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {open && (
        <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 space-y-2 text-xs">
          {/* URL */}
          <div>
            <label className="text-[10px] font-bold text-slate-600">상품 페이지 URL</label>
            <div className="flex gap-1 mt-1">
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..." className="flex-1 border border-slate-300 rounded px-1.5 py-1 min-w-0" />
              <button
                onClick={() => onSave({ url: url.trim() || undefined }, `${channelMeta.key} URL 저장`)}
                disabled={busy}
                className="text-xs px-2 py-1 bg-emerald-600 text-white rounded disabled:opacity-30"
              >저장</button>
            </div>
            {data.url && (
              <div className="mt-1.5 px-2 py-1.5 bg-white border border-slate-200 rounded flex items-center gap-1.5">
                <span className="flex-1 text-[11px] text-slate-700 truncate" title={data.url}>{data.url}</span>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(data.url!); }
                    catch { /* clipboard 미지원 시 무시 */ }
                  }}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                  title="URL 복사"
                >📋 복사</button>
              </div>
            )}
            <div className="mt-0.5 text-[10px] text-slate-400">
              ※ 채널 로고나 이름을 클릭하면 새 탭에서 상품 페이지가 열립니다.
            </div>
          </div>

          {/* 가격 / 평점 / 리뷰수 */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[10px] font-bold text-slate-600">가격 (₩)</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="13500" className="w-full border border-slate-300 rounded px-1.5 py-1 mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600">평점 (0~5)</label>
              <input type="number" step="0.1" min="0" max="5" value={rating} onChange={(e) => setRating(e.target.value)}
                placeholder="4.8" className="w-full border border-slate-300 rounded px-1.5 py-1 mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600">리뷰수</label>
              <input type="number" min="0" value={reviewCount} onChange={(e) => setReviewCount(e.target.value)}
                placeholder="124" className="w-full border border-slate-300 rounded px-1.5 py-1 mt-1" />
            </div>
          </div>
          <button
            onClick={() => onSave({
              price: price ? parseInt(price, 10) : null,
              rating: rating ? parseFloat(rating) : null,
              review_count: reviewCount ? parseInt(reviewCount, 10) : null,
            }, `${channelMeta.key} 가격·평점 저장`)}
            disabled={busy}
            className="w-full text-xs px-2 py-1 bg-slate-700 text-white rounded disabled:opacity-30"
          >가격·평점 저장</button>

          {/* 이슈 */}
          <div className="pt-2 border-t border-slate-200">
            <div className="text-[10px] font-bold text-slate-600 mb-1">⚠ 이슈 (일자별)</div>
            {issues.length > 0 && (
              <div className="space-y-1 mb-2">
                {issues.slice().sort((a, b) => b.date.localeCompare(a.date)).map((i) => (
                  <div key={i.id} className={`flex items-start gap-1.5 px-2 py-1 rounded ${
                    i.severity === "critical" ? "bg-rose-50 border border-rose-200" :
                    i.severity === "warn" ? "bg-amber-50 border border-amber-200" :
                    "bg-slate-100 border border-slate-200"
                  }`}>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{i.date.slice(5)}</span>
                    <span className="flex-1 text-slate-800">{i.text}</span>
                    <button
                      onClick={() => onSave({ issues: issues.filter((x) => x.id !== i.id) }, "이슈 삭제")}
                      disabled={busy}
                      className="text-slate-400 hover:text-rose-600 text-xs"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-[auto_1fr_auto] gap-1">
              <input type="date" value={newIssueDate} onChange={(e) => setNewIssueDate(e.target.value)}
                className="text-[11px] border border-slate-300 rounded px-1 py-1 w-32" />
              <input value={newIssueText} onChange={(e) => setNewIssueText(e.target.value)}
                placeholder="이슈 내용 (예: 재고부족, 가격 변동, MD 메일)"
                className="text-[11px] border border-slate-300 rounded px-1.5 py-1 min-w-0" />
              <select value={newIssueSev} onChange={(e) => setNewIssueSev(e.target.value as typeof newIssueSev)}
                className="text-[11px] border border-slate-300 rounded px-1 py-1">
                <option value="info">정보</option>
                <option value="warn">경고</option>
                <option value="critical">긴급</option>
              </select>
            </div>
            <button
              onClick={() => {
                if (!newIssueText.trim()) return;
                onSave({
                  issues: [...issues, { id: uid(), date: newIssueDate, text: newIssueText.trim(), severity: newIssueSev }]
                }, `${channelMeta.key} 이슈 추가`);
                setNewIssueText("");
              }}
              disabled={busy || !newIssueText.trim()}
              className="w-full mt-1 text-[11px] px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-30"
            >+ 이슈 추가</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ───────────────────────── 일자별 이슈 타임라인 ─────────────────────────

function IssueTimeline({
  timeline, showAll, onToggle, onDelete,
}: {
  timeline: ({ channel: string } & Issue)[];
  showAll: boolean;
  onToggle: () => void;
  onDelete: (channel: string, issueId: string) => void;
}) {
  // 날짜별 그룹
  const grouped = useMemo(() => {
    const m = new Map<string, ({ channel: string } & Issue)[]>();
    for (const r of timeline) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [timeline]);

  if (timeline.length === 0) {
    return (
      <div className="text-center text-xs text-slate-400 py-12">
        등록된 이슈 없음
        <div className="text-[10px] mt-2">채널 탭에서 각 채널 펼친 후 이슈를 추가하세요.</div>
      </div>
    );
  }

  const visible = showAll ? grouped : grouped.slice(0, 5);

  return (
    <div className="space-y-3">
      {visible.map(([date, items]) => (
        <div key={date}>
          <div className="text-xs font-bold text-slate-700 sticky top-0 bg-white py-1">
            {date} <span className="text-slate-400 font-normal">({items.length}건)</span>
          </div>
          <div className="space-y-1 mt-1">
            {items.map((i) => {
              const c = CHANNELS.find((ch) => ch.key === i.channel);
              return (
                <div key={i.id} className={`flex items-start gap-2 px-2 py-1.5 rounded ${
                  i.severity === "critical" ? "bg-rose-50 border border-rose-200" :
                  i.severity === "warn" ? "bg-amber-50 border border-amber-200" :
                  "bg-slate-50 border border-slate-200"
                }`}>
                  {c && <ChannelLogo ch={c} size={24} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-slate-500">{i.channel}</div>
                    <div className="text-xs text-slate-800">{i.text}</div>
                  </div>
                  <button onClick={() => onDelete(i.channel, i.id)}
                    className="text-slate-400 hover:text-rose-600 text-xs">×</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {grouped.length > 5 && (
        <button onClick={onToggle}
          className="w-full text-xs text-slate-500 hover:text-slate-800 py-2 border border-slate-200 rounded">
          {showAll ? "▲ 최근 5일만" : `▼ 전체 (${grouped.length}일) 보기`}
        </button>
      )}
    </div>
  );
}


// ───────────────────────── 이미지 탭 ─────────────────────────

function ImageTab({
  productName, mainImage, detailImages, busy, mainFileRef, detailFileRef,
  onUploadMain, onUploadDetail, onSetMainUrl, onRemoveMain, onAddDetailUrl, onRemoveDetail,
}: {
  productName: string;
  mainImage: string | null;
  detailImages: string[];
  busy: boolean;
  mainFileRef: React.RefObject<HTMLInputElement | null>;
  detailFileRef: React.RefObject<HTMLInputElement | null>;
  onUploadMain: (f: File) => void;
  onUploadDetail: (f: File) => void;
  onSetMainUrl: (url: string) => void;
  onRemoveMain: () => void;
  onAddDetailUrl: (url: string) => void;
  onRemoveDetail: (idx: number) => void;
}) {
  const [mainUrl, setMainUrl] = useState("");
  const [detailUrl, setDetailUrl] = useState("");
  return (
    <div className="space-y-4">
      {/* 메인 */}
      <div>
        <div className="text-xs font-bold text-slate-700 mb-1">🖼 메인 이미지</div>
        {mainImage ? (
          <div className="relative group inline-block">
            <img src={mainImage} alt={productName} className="w-48 h-48 object-cover rounded border" />
            <button onClick={onRemoveMain} disabled={busy}
              className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] bg-rose-600 text-white rounded opacity-0 group-hover:opacity-100">× 제거</button>
          </div>
        ) : (
          <div className="w-48 h-48 rounded border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
            <span className="text-2xl">🖼</span><span>메인 이미지 없음</span>
          </div>
        )}
        <div className="mt-2 space-y-1 w-48">
          <button onClick={() => mainFileRef.current?.click()} disabled={busy}
            className="w-full text-xs px-2 py-1.5 bg-emerald-600 text-white rounded font-semibold disabled:opacity-50">📁 파일 업로드</button>
          <input ref={mainFileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadMain(f); e.target.value = ""; }} />
          <div className="flex gap-1">
            <input type="url" value={mainUrl} onChange={(e) => setMainUrl(e.target.value)}
              placeholder="또는 URL" className="flex-1 text-xs border rounded px-1.5 py-1 min-w-0" />
            <button onClick={() => { if (mainUrl.trim()) { onSetMainUrl(mainUrl.trim()); setMainUrl(""); } }}
              disabled={!mainUrl.trim() || busy}
              className="text-xs px-2 py-1 bg-slate-700 text-white rounded disabled:opacity-30">OK</button>
          </div>
        </div>
      </div>

      {/* 상세 갤러리 */}
      <div>
        <div className="text-xs font-bold text-slate-700 mb-1">🖼 상세 이미지 ({detailImages.length}장)</div>
        <div className="grid grid-cols-3 gap-2">
          {detailImages.map((url, i) => (
            <div key={i} className="relative group">
              <img src={url} alt={`detail ${i + 1}`} className="w-full aspect-square object-cover rounded border" />
              <button onClick={() => onRemoveDetail(i)} disabled={busy}
                className="absolute top-0.5 right-0.5 px-1 py-0 text-[10px] bg-rose-600 text-white rounded opacity-0 group-hover:opacity-100">×</button>
              <a href={url} target="_blank" rel="noreferrer"
                className="absolute bottom-0.5 left-0.5 px-1 py-0 text-[10px] bg-slate-800/80 text-white rounded opacity-0 group-hover:opacity-100">열기</a>
            </div>
          ))}
          <button onClick={() => detailFileRef.current?.click()} disabled={busy}
            className="w-full aspect-square rounded border-2 border-dashed border-slate-300 text-slate-400 hover:border-emerald-500 hover:text-emerald-600 flex flex-col items-center justify-center text-xs gap-1">
            <span className="text-xl">📁</span><span>업로드</span>
          </button>
          <input ref={detailFileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadDetail(f); e.target.value = ""; }} />
        </div>
        <div className="flex gap-1 mt-2">
          <input type="url" value={detailUrl} onChange={(e) => setDetailUrl(e.target.value)}
            placeholder="또는 URL 붙여넣기" className="flex-1 text-xs border rounded px-1.5 py-1" />
          <button onClick={() => { const u = detailUrl.trim(); if (u) { onAddDetailUrl(u); setDetailUrl(""); } }}
            disabled={!detailUrl.trim() || busy}
            className="text-xs px-2 py-1 bg-slate-700 text-white rounded disabled:opacity-30">+ 추가</button>
        </div>
      </div>
    </div>
  );
}


// ───────────────────────── 메모 탭 ─────────────────────────

function NoteTab({ note, busy, onSave }: { note: string; busy: boolean; onSave: (n: string) => void }) {
  const [draft, setDraft] = useState(note);
  useEffect(() => { setDraft(note); }, [note]);
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">알레르기·원재료·운영 메모 등. CS 챗봇 컨텍스트에 반영됩니다.</div>
      <textarea
        value={draft} onChange={(e) => setDraft(e.target.value)}
        placeholder="예: 두쫀모 알레르기 — 밀, 우유, 견과류(피스타치오)"
        className="w-full text-xs border border-slate-300 rounded p-2 h-48 resize-none focus:outline-none focus:border-slate-500"
      />
      <button onClick={() => onSave(draft)} disabled={busy}
        className="w-full text-sm px-3 py-2 bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 disabled:opacity-50">저장</button>
    </div>
  );
}
