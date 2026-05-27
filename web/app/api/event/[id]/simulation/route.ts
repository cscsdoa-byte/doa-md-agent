import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface Body {
  price: number;
  cost: number;
  ship: number;
  commission: number;
  discount: number;
  extra?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const required = ["price", "cost", "ship", "commission", "discount"] as const;
  for (const k of required) {
    const v = body[k];
    if (typeof v !== "number" || !isFinite(v)) {
      return NextResponse.json({ error: `${k} (number) 필수` }, { status: 400 });
    }
  }
  const args = [
    "save-simulation", id,
    "--price", String(Math.round(body.price)),
    "--cost", String(Math.round(body.cost)),
    "--ship", String(Math.round(body.ship)),
    "--commission", String(body.commission),
    "--discount", String(body.discount),
    "--extra", String(Math.round(body.extra ?? 0)),
  ];
  try {
    const { stdout } = await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
