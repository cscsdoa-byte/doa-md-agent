"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/api";

interface SkuHit {
  id: number;
  sku_code: string | null;
  product_name: string;
  supplier: string | null;
  cost: number;
  shipping_fee: number;
}

interface ChannelPreset {
  label: string;
  rate: number;
}

const CHANNELS: ChannelPreset[] = [
  { label: "쿠팡 10.6%",       rate: 10.6 },
  { label: "네이버 2.73%",     rate: 2.73 },
  { label: "토스 8%",          rate: 8 },
  { label: "11번가 13%",       rate: 13 },
  { label: "G마켓/옥션 13%",   rate: 13 },
  { label: "NS홈쇼핑 15%",     rate: 15 },
  { label: "카카오 3.3%",      rate: 3.3 },
];

const DISCOUNT_SCENARIOS = [5, 10, 15, 20, 25, 30];

const fmtWon = (n: number) => Math.round(n).toLocaleString() + "원";
const fmtPct = (n: number) => n.toFixed(1) + "%";

export default function Simulator() {
  const params = useSearchParams();

  const [cost, setCost] = useState(8000);
  const [price, setPrice] = useState(15000);
  const [ship, setShip] = useState(2500);
  const [commission, setCommission] = useState(10.6);
  const [discount, setDiscount] = useState(10);
  const [extra, setExtra] = useState(500);
  const [activeIdx, setActiveIdx] = useState(0);

  // SKU 검색 (정산자동화웹)
  const [skuQuery, setSkuQuery] = useState("");
  const [skuHits, setSkuHits] = useState<SkuHit[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SkuHit | null>(null);

  // 행사 컨텍스트 (URL ?event=<dedup_id> 로 진입 시) — 시뮬 결과를 행사에 저장 가능
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  useEffect(() => {
    setEventId(params.get("event"));
    setEventTitle(params.get("event_title"));
  }, [params]);

  // URL 쿼리로 초기값 받기 (캘린더에서 진입 시)
  useEffect(() => {
    const num = (k: string, fallback: number) => {
      const v = params.get(k);
      if (v === null) return fallback;
      const n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    };
    setCost((c) => num("cost", c));
    setPrice((p) => num("price", p));
    setShip((s) => num("ship", s));
    setCommission((c) => num("commission", c));
    setDiscount((d) => num("discount", d));
    setExtra((e) => num("extra", e));
    // commission 이 채널 preset과 일치하면 active tab 표시
    const v = params.get("commission");
    if (v !== null) {
      const n = parseFloat(v);
      const idx = CHANNELS.findIndex((c) => Math.abs(c.rate - n) < 0.01);
      if (idx >= 0) setActiveIdx(idx);
    }
  }, [params]);

  const calc = useMemo(() => {
    const salePrice = price * (1 - discount / 100);
    const commissionAmt = salePrice * (commission / 100);
    const totalCost = cost + ship + extra;
    const profit = salePrice - commissionAmt - totalCost;
    const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
    const bep = totalCost / (1 - commission / 100);
    const maxDisc = price > 0 ? Math.max(0, (1 - bep / price) * 100) : 0;
    return { salePrice, commissionAmt, totalCost, profit, margin, bep, maxDisc };
  }, [cost, price, ship, commission, discount, extra]);

  const judge = useMemo(() => {
    if (calc.margin >= 20) {
      return {
        label: "✅ 행사 진행 추천",
        badge: "good" as const,
        tip: "<strong>마진 여유 충분!</strong> 추가 광고비 더 태워도 됩니다. 네이버 오늘끝딜이나 쿠팡 타임특가 함께 진행 고려.",
      };
    }
    if (calc.margin >= 10) {
      return {
        label: "⚠️ 진행 가능 (주의)",
        badge: "ok" as const,
        tip: "<strong>마진 빠듯합니다.</strong> 광고비 최소화하고, 할인부담을 브랜드사와 분담하는 협의 추천. 토스 추천가 확인 필수!",
      };
    }
    if (calc.margin >= 0) {
      return {
        label: "🚨 손익 위험",
        badge: "bad" as const,
        tip: `<strong>거의 남는 게 없어요.</strong> 할인율을 줄이거나 행사 패스 추천. 손익분기 판매가(${fmtWon(calc.bep)}) 기준으로 채널 MD와 재협상.`,
      };
    }
    return {
      label: "❌ 적자 — 행사 패스",
      badge: "bad" as const,
      tip: `<strong>적자 행사예요!</strong> 현재 조건으로는 팔수록 손해. 최대 할인 가능 범위(${fmtPct(calc.maxDisc)}) 안에서만 행사 가능.`,
    };
  }, [calc]);

  const scenarios = useMemo(() => {
    return DISCOUNT_SCENARIOS.map((d) => {
      const sp = price * (1 - d / 100);
      const ca = sp * (commission / 100);
      const pr = sp - ca - calc.totalCost;
      const mr = sp > 0 ? (pr / sp) * 100 : 0;
      return { d, sp, mr };
    });
  }, [price, commission, calc.totalCost]);

  function selectChannel(idx: number) {
    setActiveIdx(idx);
    setCommission(CHANNELS[idx].rate);
  }

  async function doSearch() {
    const q = skuQuery.trim();
    if (!q) {
      setSkuHits([]);
      return;
    }
    setSkuLoading(true);
    setSkuError(null);
    try {
      const r = await fetch(apiUrl(`/api/skus?q=${encodeURIComponent(q)}&limit=20`));
      const j = await r.json();
      if (!r.ok) {
        setSkuError(j.error || `HTTP ${r.status}`);
        setSkuHits([]);
      } else {
        setSkuHits(j.items || []);
      }
    } catch (e) {
      setSkuError((e as Error).message);
    } finally {
      setSkuLoading(false);
    }
  }

  function pickSku(s: SkuHit) {
    setPicked(s);
    setCost(Math.round(s.cost));
    setShip(Math.round(s.shipping_fee));
    setSkuHits([]); // 결과 닫기
  }

  async function saveToEvent() {
    if (!eventId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch(apiUrl(`/api/event/${eventId}/simulation`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price, cost, ship, commission, discount, extra }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setSaveMsg(`❌ ${j.error || "저장 실패"}`);
      } else {
        setSaveMsg(`✅ ${eventId.slice(0, 6)} 행사에 시뮬 스냅샷 저장됨`);
      }
    } catch (e) {
      setSaveMsg(`❌ ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* 행사 컨텍스트 (URL ?event=<id> 진입 시) — 시뮬 스냅샷 저장 */}
      {eventId && (
        <div className="bg-[#172554] border border-[#5c6ef8] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold text-[#a5b4fc] uppercase tracking-wider">
                📌 행사 시뮬 모드
              </div>
              <div className="text-sm text-white font-semibold mt-1">
                {eventTitle ? eventTitle : `행사 ${eventId.slice(0, 6)}`}
              </div>
              <div className="text-[11px] text-[#a5b4fc] mt-0.5">
                현재 시뮬 결과를 이 행사에 스냅샷으로 저장 → 종료 후 실 매출과 자동 비교
              </div>
            </div>
            <button
              onClick={saveToEvent}
              disabled={saving}
              className="px-4 py-2 bg-[#5c6ef8] hover:bg-[#4a5cdf] disabled:opacity-50 rounded-lg text-sm font-bold text-white whitespace-nowrap"
            >
              {saving ? "⏳ 저장 중…" : "💾 이 행사에 시뮬 저장"}
            </button>
          </div>
          {saveMsg && <div className="mt-2 text-xs text-[#a5b4fc]">{saveMsg}</div>}
        </div>
      )}

      {/* SKU 검색 (정산자동화웹) */}
      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-4 mb-4">
        <div className="text-[11px] font-semibold text-[#888] uppercase tracking-wider mb-3">
          🔍 정산자동화웹 SKU 검색 (선택)
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={skuQuery}
            onChange={(e) => setSkuQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
            placeholder="예: 밤설기, 쑥콩설기, 두쫀모…"
            className="flex-1 bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5c6ef8]"
          />
          <button
            onClick={doSearch}
            disabled={skuLoading}
            className="px-4 py-2 bg-[#5c6ef8] hover:bg-[#4a5cdf] disabled:opacity-50 rounded-lg text-sm font-semibold text-white"
          >
            {skuLoading ? "검색 중…" : "검색"}
          </button>
        </div>
        {skuError && (
          <div className="mt-2 text-xs text-[#f87171]">⚠ {skuError}</div>
        )}
        {skuHits.length > 0 && (
          <div className="mt-3 space-y-1 max-h-60 overflow-y-auto">
            {skuHits.map((s) => (
              <button
                key={s.id}
                onClick={() => pickSku(s)}
                className="w-full text-left bg-[#0f1117] hover:bg-[#5c6ef8]/10 border border-[#2a2d3a] hover:border-[#5c6ef8] rounded-lg px-3 py-2 text-xs flex items-center gap-3 transition-colors"
              >
                <span className="font-mono text-[#888]">#{s.id}</span>
                <span className="flex-1 text-white">{s.product_name}</span>
                <span className="text-[#aaa]">원가 {s.cost.toLocaleString()}원</span>
                <span className="text-[#aaa]">택배 {s.shipping_fee.toLocaleString()}원</span>
                <span className="text-[#666]">{s.supplier ?? "-"}</span>
              </button>
            ))}
          </div>
        )}
        {picked && (
          <div className="mt-3 text-xs text-[#4ade80] bg-[#4ade80]/10 px-3 py-2 rounded">
            ✓ <b>{picked.product_name}</b> 선택됨 — 원가/택배비 자동 입력 (행사가는 정상가에 직접 입력)
          </div>
        )}
      </div>

      {/* Channel tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CHANNELS.map((c, i) => (
          <button
            key={c.label}
            onClick={() => selectChannel(i)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              activeIdx === i
                ? "bg-[#5c6ef8] border-[#5c6ef8] text-white"
                : "border-[#2a2d3a] text-[#666] hover:text-white"
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setActiveIdx(-1)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            activeIdx === -1
              ? "bg-[#5c6ef8] border-[#5c6ef8] text-white"
              : "border-[#2a2d3a] text-[#666] hover:text-white"
          }`}
        >
          직접입력
        </button>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Card title="💰 원가 / 판가">
          <Field label="원가 (매입가)" unit="원" value={cost} onChange={setCost} />
          <Field label="정상 판매가" unit="원" value={price} onChange={setPrice} />
          <Field label="배송비 (원가 포함)" unit="원" value={ship} onChange={setShip} />
        </Card>
        <Card title="🏪 행사 조건">
          <Field label="채널 수수료" unit="%" value={commission} onChange={setCommission} step={0.1} />
          <Field label="행사 할인율" unit="%" value={discount} onChange={setDiscount} />
          <Field label="추가 비용 (광고비 등)" unit="원" value={extra} onChange={setExtra} />
        </Card>
      </div>

      {/* Results */}
      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-5 mb-4">
        <div className="text-[11px] font-semibold text-[#888] uppercase tracking-wider mb-4">
          📈 수익성 분석
        </div>
        <Row label="행사 판매가" value={fmtWon(calc.salePrice)} />
        <Row label="수수료 금액" value={fmtWon(calc.commissionAmt)} />
        <Row label="총 원가 (매입 + 배송 + 기타)" value={fmtWon(calc.totalCost)} />
        <div className="h-px bg-[#2a2d3a] my-3" />
        <Row
          label="건당 순이익"
          value={fmtWon(calc.profit)}
          valueClass={calc.profit > 0 ? "text-[#4ade80]" : "text-[#f87171]"}
          highlight
        />
        <Row
          label="마진율"
          value={fmtPct(calc.margin)}
          valueClass={
            calc.margin >= 15 ? "text-[#4ade80]" : calc.margin >= 5 ? "text-[#fbbf24]" : "text-[#f87171]"
          }
          highlight
        />
        <Row label="손익분기 판매가" value={fmtWon(calc.bep)} />
        <Row label="최대 할인 가능 %" value={fmtPct(calc.maxDisc)} />
        <Row
          label="수익성 판단"
          value={
            <span
              className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                judge.badge === "good"
                  ? "bg-[#4ade80]/15 text-[#4ade80]"
                  : judge.badge === "ok"
                  ? "bg-[#fbbf24]/15 text-[#fbbf24]"
                  : "bg-[#f87171]/15 text-[#f87171]"
              }`}
            >
              {judge.label}
            </span>
          }
          highlight
        />
      </div>

      {/* Scenarios */}
      <div className="text-[#888] text-[11px] font-semibold uppercase tracking-wider mb-2.5">
        🔀 할인율 시나리오 비교
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {scenarios.map((s) => {
          const selected = Math.abs(s.d - discount) < 0.5;
          const cls =
            s.mr >= 15 ? "text-[#4ade80]" : s.mr >= 5 ? "text-[#fbbf24]" : "text-[#f87171]";
          return (
            <button
              key={s.d}
              onClick={() => setDiscount(s.d)}
              className={`bg-[#1a1d27] border rounded-lg p-3.5 text-center transition-colors hover:border-[#5c6ef8] ${
                selected ? "border-[#5c6ef8] bg-[#5c6ef8]/10" : "border-[#2a2d3a]"
              }`}
            >
              <div className="text-[11px] text-[#888] font-semibold mb-1.5">할인 {s.d}%</div>
              <div className="text-lg font-bold text-white">{Math.round(s.sp).toLocaleString()}원</div>
              <div className={`text-[11px] mt-1 font-semibold ${cls}`}>{s.mr.toFixed(1)}% 마진</div>
            </button>
          );
        })}
      </div>

      {/* Tip */}
      <div
        className="bg-[#5c6ef8]/8 border border-[#5c6ef8]/20 rounded-xl p-3.5 text-xs text-[#aaa] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: judge.tip }}
      />
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-5">
      <div className="text-[11px] font-semibold text-[#888] uppercase tracking-wider mb-4">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  step,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <label className="block text-xs text-[#999] mb-1.5 font-medium">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step ?? 1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg pl-3 pr-10 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-[#5c6ef8]"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#555] font-medium">
          {unit}
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center py-2.5 border-b border-[#1e2130] last:border-b-0 ${
        highlight ? "" : ""
      }`}
    >
      <span className={`text-sm ${highlight ? "text-[#e8e8e8] font-semibold" : "text-[#888]"}`}>
        {label}
      </span>
      <span
        className={`font-bold text-white ${highlight ? "text-base" : "text-sm"} ${valueClass || ""}`}
      >
        {value}
      </span>
    </div>
  );
}
