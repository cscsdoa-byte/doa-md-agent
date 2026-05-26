import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { refreshDump, runCli } from "@/lib/cli";

// 첨부(구좌 캡쳐) 업로드. multipart/form-data: file (필수), caption (선택)
//
// 파일 저장 경로: <repo>/data/attachments/<short_id>/<uuid>.<ext>
// (short_id 는 dedup_id 앞 6자 — Python CLI 가 prefix 로 해석)
//
// DB 메타 등록은 Python CLI (attach-add) 가 담당. id 출력값을 stdout 마지막 줄에서 파싱.

const PROJECT_DIR = path.join(process.cwd(), "..");
const ATTACH_DIR = path.join(PROJECT_DIR, "data", "attachments");

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const EXT_FROM_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function validateShortId(id: string): boolean {
  return /^[a-f0-9]{6,16}$/.test(id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!validateShortId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const caption = (form.get("caption") as string | null) ?? null;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported mime: ${file.type}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 10MB)" }, { status: 413 });
  }

  // dedup_id 가 6자 prefix 이므로 디렉토리도 prefix 단위. Python CLI 도 prefix 매칭하므로 일관.
  // 단, prefix 가 모호하면 CLI 가 에러를 뱉음 — 그쪽에서 차단.
  const ext = EXT_FROM_MIME[file.type] ?? "bin";
  const filename = `${randomUUID()}.${ext}`;
  const dir = path.join(ATTACH_DIR, id);
  await mkdir(dir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buf);

  try {
    const args = [
      "attach-add",
      id,
      filename,
      "--mime", file.type,
      "--size", String(file.size),
    ];
    if (file.name) args.push("--original", file.name);
    if (caption) args.push("--caption", caption);
    const { stdout } = await runCli(args);
    const lines = stdout.trim().split(/\r?\n/);
    const attachId = parseInt(lines[lines.length - 1], 10);
    await refreshDump();
    return NextResponse.json({
      ok: true,
      attach_id: attachId,
      filename,
      url: `/md/api/event/${id}/attachment/${attachId}`,
    });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json(
      { error: err.message, stderr: err.stderr ?? null },
      { status: 500 }
    );
  }
}
