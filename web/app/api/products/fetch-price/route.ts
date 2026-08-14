/**
 * /api/products/fetch-price?product=두쫀모
 *
 * 등록된 11번가 URL에서 가격(JSON-LD price) 추출 → KB.price 업데이트.
 * 11번가 외 채널은 봇 차단 등으로 안정성 낮아 1차 미지원.
 * 평점은 11번가가 클라이언트 JS 렌더라 SSR로 못 가져옴 → 수동 입력.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const KB_PATH = join(process.cwd(), "..", "data", "product_kb.json");

function loadKb(): Record<string, Record<string, unknown>> {
  if (!existsSync(KB_PATH)) return {};
  try { return JSON.parse(readFileSync(KB_PATH, "utf-8")); } catch { return {}; }
}
function saveKb(kb: Record<string, Record<string, unknown>>) {
  writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), "utf-8");
}

async function extractFrom11st(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"price"\s*:\s*(\d+)\s*,\s*"priceCurrency"\s*:\s*"KRW"/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product");
  if (!product) return NextResponse.json({ error: "?product=<이름> 필요" }, { status: 400 });
  const kb = loadKb();
  const item = kb[product];
  if (!item) return NextResponse.json({ error: "상품 없음" }, { status: 404 });

  const urls = (item.channel_urls as Record<string, string> | undefined) ?? {};
  const eleventh = urls["11번가"];
  if (!eleventh) {
    return NextResponse.json({ error: "11번가 URL 등록되어야 가격 자동 추출 가능" }, { status: 400 });
  }
  const price = await extractFrom11st(eleventh);
  if (price === null) {
    return NextResponse.json({ error: "11번가에서 가격 추출 실패 (페이지 구조 변경 또는 차단)" }, { status: 502 });
  }
  item.price = price;
  item._price_fetched_at = new Date().toISOString();
  item._price_source = "11번가";
  saveKb(kb);
  return NextResponse.json({ ok: true, price, source: "11번가" });
}
