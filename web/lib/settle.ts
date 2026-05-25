/**
 * 정산자동화웹 API 클라이언트 (Next.js 서버 측 전용).
 * Python settle_client.py 의 TS 버전.
 *
 * 토큰은 doa-md-agent/.env 의 SETTLE_API_TOKEN.
 * auto_login 으로 .env 가 갱신될 때 dev 서버 재시작 없이 즉시 반영되도록
 * 매 호출마다 디스크에서 다시 읽음 (작은 파일이라 성능 영향 미미).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SETTLE_BASE_URL || "http://3.37.214.243").replace(/\/$/, "");

export class SettleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function readTokenFresh(): string {
  // 매 호출마다 .env 디스크에서 직접 읽기 — auto_login 갱신 즉시 반영용
  try {
    const envPath = join(process.cwd(), "..", ".env");
    const text = readFileSync(envPath, "utf-8");
    const m = text.match(/^SETTLE_API_TOKEN=(.+)$/m);
    if (m) {
      const fresh = m[1].trim();
      if (fresh) return fresh;
    }
  } catch {
    // ignore
  }
  return process.env.SETTLE_API_TOKEN || "";
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const token = readTokenFresh();
  if (!token) {
    throw new SettleError(0, "SETTLE_API_TOKEN 이 .env 에 없습니다");
  }
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const r = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (r.status === 401) {
    throw new SettleError(401, "토큰 만료/무효 — .env 의 SETTLE_API_TOKEN 갱신 필요");
  }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new SettleError(r.status, `정산자동화웹 ${path} ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

export interface Sku {
  id: number;
  sku_code: string | null;
  product_name: string;
  supplier: string | null;
  cost: number;
  supply_price: number;
  sale_price: number;
  shipping_fee: number;
  shipping_type: string;
  leaflet_cost: number;
  etc_cost: number;
  customer_ship_fee: number;
}

let skuCache: { at: number; data: Sku[] } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1분 — 자주 안 바뀌니까 캐싱

export async function getAllSkus(): Promise<Sku[]> {
  if (skuCache && Date.now() - skuCache.at < CACHE_TTL_MS) {
    return skuCache.data;
  }
  const data = await get<Sku[]>("/api/skus");
  skuCache = { at: Date.now(), data };
  return data;
}

export async function searchSkus(query: string, limit = 20): Promise<Sku[]> {
  const all = await getAllSkus();
  const q = query.trim();
  if (!q) return [];
  return all.filter((s) => (s.product_name || "").includes(q)).slice(0, limit);
}

export interface DashboardTotals {
  real_sale?: number;
  sale_ezadmin?: number;
  cost?: number;
  fee?: number;
  shipping?: number;
  ad_cost?: number;
  operating_profit?: number;
  net_profit?: number;
  net_profit_after_vat?: number;
  orders?: number;
  qty?: number;
}

export interface DashboardBreakdownRow {
  brand: string;
  channel: string;
  orders?: number;
  qty?: number;
  sale?: number;
  cost?: number;
  fee?: number;
  operating_profit?: number;
}

export interface DashboardSummary {
  range: { start: string; end: string };
  filter: { brand: string | null; channel: string | null };
  kpi: { margin_rate?: number; net_margin_rate?: number; roas?: number; [k: string]: unknown };
  totals: DashboardTotals;
  prev_totals?: DashboardTotals;
  breakdown?: DashboardBreakdownRow[];
}

/** 정산자동화웹 dashboard summary — 매출/원가/광고비 진실의 원천. */
export async function fetchSummary(params: {
  start: string;
  end: string;
  brand?: string;
  channel?: string;
}): Promise<DashboardSummary | null> {
  const token = (() => {
    try {
      const { readFileSync } = require("node:fs");
      const { join } = require("node:path");
      const t = readFileSync(join(process.cwd(), "..", ".env"), "utf-8");
      const m = t.match(/^SETTLE_API_TOKEN=(.+)$/m);
      return m ? m[1].trim() : process.env.SETTLE_API_TOKEN || "";
    } catch {
      return process.env.SETTLE_API_TOKEN || "";
    }
  })();
  if (!token) return null;
  const url = new URL(BASE + "/api/dashboard/summary");
  url.searchParams.set("start", params.start);
  url.searchParams.set("end", params.end);
  if (params.brand) url.searchParams.set("brand", params.brand);
  if (params.channel) url.searchParams.set("channel", params.channel);
  try {
    const r = await fetch(url.toString(), {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as DashboardSummary;
  } catch {
    return null;
  }
}

// 조선팔도떡집 = MD 에이전트가 관리하는 떡집 브랜드. 다른 도아 브랜드는 정산자동화웹 본진에서.
const DOA_BRANDS = ["조선팔도떡집"] as const;

/** 4개 브랜드 이번 달 PL 한꺼번에 (병렬). */
export async function fetchBrandPL(): Promise<{ brand: string; data: DashboardSummary | null }[]> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const today = `${y}-${m}-${String(now.getDate()).padStart(2, "0")}`;
  const start = `${y}-${m}-01`;
  const results = await Promise.all(
    DOA_BRANDS.map(async (b) => ({
      brand: b,
      data: await fetchSummary({ start, end: today, brand: b }),
    })),
  );
  return [...results];
}

export interface ChannelAgg {
  channel: string;
  sale: number;
  cost: number;
  fee: number;
  operating_profit: number;
  orders: number;
  qty: number;
  margin_rate: number;
}

/** 조선팔도떡집의 이번 달 채널별 PL — summary 1회 호출 후 breakdown 집계.
 *  주의: breakdown 에 광고비(ad_cost) 없음 → 채널별 광고비/순이익은 표시 불가.
 *  광고비는 전체 totals 에서만 받음. */
export async function fetchChannelPL(): Promise<{
  totals: DashboardTotals | null;
  range: { start: string; end: string } | null;
  channels: ChannelAgg[];
}> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const today = `${y}-${m}-${String(now.getDate()).padStart(2, "0")}`;
  const start = `${y}-${m}-01`;
  const data = await fetchSummary({ start, end: today, brand: "조선팔도떡집" });
  if (!data) return { totals: null, range: null, channels: [] };
  const by: Record<string, ChannelAgg> = {};
  for (const row of data.breakdown ?? []) {
    const ch = row.channel || "?";
    if (!by[ch]) by[ch] = { channel: ch, sale: 0, cost: 0, fee: 0, operating_profit: 0, orders: 0, qty: 0, margin_rate: 0 };
    by[ch].sale += row.sale ?? 0;
    by[ch].cost += row.cost ?? 0;
    by[ch].fee += row.fee ?? 0;
    by[ch].operating_profit += row.operating_profit ?? 0;
    by[ch].orders += row.orders ?? 0;
    by[ch].qty += row.qty ?? 0;
  }
  const channels = Object.values(by)
    .filter((c) => c.sale > 0)
    .map((c) => ({ ...c, margin_rate: c.sale ? (c.operating_profit / c.sale) * 100 : 0 }))
    .sort((a, b) => b.sale - a.sale);
  return { totals: data.totals, range: data.range, channels };
}
