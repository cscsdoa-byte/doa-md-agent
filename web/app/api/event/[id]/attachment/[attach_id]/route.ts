import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEvents } from "@/lib/data";
import { refreshDump, runCli } from "@/lib/cli";

const PROJECT_DIR = path.join(process.cwd(), "..");
const ATTACH_DIR = path.join(PROJECT_DIR, "data", "attachments");

function validateShortId(id: string): boolean {
  return /^[a-f0-9]{6,16}$/.test(id);
}
function validateAttachId(attachId: string): number | null {
  const n = parseInt(attachId, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function findAttachment(eventId: string, attachId: number) {
  const data = await loadEvents();
  for (const ev of data.events) {
    if (!ev.short_id || !ev.short_id.startsWith(eventId.slice(0, 6))) continue;
    const found = ev.attachments?.find((a) => a.id === attachId);
    if (found) return { event: ev, attach: found };
  }
  return null;
}

// GET — 이미지 바이너리 응답.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attach_id: string }> }
) {
  const { id, attach_id } = await params;
  if (!validateShortId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const aid = validateAttachId(attach_id);
  if (aid === null) {
    return NextResponse.json({ error: "invalid attach_id" }, { status: 400 });
  }
  const hit = await findAttachment(id, aid);
  if (!hit) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const file = path.join(ATTACH_DIR, hit.event.short_id, hit.attach.filename);
  try {
    const buf = await readFile(file);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": hit.attach.mime_type ?? "application/octet-stream",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}

// PATCH — 캡션 수정. body: { caption: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attach_id: string }> }
) {
  const { id, attach_id } = await params;
  if (!validateShortId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const aid = validateAttachId(attach_id);
  if (aid === null) {
    return NextResponse.json({ error: "invalid attach_id" }, { status: 400 });
  }
  const body = (await request.json()) as { caption?: string };
  const caption = body.caption ?? "";
  try {
    await runCli(["attach-update", String(aid), caption]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json(
      { error: err.message, stderr: err.stderr ?? null },
      { status: 500 }
    );
  }
}

// DELETE — 첨부 삭제 (DB row + 파일).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attach_id: string }> }
) {
  const { id, attach_id } = await params;
  if (!validateShortId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const aid = validateAttachId(attach_id);
  if (aid === null) {
    return NextResponse.json({ error: "invalid attach_id" }, { status: 400 });
  }
  try {
    await runCli(["attach-del", String(aid)]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json(
      { error: err.message, stderr: err.stderr ?? null },
      { status: 500 }
    );
  }
}
