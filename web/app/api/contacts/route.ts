import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface NewContactBody {
  channel_key: string;
  name: string;
  kakao_id?: string;
  phone?: string;
  email?: string;
  memo?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as NewContactBody;
  if (!body.channel_key || !body.name) {
    return NextResponse.json({ error: "channel_key, name 필수" }, { status: 400 });
  }
  const args = ["contact-add", body.channel_key, body.name];
  if (body.kakao_id) args.push("--kakao", body.kakao_id);
  if (body.phone) args.push("--phone", body.phone);
  if (body.email) args.push("--email", body.email);
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
