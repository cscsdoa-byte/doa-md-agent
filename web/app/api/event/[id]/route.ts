import { NextRequest, NextResponse } from "next/server";
import { refreshDump, runCli } from "@/lib/cli";

const VALID_STATUS = ["new", "reviewing", "applied", "selected", "running", "closed", "skip"];

interface PatchBody {
  status?: string;
  memo?: string;
  sale_start?: string;
  sale_end?: string;
  // 본문 수정
  title?: string;
  deadline?: string;
  category?: string;
  // 광고비
  ad_spend?: number;
  // 노션 매핑 필드
  event_type?: string;
  discount_rate?: number;
  discount_burden?: string;
  expected_revenue?: number;
  vendor_name?: string;
  vendor_contact?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await request.json()) as PatchBody;

  try {
    if (body.status) {
      if (!VALID_STATUS.includes(body.status)) {
        return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 });
      }
      await runCli(["status", id, body.status]);
    }
    if (body.memo !== undefined) {
      await runCli(["memo", id, body.memo]);
    }
    if (body.sale_start && body.sale_end) {
      await runCli(["period", id, body.sale_start, body.sale_end]);
    }
    if (body.ad_spend !== undefined) {
      await runCli(["ad-spend", id, String(body.ad_spend)]);
    }
    // 본문 필드 수정 (update CLI)
    const updateArgs: string[] = ["update", id];
    if (body.title !== undefined) updateArgs.push("--title", body.title);
    if (body.deadline !== undefined) updateArgs.push("--deadline", body.deadline);
    if (body.category !== undefined) updateArgs.push("--category", body.category);
    if (body.event_type !== undefined) updateArgs.push("--event-type", body.event_type);
    if (body.discount_rate !== undefined) updateArgs.push("--discount", String(body.discount_rate));
    if (body.discount_burden !== undefined) updateArgs.push("--burden", body.discount_burden);
    if (body.expected_revenue !== undefined) updateArgs.push("--expected", String(body.expected_revenue));
    if (body.vendor_name !== undefined) updateArgs.push("--vendor", body.vendor_name);
    if (body.vendor_contact !== undefined) updateArgs.push("--vendor-contact", body.vendor_contact);
    if (updateArgs.length > 2) {
      await runCli(updateArgs);
    }
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json(
      { error: err.message, stderr: err.stderr ?? null },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,16}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const mode = request.nextUrl.searchParams.get("mode") || "auto";
  // mode=reset: 상태/메모/SKU/기간/매출 캐시만 초기화 (RSS 수집 행사용)
  // mode=delete: 행사 자체 삭제 (수동 등록만, --force 없이)
  // mode=force-delete: crawl 행사도 강제 삭제 (재수집됨)
  // mode=auto: 일단 delete 시도, 안되면 reset
  try {
    if (mode === "reset") {
      await runCli(["reset", id]);
    } else if (mode === "delete") {
      await runCli(["delete", id]);
    } else if (mode === "force-delete") {
      await runCli(["delete", id, "--force"]);
    } else {
      // auto: delete 시도 → manual이 아니면 실패 → reset 로 fallback
      try {
        await runCli(["delete", id]);
      } catch {
        await runCli(["reset", id]);
      }
    }
    await refreshDump();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return NextResponse.json({ error: err.message, stderr: err.stderr }, { status: 500 });
  }
}
