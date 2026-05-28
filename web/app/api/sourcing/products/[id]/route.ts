import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";
import { productToArgs } from "../route";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id.startsWith("prd_")) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await request.json();
  const args = productToArgs(body, ["product-update", id]);
  if (args.length === 2) {
    return NextResponse.json({ error: "수정할 필드 없음" }, { status: 400 });
  }
  try {
    const { stdout } = await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id.startsWith("prd_")) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    await runCli(["product-del", id]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
