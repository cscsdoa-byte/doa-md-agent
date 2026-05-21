import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface RegisterBody {
  sku_id: number;
  sale_price: number;
  qty?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await request.json()) as RegisterBody;
  if (!body.sku_id || !body.sale_price) {
    return NextResponse.json({ error: "sku_id와 sale_price 필수" }, { status: 400 });
  }
  try {
    await runCli([
      "register",
      id,
      String(body.sku_id),
      String(body.sale_price),
      "-q",
      String(body.qty ?? 0),
    ]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const skuId = searchParams.get("sku_id");
  if (!skuId) {
    return NextResponse.json({ error: "sku_id query 필수" }, { status: 400 });
  }
  try {
    await runCli(["unregister", id, skuId]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
