/**
 * 행사 코멘트 / 활동 삭제.
 * POST /api/event/[id]/comment    body: { text }
 * DELETE /api/event/[id]/comment?activity_id=N
 */
import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await request.json()) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text 필수" }, { status: 400 });
  }
  try {
    await runCli(["comment-add", id, text]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const activityId = request.nextUrl.searchParams.get("activity_id");
  if (!activityId) {
    return NextResponse.json({ error: "?activity_id=N 필요" }, { status: 400 });
  }
  try {
    await runCli(["activity-del", activityId]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}
