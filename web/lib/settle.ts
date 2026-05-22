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
