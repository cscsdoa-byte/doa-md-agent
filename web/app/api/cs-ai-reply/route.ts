/**
 * Claude API 직접 호출 — 인입 메시지에 대한 CS 답변 안 생성.
 * .env 의 ANTHROPIC_API_KEY 필요. 모델은 Haiku (빠르고 저렴).
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readEnvKey(name: string): string {
  // doa-md-agent/.env 우선, 없으면 process.env
  try {
    const text = readFileSync(join(process.cwd(), "..", ".env"), "utf-8");
    const m = text.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (m) return m[1].trim();
  } catch {}
  return process.env[name] || "";
}

const SYSTEM_PROMPT = `당신은 조선팔도떡집 CS 상담사입니다. 고객의 카카오톡/SMS 문의에 대한 답변 초안을 작성하세요.

회사 정보:
- 조선팔도떡집 — 떡 제조·판매 (전국 택배)
- 신선식품 → 주문 → 제조 → 출고 흐름
- 타겟 고객: 5060 세대 (큰 글씨/쉬운 말 친화)

답변 톤(톤A) 규칙:
- 공손·간결·정확 (3~5줄 이내)
- 존댓말, 따뜻한 인사로 시작
- 5060 친화 — 어려운 단어 X, 한자어 최소화
- 변수는 "#{고객명}", "#{주문번호}", "#{제조일}", "#{수령예정일}" 같이 #{} 로 표기
- 알림톡 답변이면 "[조선팔도떡집]" 으로 시작

정책:
- 신선식품 = 변심 환불 제한 (제조 시작 전만)
- 불량 환불 = 사진 필수, 전액 환불 + 재발송
- 제조 시작 전 = 자유 취소, 시작 후 = 사유 확인
- 영업시간: 평일 9시~18시

위험 카테고리 (자동 답변 금지, 상담사 우선 안내):
- 환불, 강한 불만, 불량/상품 이상, 법적 언급

답변 형식:
- 답변 텍스트만 출력 (설명·따옴표 X)
- 변수 부분은 #{변수명} 으로 명시 (상담사가 채울 부분)
- 불확실한 사실(주문번호·금액 등)은 절대 추측하지 말고 "확인 후 안내드리겠습니다" 사용`;

export async function POST(request: NextRequest) {
  const apiKey = readEnvKey("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 미설정 — 서버 .env 확인 필요" },
      { status: 500 },
    );
  }

  let body: { message?: string };
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message 필수" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "메시지 너무 김 (2000자 제한)" }, { status: 400 });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `고객 메시지:\n"${message}"\n\n위 메시지에 대한 CS 답변 초안을 작성해주세요.`,
          },
        ],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return NextResponse.json(
        { error: `Claude API ${r.status}: ${errText.slice(0, 300)}` },
        { status: 502 },
      );
    }
    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    const reply =
      data.content?.find((c) => c.type === "text")?.text?.trim() || "";
    if (!reply) {
      return NextResponse.json({ error: "응답 비어있음" }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
