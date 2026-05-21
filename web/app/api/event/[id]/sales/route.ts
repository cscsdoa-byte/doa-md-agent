import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const { stdout } = await runCli(["sales", id]);
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
