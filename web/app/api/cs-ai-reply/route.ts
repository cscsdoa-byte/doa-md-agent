/**
 * Claude API 호출 — 과거 운영 답변을 컨텍스트로 학습한 CS 답변 생성.
 *
 * 흐름:
 * 1. 인입 메시지 받음
 * 2. crawler.run cs-similar-replies → 과거 비슷한 인입+발신 페어 N개 JSON
 * 3. Claude system prompt 에 "Past replies (실제 운영 답변):" 컨텍스트 주입
 * 4. Claude 가 회사 톤·표현·정책 그대로 학습한 답변 생성
 *
 * 결과: 매뉴얼만 보는 답변 → 실제 운영팀이 쓰던 진짜 답변 스타일
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "@/lib/cli";

function readEnvKey(name: string): string {
  try {
    const text = readFileSync(join(process.cwd(), "..", ".env"), "utf-8");
    const m = text.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (m) return m[1].trim();
  } catch {}
  return process.env[name] || "";
}

interface SimilarReply {
  intent: string;
  customer_msg: string;
  agent_reply: string;
  count: number;
}

async function getSimilarReplies(message: string): Promise<SimilarReply[]> {
  try {
    const { stdout } = await runCli(["cs-similar-replies", message, "--limit", "5"]);
    const parsed = JSON.parse(stdout.trim()) as SimilarReply[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSystemPrompt(pastReplies: SimilarReply[]): string {
  const base = `당신은 조선팔도떡집 CS 상담사입니다. 고객 카카오톡/SMS 문의에 답변 초안을 작성하세요.

회사 정보:
- 조선팔도떡집 — 떡 제조·판매 (전국 택배), 신선식품
- 주문 → 제조 → 출고 흐름
- 타겟 고객: 5060 세대 (큰 글씨/쉬운 말 친화)
- 영업시간: 평일 9시~18시

답변 톤(톤A):
- 공손·간결·정확 (3~5줄 이내)
- 존댓말, 따뜻한 인사로 시작
- 5060 친화 — 어려운 단어 X, 한자어 최소화
- 변수는 "#{고객명}", "#{주문번호}", "#{제조일}", "#{수령예정일}" 같이 #{} 로 표기
- 불확실한 사실은 추측 금지 — "확인 후 안내드리겠습니다" 사용

정책:
- 신선식품 = 변심 환불 제한 (제조 시작 전만)
- 불량 환불 = 사진 필수, 전액 환불 + 재발송
- 제조 시작 전 = 자유 취소, 시작 후 = 사유 확인

위험 카테고리 (자동 답변 금지, 상담사 우선):
- 환불, 강한 불만, 불량/상품 이상, 법적 언급

답변 형식:
- 답변 텍스트만 출력 (설명·따옴표·"답변:" 같은 라벨 X)
- 절대 추측 금지 (주문번호·금액·날짜 등)`;

  if (pastReplies.length === 0) {
    return base + "\n\n※ 과거 운영 답변 데이터가 없어 매뉴얼 기준으로 답변합니다.";
  }

  const examples = pastReplies
    .map((p, i) =>
      `[${i + 1}] (${p.intent}, 과거 ${p.count}회 발신)\n` +
      `  고객: ${p.customer_msg}\n` +
      `  답변: ${p.agent_reply}`
    )
    .join("\n\n");

  return `${base}

## 실제 운영 답변 참고 (조선팔도떡집 CS 팀이 과거에 비슷한 케이스에 보낸 답변)

${examples}

위 답변들의 톤·표현·구조를 학습해서 같은 스타일로 새 메시지에 답변하세요.
실제 운영 답변에 없는 정책이나 표현은 추가하지 마세요. 사실 확인 필요한 부분은 "확인 후 안내드리겠습니다".`;
}

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

  // 과거 운영 답변 컨텍스트 가져오기
  const pastReplies = await getSimilarReplies(message);
  const systemPrompt = buildSystemPrompt(pastReplies);

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
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `고객 메시지:\n"${message}"\n\n위 메시지에 대한 답변을 작성해주세요.`,
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
    const reply = data.content?.find((c) => c.type === "text")?.text?.trim() || "";
    if (!reply) {
      return NextResponse.json({ error: "응답 비어있음" }, { status: 502 });
    }
    return NextResponse.json({
      reply,
      context_count: pastReplies.length,
      intent: pastReplies[0]?.intent ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
