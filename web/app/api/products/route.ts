/**
 * /api/products — 상품 KB CRUD.
 *
 * GET                       → 전체 상품 리스트 + KB
 * POST   ?action=create&name=신상품  → 빈 항목 추가
 * PATCH  ?product=두쫀모     → channel_urls / main_image / detail_images / manual_notes /
 *                              price / rating / review_count / rename(=새이름) 업데이트
 * DELETE ?product=두쫀모     → 항목 제거 (확인 후)
 *
 * 자동 KB 빌드(POST 재빌드)는 UI에서 제거됨. CLI(`build-product-kb`)로만 호출.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { refreshDump } from "@/lib/cli";

const KB_PATH = join(process.cwd(), "..", "data", "product_kb.json");

function loadKb(): Record<string, Record<string, unknown>> {
  if (!existsSync(KB_PATH)) return {};
  try {
    return JSON.parse(readFileSync(KB_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveKb(kb: Record<string, Record<string, unknown>>) {
  writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), "utf-8");
}

export async function GET() {
  const kb = loadKb();
  return NextResponse.json({ kb });
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  if (action === "create") {
    const name = (request.nextUrl.searchParams.get("name") ?? "").trim();
    if (!name) return NextResponse.json({ error: "name 필요" }, { status: 400 });
    const kb = loadKb();
    if (kb[name]) return NextResponse.json({ error: "이미 있는 상품명" }, { status: 409 });
    kb[name] = { _reply_count: 0, _built_at: new Date().toISOString() };
    saveKb(kb);
    await refreshDump();
    return NextResponse.json({ ok: true, name });
  }
  return NextResponse.json({ error: "?action=create&name=... 만 지원" }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product");
  if (!product) return NextResponse.json({ error: "?product=<이름> 필요" }, { status: 400 });
  const renameTo = request.nextUrl.searchParams.get("rename");

  let body: {
    manual_notes?: string;
    channel_urls?: Record<string, string>;
    main_image?: string | null;
    detail_images?: string[];
    price?: number | null;
    rating?: number | null;
    review_count?: number | null;
    // 채널별 가격/평점/이슈/URL (새 형식). channel_urls 와 병행 가능.
    channels?: Record<string, {
      url?: string;
      price?: number | null;
      rating?: number | null;
      review_count?: number | null;
      issues?: { id: string; date: string; text: string; severity?: string }[];
    }>;
  } = {};
  try {
    body = await request.json();
  } catch {
    if (!renameTo) return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const kb = loadKb();
  if (!kb[product]) {
    kb[product] = { _reply_count: 0, _built_at: new Date().toISOString() };
  }
  if (body.manual_notes !== undefined) kb[product].manual_notes = body.manual_notes;
  if (body.channel_urls !== undefined) kb[product].channel_urls = body.channel_urls;
  if (body.main_image !== undefined) kb[product].main_image = body.main_image;
  if (body.detail_images !== undefined) kb[product].detail_images = body.detail_images;
  if (body.price !== undefined) kb[product].price = body.price;
  if (body.rating !== undefined) kb[product].rating = body.rating;
  if (body.review_count !== undefined) kb[product].review_count = body.review_count;
  if (body.channels !== undefined) kb[product].channels = body.channels;

  // 이름 변경
  if (renameTo && renameTo !== product) {
    if (kb[renameTo]) return NextResponse.json({ error: `'${renameTo}' 이미 있음` }, { status: 409 });
    kb[renameTo] = kb[product];
    delete kb[product];
  }
  saveKb(kb);
  await refreshDump();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product");
  if (!product) return NextResponse.json({ error: "?product=<이름> 필요" }, { status: 400 });
  const kb = loadKb();
  if (!kb[product]) return NextResponse.json({ error: "없음" }, { status: 404 });
  delete kb[product];
  saveKb(kb);
  await refreshDump();
  return NextResponse.json({ ok: true });
}
