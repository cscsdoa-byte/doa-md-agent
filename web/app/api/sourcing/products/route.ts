import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface ProductBody {
  name: string;
  category?: string;
  spec_notes?: string;
  target_launch_date?: string;
  target_event_id?: string;
  target_channels?: string[];     // CSV로 변환
  status?: string;
  notes?: string;
}

function toArgs(body: ProductBody, base: string[]): string[] {
  const args = [...base];
  if (body.name) args.push("--name", body.name);
  if (body.category) args.push("--category", body.category);
  if (body.spec_notes) args.push("--spec-notes", body.spec_notes);
  if (body.target_launch_date) args.push("--launch", body.target_launch_date);
  if (body.target_event_id) args.push("--event", body.target_event_id);
  if (body.target_channels && body.target_channels.length)
    args.push("--channels", body.target_channels.join(","));
  if (body.status) args.push("--status", body.status);
  if (body.notes) args.push("--notes", body.notes);
  return args;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProductBody;
  if (!body.name) {
    return NextResponse.json({ error: "name 필수" }, { status: 400 });
  }
  try {
    const { stdout } = await runCli(toArgs(body, ["product-add"]));
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}

export { toArgs as productToArgs };
