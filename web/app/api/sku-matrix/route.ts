/**
 * SKU × 채널 입점 상태 업데이트.
 * POST /api/sku-matrix
 *   body: { settle_name, sku_id, status: "entered"|"reviewing"|"blocked"|"none", entry_date?, note? }
 */
import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface Body {
  settle_name: string;
  sku_id: number;
  status: "entered" | "reviewing" | "blocked" | "none";
  entry_date?: string;
  note?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Body;
  if (!body.settle_name || typeof body.sku_id !== "number" || !body.status) {
    return NextResponse.json({ error: "settle_name, sku_id, status 필수" }, { status: 400 });
  }
  const args = ["sku-matrix-set", body.settle_name, String(body.sku_id), "--status", body.status];
  if (body.entry_date) args.push("--entry-date", body.entry_date);
  if (body.note) args.push("--note", body.note);

  try {
    await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}
