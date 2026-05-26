import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

const VALID_KIND = new Set(["stock", "claim", "retro"]);

interface Body {
  kind: "stock" | "claim" | "retro";
  value: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await request.json()) as Body;
  if (!VALID_KIND.has(body.kind)) {
    return NextResponse.json({ error: `invalid kind: ${body.kind}` }, { status: 400 });
  }
  try {
    await runCli(["ops-note", id, body.kind, body.value ?? ""]);
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
