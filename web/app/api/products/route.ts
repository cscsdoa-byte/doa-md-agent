/**
 * /api/products — 상품 KB 개별 재빌드 + manual_notes 편집
 *
 * POST  ?product=두쫀모     → 그 상품만 강제 재빌드 (Claude 호출 1회)
 * PATCH ?product=두쫀모     → manual_notes 만 업데이트 (Claude 호출 없음)
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { refreshDump, runCli } from "@/lib/cli";

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

export async function POST(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product");
  if (!product) {
    return NextResponse.json({ error: "?product=<이름> 필요" }, { status: 400 });
  }
  // 해당 상품만 force 재빌드 — 임시로 KB 에서 그 항목 제거 후 build 실행
  const kb = loadKb();
  const savedNotes = kb[product]?.manual_notes;
  delete kb[product];
  saveKb(kb);

  try {
    await runCli(["build-product-kb"]);
    // 빌드 후 manual_notes 복원
    if (savedNotes) {
      const kb2 = loadKb();
      if (kb2[product]) {
        kb2[product].manual_notes = savedNotes;
        saveKb(kb2);
      }
    }
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json(
      { error: err.message, stderr: err.stderr ?? null },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product");
  if (!product) {
    return NextResponse.json({ error: "?product=<이름> 필요" }, { status: 400 });
  }
  let body: { manual_notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.manual_notes === undefined) {
    return NextResponse.json({ error: "manual_notes 필요" }, { status: 400 });
  }
  const kb = loadKb();
  if (!kb[product]) {
    kb[product] = { _reply_count: 0, _built_at: new Date().toISOString() };
  }
  kb[product].manual_notes = body.manual_notes;
  saveKb(kb);
  await refreshDump();
  return NextResponse.json({ ok: true });
}
