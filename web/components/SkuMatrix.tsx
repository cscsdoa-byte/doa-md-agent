"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelMaster } from "@/lib/data";
import { apiUrl } from "@/lib/api";
import { themeOf } from "@/lib/channelTheme";

export interface SkuLite {
  id: number;
  product_name: string;
  cost: number;
  sale_price: number;
}

interface Props {
  skus: SkuLite[];
  channels: ChannelMaster[];
}

type Status = "entered" | "reviewing" | "blocked" | "none";

const STATUS_SYMBOL: Record<Status, { icon: string; bg: string; label: string }> = {
  entered:   { icon: "✓",  bg: "bg-emerald-500 text-white",     label: "입점" },
  reviewing: { icon: "⏳", bg: "bg-amber-400 text-amber-900",    label: "검토중" },
  blocked:   { icon: "✕",  bg: "bg-rose-500 text-white",         label: "불가" },
  none:      { icon: "·",  bg: "bg-slate-100 text-slate-400",    label: "미입점" },
};

const NEXT_STATUS: Record<Status, Status> = {
  none: "entered",
  entered: "reviewing",
  reviewing: "blocked",
  blocked: "none",
};

interface MatrixCell {
  status?: Status;
  entry_date?: string;
  note?: string;
}

function parseMatrix(json: string | null): Record<string, MatrixCell> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, MatrixCell>;
  } catch {
    return {};
  }
}

export default function SkuMatrix({ skus, channels }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const salesChannels = channels.filter((c) => c.is_sales);

  // settle_name → matrix (sku_id → cell)
  const matrixByChannel = useMemo(() => {
    const m: Record<string, Record<string, MatrixCell>> = {};
    for (const c of salesChannels) {
      m[c.settle_name] = parseMatrix(c.sku_matrix_json);
    }
    return m;
  }, [salesChannels]);

  const filteredSkus = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = skus;
    if (q) list = list.filter((s) => s.product_name.toLowerCase().includes(q));
    if (hideEmpty) {
      list = list.filter((s) => {
        for (const c of salesChannels) {
          const cell = matrixByChannel[c.settle_name][String(s.id)];
          if (cell?.status && cell.status !== "none") return true;
        }
        return false;
      });
    }
    return list;
  }, [skus, search, hideEmpty, salesChannels, matrixByChannel]);

  async function cycleCell(settleName: string, skuId: number, current: Status) {
    const next = NEXT_STATUS[current];
    const key = `${settleName}-${skuId}`;
    setBusy(key);
    try {
      const r = await fetch(apiUrl("/api/sku-matrix"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settle_name: settleName, sku_id: skuId, status: next }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`실패: ${j?.error || r.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // 채널별 입점 카운트 — 표 헤더 보조 정보
  const enteredCountByChannel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of salesChannels) {
      let n = 0;
      for (const cell of Object.values(matrixByChannel[c.settle_name])) {
        if (cell.status === "entered") n++;
      }
      m[c.settle_name] = n;
    }
    return m;
  }, [salesChannels, matrixByChannel]);

  return (
    <div className="space-y-3">
      <div className="bg-white border rounded p-3 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="text"
          placeholder="SKU 이름 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-2 py-1 border rounded text-sm w-56"
        />
        <label className="flex items-center gap-1 text-xs text-slate-700">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          입점 1개 이상인 SKU만
        </label>
        <div className="ml-auto text-xs text-slate-600">
          전체 SKU <b>{skus.length}</b>개 · 표시 <b>{filteredSkus.length}</b>개
        </div>
      </div>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="text-xs">
          <thead className="bg-slate-50 border-b sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left sticky left-0 bg-slate-50 z-20 w-64">SKU</th>
              {salesChannels.map((c) => {
                const th = c.yaml_key ? themeOf(c.yaml_key) : null;
                return (
                  <th key={c.settle_name} className="px-2 py-2 text-center min-w-[60px]">
                    <div className="flex flex-col items-center gap-0.5">
                      {th && <span className={`font-mono font-extrabold ${th.bold}`}>{th.abbr}</span>}
                      <span className="text-[10px] whitespace-nowrap">{c.display_name}</span>
                      <span className="text-[9px] text-emerald-700">✓ {enteredCountByChannel[c.settle_name] || 0}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredSkus.length === 0 ? (
              <tr>
                <td colSpan={salesChannels.length + 1} className="text-center text-slate-400 py-6">
                  표시할 SKU 없음
                </td>
              </tr>
            ) : (
              filteredSkus.map((s) => (
                <tr key={s.id} className="border-b hover:bg-slate-50">
                  <td className="px-2 py-1 text-xs sticky left-0 bg-white z-10 w-64">
                    <div className="font-medium truncate" title={s.product_name}>{s.product_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">#{s.id}</div>
                  </td>
                  {salesChannels.map((c) => {
                    const cell = matrixByChannel[c.settle_name][String(s.id)];
                    const status: Status = cell?.status ?? "none";
                    const sym = STATUS_SYMBOL[status];
                    const key = `${c.settle_name}-${s.id}`;
                    const isBusy = busy === key;
                    return (
                      <td key={c.settle_name} className="px-1 py-1 text-center">
                        <button
                          onClick={() => cycleCell(c.settle_name, s.id, status)}
                          disabled={isBusy}
                          title={cell?.note ? `${sym.label} — ${cell.note}` : sym.label}
                          className={`w-7 h-7 rounded text-sm font-bold ${sym.bg} hover:opacity-80 disabled:opacity-50`}
                        >
                          {isBusy ? "⏳" : sym.icon}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-slate-500 space-y-0.5">
        <div>※ 셀 클릭하면 상태 순환: 미입점 (·) → 입점 (✓) → 검토중 (⏳) → 불가 (✕) → 미입점</div>
        <div>※ SKU 목록은 정산자동화웹 마스터 기준. 새 상품 등록은 정산자동화웹에서.</div>
      </div>
    </div>
  );
}
