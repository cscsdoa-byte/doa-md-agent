import { NextRequest, NextResponse } from "next/server";
import { SettleError, searchSkus } from "@/lib/settle";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
  if (!q.trim()) {
    return NextResponse.json({ items: [] });
  }
  try {
    const items = await searchSkus(q, limit);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof SettleError) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
