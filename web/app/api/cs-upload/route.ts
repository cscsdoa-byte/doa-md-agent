/**
 * 이지데스크 .xls 업로드 → 임시 파일 저장 → import-cs CLI 호출 → DB.
 * 토스 업로드와 비슷하지만 정산자동화웹 안 거치고 doa-md-agent 자체 DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { refreshDump, runCli } from "@/lib/cli";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const clearAll = formData.get("clear_all") === "1";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드 없음" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xls")) {
    return NextResponse.json({ error: ".xls 파일만 가능" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ts = Date.now();
  const dir = join(process.cwd(), "..", "data", "cs_uploads");
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `upload_${ts}.xls`);
  await writeFile(tmpPath, buf);
  try {
    const args = ["import-cs", tmpPath];
    if (clearAll) args.push("--clear");
    const { stdout } = await runCli(args);

    // 자동 학습 — 새 답변 반영해 상품 KB 스마트 재빌드 (변화 큰 상품만)
    let kbLog = "";
    try {
      const kb = await runCli(["build-product-kb", "--smart"]);
      kbLog = kb.stdout;
    } catch (e) {
      kbLog = `(KB build skipped: ${(e as Error).message})`;
    }

    await refreshDump();
    await unlink(tmpPath).catch(() => {});
    return NextResponse.json({ ok: true, stdout, kb_log: kbLog });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    await unlink(tmpPath).catch(() => {});
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}

export async function DELETE() {
  // 전체 비우기 — UI에서 "초기화" 버튼용
  try {
    const { stdout } = await runCli(["cs-clear"]);
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}
