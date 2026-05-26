import { NextRequest, NextResponse } from "next/server";
import { loadEvents } from "@/lib/data";
import { loadChannelSettleMap } from "@/lib/channels";
import { fetchSummary } from "@/lib/settle";

// 행사 진행기간 동안의 일별 매출 (정산자동화웹 summary.daily 기반).
// 필터: brand=조선팔도떡집(고정), channel=settle_channels[0].
// 같은 채널·브랜드의 다른 행사 매출이 섞일 수 있음을 UI 가 안내.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const data = await loadEvents();
  const event = data.events.find((e) => e.short_id === id);
  if (!event) {
    return NextResponse.json({ error: "event not found" }, { status: 404 });
  }
  if (!event.sale_start || !event.sale_end) {
    return NextResponse.json({ error: "진행기간(sale_start/sale_end) 미설정" }, { status: 400 });
  }
  const settleMap = await loadChannelSettleMap();
  const settleChs = settleMap[event.channel_key] ?? [];
  const channel = settleChs[0];

  try {
    const summary = await fetchSummary({
      start: event.sale_start.slice(0, 10),
      end: event.sale_end.slice(0, 10),
      brand: "조선팔도떡집",
      channel,
    });
    if (!summary) {
      return NextResponse.json(
        { error: "정산자동화웹 호출 실패 (토큰 만료 가능)" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      range: summary.range,
      filter: { brand: "조선팔도떡집", channel: channel ?? null },
      daily: summary.daily ?? [],
      note: settleChs.length === 0
        ? "settle_channels 매핑 없음 — 전 채널 합산"
        : `같은 채널·브랜드의 다른 행사 매출이 섞일 수 있음`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
