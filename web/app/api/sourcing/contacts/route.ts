import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface ContactBody {
  product_id?: string;        // POST 에서만 필요
  supplier_id?: string;       // POST 에서만 필요
  status?: string;
  next_action?: string;
  quoted_unit_price?: number;
  quoted_moq?: number;
  sample_received_at?: string;
  sample_notes?: string;
  notes?: string;
  contacted_now?: boolean;    // --contacted-now 플래그
}

function toFieldArgs(body: ContactBody, base: string[]): string[] {
  const args = [...base];
  if (body.status) args.push("--status", body.status);
  if (body.next_action) args.push("--next", body.next_action);
  if (body.quoted_unit_price !== undefined && body.quoted_unit_price !== null)
    args.push("--price", String(body.quoted_unit_price));
  if (body.quoted_moq !== undefined && body.quoted_moq !== null)
    args.push("--moq", String(body.quoted_moq));
  if (body.sample_received_at) args.push("--sample-received", body.sample_received_at);
  if (body.sample_notes) args.push("--sample-notes", body.sample_notes);
  if (body.notes) args.push("--notes", body.notes);
  if (body.contacted_now) args.push("--contacted-now");
  return args;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ContactBody;
  if (!body.product_id || !body.supplier_id) {
    return NextResponse.json({ error: "product_id, supplier_id 필수" }, { status: 400 });
  }
  const args = toFieldArgs(body, ["sourcing-add", body.product_id, body.supplier_id]);
  try {
    const { stdout } = await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}

export { toFieldArgs as contactToFieldArgs };
