import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface NewTplBody {
  name: string;
  channel_key: string;
  title_pattern: string;
  category?: string;
  recurrence?: string;
  memo?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as NewTplBody;
  if (!body.name || !body.channel_key || !body.title_pattern) {
    return NextResponse.json({ error: "name/channel_key/title_pattern 필수" }, { status: 400 });
  }
  const args = ["template-add", body.name, body.channel_key, body.title_pattern];
  if (body.category) args.push("--category", body.category);
  if (body.recurrence) args.push("--recurrence", body.recurrence);
  if (body.memo) args.push("--memo", body.memo);
  try {
    const { stdout } = await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true, stdout });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
