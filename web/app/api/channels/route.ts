/**
 * 채널 마스터 CRUD API.
 * GET   /api/channels                — 전체 목록 (events.json 의 channels_master 반환)
 * POST  /api/channels                — 수동 채널 추가
 * PATCH /api/channels?name=...       — status/priority/note/url 업데이트
 * DELETE /api/channels?name=...      — 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

interface AddBody {
  settle_name: string;
  display_name: string;
  is_sales?: boolean;
  abbr?: string;
  default_fee_rate?: number;
  yaml_key?: string;
}

interface PatchBody {
  status?: string;
  priority?: string;
  note?: string;
  url?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AddBody;
  if (!body.settle_name || !body.display_name) {
    return NextResponse.json({ error: "settle_name, display_name 필수" }, { status: 400 });
  }
  const args = ["channel-add-manual", body.settle_name, body.display_name];
  if (body.is_sales === false) args.push("--info");
  if (body.abbr) args.push("--abbr", body.abbr);
  if (body.default_fee_rate !== undefined) args.push("--fee", String(body.default_fee_rate));
  if (body.yaml_key) args.push("--yaml-key", body.yaml_key);

  try {
    await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "?name=<settle_name> 필요" }, { status: 400 });
  }
  const body = (await request.json()) as PatchBody;
  const args = ["channel-meta", name];
  if (body.status !== undefined) args.push("--status", body.status);
  if (body.priority !== undefined) args.push("--priority", body.priority);
  if (body.note !== undefined) args.push("--note", body.note);
  if (body.url !== undefined) args.push("--url", body.url);
  if (args.length === 2) {
    return NextResponse.json({ error: "변경 필드 없음" }, { status: 400 });
  }

  try {
    await runCli(args);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "?name=<settle_name> 필요" }, { status: 400 });
  }

  try {
    await runCli(["channel-del", name]);
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr ?? null }, { status: 500 });
  }
}
