import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface NewEventBody {
  channel_key: string;
  title: string;
  deadline?: string;
  url?: string;
  memo?: string;
  category?: string;
  sale_start?: string;
  sale_end?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as NewEventBody;
  if (!body.channel_key || !body.title) {
    return NextResponse.json({ error: "channel_key, title 필수" }, { status: 400 });
  }
  const args = ["add-event", body.channel_key, body.title];
  if (body.deadline) args.push("-d", body.deadline);
  if (body.url) args.push("-u", body.url);
  if (body.memo) args.push("-m", body.memo);
  if (body.category) args.push("--category", body.category);
  if (body.sale_start) args.push("--start", body.sale_start);
  if (body.sale_end) args.push("--end", body.sale_end);
  try {
    const { stdout } = await runCli(args);
    // "✓ 수동 행사 등록: dab159 제목..." 에서 dedup_id 추출
    const m = stdout.match(/등록:\s*([a-f0-9]{6,16})/);
    const dedup_id = m ? m[1] : null;
    await refreshDump();
    return NextResponse.json({ ok: true, stdout, dedup_id });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
