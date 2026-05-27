/**
 * Claude API — 실제 운영 답변을 few-shot 으로 학습해 똑같은 톤으로 응답.
 *
 * 핵심: 매뉴얼 톤 가이드 제거. 실제 답변 예시(user/assistant turn pairs)를 messages 에 직접 주입.
 * Claude가 system 의 규칙보다 직전 turn 패턴을 더 강하게 따라하는 특성 활용.
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
    order_ids: string[]; phones: string[]; amounts: string[]; products: string[]; dates: string[];
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

// system 은 짧고 명확. 톤 가이드 X — 톤은 messages 의 few-shot 으로만 학습.
const SYSTEM_PROMPT_FEWSHOT = `당신은 조선팔도떡집 CS 상담사입니다.

## 절대 규칙
1. **아래 messages 의 assistant 답변들이 회사의 실제 답변 스타일입니다.** 똑같은 톤·이모티콘·문장 길이·인사말·마무리로 답변하세요.
2. 정책/매뉴얼은 머리속에서 적용하지 마세요 — 실제 답변에 이미 녹아있습니다.
3. 변수는 #{고객명}, #{주문번호}, #{제조일}, #{수령예정일} 형식.
4. 추측 금지 — 모르는 정보는 실제 답변 톤대로 "확인 후 안내드릴게요" 식으로.
5. 위험 카테고리(환불·강한불만·불량)는 escalation 채우고 "[상담사 직접 응대 필요]" 라인 추가.

## 출력 형식 (순수 JSON만)
\`\`\`json
{
  "analysis_summary": "한 줄 요약",
  "replies": [
    { "label": "간단",       "text": "..." },
    { "label": "표준",       "text": "..." },
    { "label": "정중·상세",  "text": "..." }
  ],
  "follow_up_actions": ["...", "..."],
  "escalation": ""
}
\`\`\`

규칙:
- replies 3개 = 같은 의도, 길이만 다름 (간단=1~2줄, 표준=3~5줄, 정중=5~7줄)
- 톤은 모든 옵션 동일 (위 messages 답변과 같은 스타일)
- follow_up_actions = 답변 후 시스템에서 처리할 액션 (구체적)
- JSON 외 텍스트 X`;

// 매뉴얼 fallback (과거 답변 없을 때만) — 매우 간략
const SYSTEM_PROMPT_NO_CONTEXT = `당신은 조선팔도떡집 CS 상담사입니다. 떡 제조·판매(신선식품)입니다.

존댓말 + 친근한 톤 + 이모티콘(^^) 가끔 사용. 3~5줄.
변수: #{고객명}, #{주문번호}, #{제조일}.
추측 금지 — 모르는 건 "확인 후 안내드릴게요".

출력 형식 (순수 JSON만):
\`\`\`json
{
  "analysis_summary": "...",
  "replies": [{"label":"간단","text":"..."}, {"label":"표준","text":"..."}, {"label":"정중·상세","text":"..."}],
  "follow_up_actions": [],
  "escalation": ""
}
\`\`\``;

interface ClaudeOutput {
  analysis_summary?: string;
  replies?: { label: string; text: string }[];
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
  const similar = analysis?.similar_replies ?? [];
  const hasContext = similar.length > 0;

  // few-shot — user/assistant turn pairs 로 변환
  // Claude 가 가장 강하게 모방하는 형식
  type Msg = { role: "user" | "assistant"; content: string };
  const fewShotMessages: Msg[] = [];
  for (const ex of similar) {
    fewShotMessages.push({
      role: "user",
      content: `고객: ${ex.customer_msg}`,
    });
    fewShotMessages.push({
      role: "assistant",
      content: ex.agent_reply,
    });
  }

  // 분석 정보 — 마지막 user turn 에 첨부 (Claude 가 답변에 반영)
  const ext = analysis?.extracted;
  const extractedLines: string[] = [];
  if (ext) {
    if (ext.order_ids.length) extractedLines.push(`주문번호: ${ext.order_ids.join(", ")}`);
    if (ext.phones.length) extractedLines.push(`전화번호: ${ext.phones.join(", ")}`);
    if (ext.amounts.length) extractedLines.push(`금액: ${ext.amounts.join(", ")}`);
    if (ext.products.length) extractedLines.push(`상품: ${ext.products.join(", ")}`);
    if (ext.dates.length) extractedLines.push(`날짜: ${ext.dates.join(", ")}`);
  }

  const finalUserContent = hasContext
    ? `위 답변들의 톤·이모티콘·문장 길이·인사말·마무리를 그대로 따라서 아래 새 고객 메시지에 답변하세요.

새 고객 메시지:
"${message}"
${analysis ? `
[자동 분석]
- 의도: ${analysis.intent}
- 감정: ${analysis.sentiment} (긴급도 ${analysis.urgency}/3)
${extractedLines.length > 0 ? `- 추출 정보: ${extractedLines.join(" / ")}` : ""}` : ""}

지정된 JSON 형식으로 응답해주세요. 톤은 위 assistant 답변들과 정확히 동일해야 합니다.`
    : `고객 메시지:
"${message}"

JSON 형식으로 답변 옵션 3개와 후속 액션을 작성해주세요.`;

  const messages: Msg[] = [];
  if (hasContext) {
    // few-shot 먼저 (회사 톤 학습)
    messages.push(...fewShotMessages);
  }
  messages.push({ role: "user", content: finalUserContent });

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
        max_tokens: 1500,
        system: hasContext ? SYSTEM_PROMPT_FEWSHOT : SYSTEM_PROMPT_NO_CONTEXT,
        messages,
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
