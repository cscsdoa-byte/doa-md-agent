import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface SupplierBody {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  kakao_id?: string;
  address?: string;
  category?: string;
  scale?: string;
  moq?: number;
  lead_time_days?: number;
  source?: string;
  homepage?: string;
  notes?: string;
  status?: string;
}

function toArgs(body: SupplierBody, base: string[]): string[] {
  const args = [...base];
  if (body.name) args.push("--name", body.name);
  if (body.contact_person) args.push("--contact-person", body.contact_person);
  if (body.phone) args.push("--phone", body.phone);
  if (body.email) args.push("--email", body.email);
  if (body.kakao_id) args.push("--kakao", body.kakao_id);
  if (body.address) args.push("--address", body.address);
  if (body.category) args.push("--category", body.category);
  if (body.scale) args.push("--scale", body.scale);
  if (body.moq !== undefined && body.moq !== null) args.push("--moq", String(body.moq));
  if (body.lead_time_days !== undefined && body.lead_time_days !== null)
    args.push("--lead-time", String(body.lead_time_days));
  if (body.source) args.push("--source", body.source);
  if (body.homepage) args.push("--homepage", body.homepage);
  if (body.notes) args.push("--notes", body.notes);
  if (body.status) args.push("--status", body.status);
  return args;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SupplierBody;
  if (!body.name) {
    return NextResponse.json({ error: "name 필수" }, { status: 400 });
  }
  try {
    const { stdout } = await runCli(toArgs(body, ["supplier-add"]));
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}

export { toArgs as supplierToArgs };
