/**
 * 토스 정산 csv 업로드 프록시.
 * 클라이언트가 보낸 csv 를 정산자동화웹의 /api/upload/toss-settlement 으로 forward.
 * 토큰은 .env 의 SETTLE_API_TOKEN 사용 (auto_login 자동 갱신).
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SETTLE_BASE = (process.env.SETTLE_BASE_URL || "http://3.37.214.243").replace(/\/$/, "");

function readToken(): string {
  try {
    const p = join(process.cwd(), "..", ".env");
    const t = readFileSync(p, "utf-8");
    const m = t.match(/^SETTLE_API_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    // ignore
  }
  return process.env.SETTLE_API_TOKEN || "";
}

export async function POST(request: NextRequest) {
  const token = readToken();
  if (!token) {
    return NextResponse.json({ error: "SETTLE_API_TOKEN 없음 — .env 확인" }, { status: 500 });
  }

  // 클라이언트의 multipart form 그대로 받아서 정산자동화웹으로 forward
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드 없음" }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name);

  try {
    const r = await fetch(`${SETTLE_BASE}/api/upload/toss-settlement`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: upstreamForm,
    });
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return NextResponse.json(body, { status: r.status });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
