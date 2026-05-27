/**
 * Claude API — 메시지 종합 분석 + 3개 답변 옵션 + 후속 액션 제안.
 *
 * 흐름:
 * 1. POST { message }
 * 2. crawler.run cs-analyze → intent/sentiment/추출정보/과거답변 JSON
 * 3. Claude system prompt 에 분석 결과 + 과거 운영 답변 컨텍스트 + 출력 형식 명시
 * 4. Claude 가 JSON 으로 응답 (analysis_summary + replies[3] + follow_up_actions)
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

interface Analysis {
  intent: string;
  sentiment: string;
  urgency: number;
  extracted: {
    order_ids: string[];
    phones: string[];
    amounts: string[];
    products: string[];
    dates: string[];
  };
  similar_replies: SimilarReply[];
}

async function analyzeMessage(message: string): Promise<Analysis | null> {
  try {
    const { stdout } = await runCli(["cs-analyze", message]);
    return JSON.parse(stdout.trim()) as Analysis;
  } catch {
    return null;
  }
}

function buildSystemPrompt(analysis: Analysis | null): string {
  const base = `당신은 조선팔도떡집 CS 분석가 + 상담사입니다. 인입 메시지를 분석하고 답변 옵션 3개와 후속 액션을 제안합니다.

회사 정보:
- 조선팔도떡집 — 떡 제조·판매 (전국 택배), 신선식품
- 주문 → 제조 → 출고 흐름 (당일 14시 이후 입금건은 익일 제조)
- 타겟 고객: 5060 세대 (큰 글씨/쉬운 말 친화)
- 영업시간: 평일 9시~18시

답변 톤(톤A):
- 공손·간결·정확 (3~5줄)
- 존댓말, 따뜻한 인사로 시작
- 5060 친화 — 어려운 단어 X, 한자어 최소화
- 변수는 "#{고객명}", "#{주문번호}", "#{제조일}", "#{수령예정일}" 형식
- 불확실한 사실은 절대 추측 금지 — "확인 후 안내드리겠습니다"

신선식품 정책:
- 변심 환불 = 제조 시작 전만 (주문 후 1시간 이내)
- 불량 환불 = 사진 필수, 전액 환불 + 재발송
- 제조 시작 전 = 자유 취소, 시작 후 = 사유 확인

위험 카테고리 (자동 답변 절대 X, 상담사 우선):
- 환불, 강한 불만, 불량·상품이상, 법적 언급
- 답변 옵션에 "[상담사 직접 응대 필요]" 명시`;

  if (!analysis) {
    return base + "\n\n분석 데이터 없음 — 매뉴얼 기준 답변.";
  }

  const ext = analysis.extracted;
  const extractedLines: string[] = [];
  if (ext.order_ids.length) extractedLines.push(`- 주문번호: ${ext.order_ids.join(", ")}`);
  if (ext.phones.length) extractedLines.push(`- 전화번호: ${ext.phones.join(", ")}`);
  if (ext.amounts.length) extractedLines.push(`- 금액: ${ext.amounts.join(", ")}`);
  if (ext.products.length) extractedLines.push(`- 상품: ${ext.products.join(", ")}`);
  if (ext.dates.length) extractedLines.push(`- 날짜: ${ext.dates.join(", ")}`);

  const examples = analysis.similar_replies.length > 0
    ? analysis.similar_replies
        .map((p, i) =>
          `[${i + 1}] (${p.intent}, 과거 ${p.count}회)\n  고객: ${p.customer_msg}\n  답변: ${p.agent_reply}`,
        )
        .join("\n\n")
    : "(과거 비슷한 답변 없음 — 매뉴얼 기준)";

  return `${base}

## 메시지 분석 결과

- 의도(intent): **${analysis.intent}**
- 감정(sentiment): **${analysis.sentiment}**
- 긴급도(urgency): ${analysis.urgency}/3 ${analysis.urgency >= 2 ? "(빠른 응대 필요)" : ""}
- 추출된 정보:
${extractedLines.length > 0 ? extractedLines.join("\n") : "  (구체 정보 없음)"}

## 실제 운영 답변 참고 (조선팔도떡집 CS팀 과거 답변)

${examples}

## 출력 형식 (JSON 만)

\`\`\`json
{
  "analysis_summary": "한 줄 요약 (의도+감정+핵심)",
  "replies": [
    { "label": "간단", "text": "..." },
    { "label": "표준", "text": "..." },
    { "label": "정중·상세", "text": "..." }
  ],
  "follow_up_actions": [
    "주문번호 확인 후 시스템에서 발주 상태 조회",
    "..."
  ],
  "escalation": "상담사 우선 응대 필요한가? (없으면 빈 문자열)"
}
\`\`\`

규칙:
- 위 답변들의 톤·표현·문장 구조를 그대로 학습해 적용
- 3개 답변 = 같은 의도, 길이/디테일만 다름
- "간단" = 1~2줄, "표준" = 3~4줄, "정중·상세" = 4~6줄
- 추출된 정보(주문번호 등)는 답변에 직접 사용 가능 (단 추측 안 함)
- 위험 카테고리면 모든 replies에 "[상담사 직접 응대 필요]" 라인 추가
- follow_up_actions = 답변 후 CS팀이 시스템에서 할 일 (구체적)
- JSON 외 텍스트(설명/마크다운 등) 절대 X — 파싱 가능한 순수 JSON만`;
}

interface ReplyOption { label: string; text: string }
interface ClaudeOutput {
  analysis_summary?: string;
  replies?: ReplyOption[];
  follow_up_actions?: string[];
  escalation?: string;
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
  if (!message) return NextResponse.json({ error: "message 필수" }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "메시지 너무 김" }, { status: 400 });

  const analysis = await analyzeMessage(message);
  const systemPrompt = buildSystemPrompt(analysis);

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
        max_tokens: 1200,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `고객 메시지:\n"${message}"\n\n분석 + 3개 답변 옵션 + 후속 액션을 JSON으로 출력해주세요.`,
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
    const rawText = data.content?.find((c) => c.type === "text")?.text?.trim() || "";

    // JSON 추출 — Claude가 ```json ... ``` 로 감싸기도 함
    let jsonStr = rawText;
    const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeMatch) jsonStr = codeMatch[1];
    let parsed: ClaudeOutput;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        error: "Claude JSON 파싱 실패",
        raw: rawText.slice(0, 500),
      }, { status: 502 });
    }

    return NextResponse.json({
      analysis,
      analysis_summary: parsed.analysis_summary ?? "",
      replies: parsed.replies ?? [],
      follow_up_actions: parsed.follow_up_actions ?? [],
      escalation: parsed.escalation ?? "",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
