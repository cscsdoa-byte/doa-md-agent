import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface AddBody {
  platform: "instagram" | "youtube" | "kakao" | "facebook" | "tiktok" | "sns_own";
  comment_text: string;
  post_url?: string;
  post_label?: string;
  author?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AddBody;
  if (!body.platform || !body.comment_text) {
    return NextResponse.json({ error: "platform, comment_text 필수" }, { status: 400 });
  }
  const args = ["add-comment", body.platform, body.comment_text];
  if (body.post_url) args.push("--url", body.post_url);
  if (body.post_label) args.push("--label", body.post_label);
  if (body.author) args.push("--author", body.author);
  if (body.notes) args.push("--notes", body.notes);
  try {
    const { stdout } = await runCli(args);
    await refreshDump();
    return NextResponse.json(JSON.parse(stdout.trim()));
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "?id=<int> 필요" }, { status: 400 });
  }
  const body = (await request.json()) as { handled?: 0 | 1; flagged?: 0 | 1 };
  try {
    if (body.handled !== undefined) {
      await runCli(["comment-handled", id, ...(body.handled === 0 ? ["--undo"] : [])]);
    }
    if (body.flagged !== undefined) {
      await runCli(["comment-flag", id, ...(body.flagged === 0 ? ["--undo"] : [])]);
    }
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "?id=<int> 필요" }, { status: 400 });
  }
  try {
    await runCli(["comment-delete", id]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}
