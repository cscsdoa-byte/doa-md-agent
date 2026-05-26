import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface AppliedSku {
  sku_id: number;
  sale_price: number;
  qty_est: number;
  sku_name: string | null;
}

export interface SalesTotals {
  sale: number;
  cost: number;
  fee: number;
  shipping: number;
  ad_spend?: number;     // sales 명령(SKU 매칭) 결과
  ad_cost?: number;      // attach-channel-totals 결과 (정산자동화웹 totals 그대로)
  qty: number;
  orders: number;
  operating_profit: number;
  net_profit: number;
  ad_spend_is_filtered?: boolean;
}

export interface EventAttachment {
  id: number;
  dedup_id: string;
  filename: string;
  original_name: string | null;
  caption: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface EventItem {
  dedup_id: string;
  short_id: string;
  channel_key: string;
  title: string;
  url: string;
  posted_at: string | null;
  deadline_at: string | null;
  category: string | null;
  is_doa_fit: number;
  status: string;
  status_label: string;
  status_updated_at: string | null;
  memo: string | null;
  sale_start: string | null;
  sale_end: string | null;
  applied_skus: AppliedSku[];
  sales: { totals?: SalesTotals; expected_revenue?: number; channels_used?: string[]; matched?: unknown[] } | null;
  sales_synced_at: string | null;
  source: string;
  ad_spend_manual: number | null;
  // 노션 컬럼 매핑
  event_type: string | null;          // 기획전 / 타임특가 / 오늘끝딜 등
  discount_rate: number | null;       // 0.0 ~ 1.0
  discount_burden: string | null;     // 도아 / 채널 / 분담
  expected_revenue: number | null;
  vendor_name: string | null;
  vendor_contact: string | null;
  md_owner_name: string | null;  // 행사별 담당 MD (자유 입력, 채널 contacts 우선)
  ops_stock_note: string | null;     // 진행중 운영관리 — 재고 메모
  ops_claim_note: string | null;     // 진행중 운영관리 — 클레임/이슈 메모
  attachments?: EventAttachment[];   // 구좌 노출 캡쳐들
  first_seen_at: string;
  last_seen_at: string;
}

export interface Contact {
  id: number;
  channel_key: string;
  name: string;
  kakao_id: string | null;
  phone: string | null;
  email: string | null;
  memo: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventTemplate {
  id: number;
  name: string;
  channel_key: string;
  title_pattern: string;
  category: string | null;
  recurrence: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventsPayload {
  generated_at: string;
  total: number;
  doa_fit: number;
  by_channel: Record<string, number>;
  events: EventItem[];
  contacts?: Contact[];
  templates?: EventTemplate[];
}

const DATA_PATH = join(process.cwd(), "..", "data", "events.json");

export async function loadEvents(): Promise<EventsPayload> {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as EventsPayload;
  } catch (e) {
    return {
      generated_at: new Date().toISOString(),
      total: 0,
      doa_fit: 0,
      by_channel: {},
      events: [],
    };
  }
}
