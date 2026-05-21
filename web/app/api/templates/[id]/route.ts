import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    await runCli(["template-del", String(n)]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
