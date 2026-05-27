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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드 없음" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xls")) {
    return NextResponse.json({ error: ".xls 파일만 가능" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  // 임시 파일 — data/cs_uploads/<timestamp>.xls
  const ts = Date.now();
  const dir = join(process.cwd(), "..", "data", "cs_uploads");
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `upload_${ts}.xls`);
  await writeFile(tmpPath, buf);
  try {
    const { stdout } = await runCli(["import-cs", tmpPath]);
    await refreshDump();
    // 임시 파일 정리 (실패해도 무시)
    await unlink(tmpPath).catch(() => {});
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    await unlink(tmpPath).catch(() => {});
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}
