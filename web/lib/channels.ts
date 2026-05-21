import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ChannelDef {
  key: string;
  name: string;
  is_sales: boolean;
}

/**
 * 판매채널 vs 정보채널 구분.
 * - 판매채널: 매출이 실제로 발생하는 곳 (정산자동화웹에 잡힘 또는 입점 예정)
 * - 정보채널: 행사 공고/인사이트만 수집, MD가 직접 행사를 잡을 대상 아님
 */
const SALES_CHANNEL_KEYS = new Set([
  "naver_smartstore",
  "kakao_talkstore",
  "coupang_wing",
  "11st_soffice",
  "toss_shopping",
  "esmplus",
  "ns_homeshopping",
  "shoppingnT",
]);

let cached: ChannelDef[] | null = null;

export async function loadChannels(): Promise<ChannelDef[]> {
  if (cached) return cached;
  try {
    const yamlPath = join(process.cwd(), "..", "crawler", "channels.yaml");
    const raw = await readFile(yamlPath, "utf-8");
    const channels: ChannelDef[] = [];
    let curKey: string | null = null;
    let curName: string | null = null;
    for (const line of raw.split(/\r?\n/)) {
      const keyMatch = line.match(/^\s*-\s+key:\s*(.+?)\s*$/);
      if (keyMatch) {
        if (curKey)
          channels.push({
            key: curKey,
            name: curName ?? curKey,
            is_sales: SALES_CHANNEL_KEYS.has(curKey),
          });
        curKey = keyMatch[1];
        curName = null;
        continue;
      }
      const nameMatch = line.match(/^\s+name:\s*(.+?)\s*$/);
      if (nameMatch && curKey) curName = nameMatch[1];
    }
    if (curKey)
      channels.push({
        key: curKey,
        name: curName ?? curKey,
        is_sales: SALES_CHANNEL_KEYS.has(curKey),
      });
    cached = channels;
    return channels;
  } catch {
    return [];
  }
}
