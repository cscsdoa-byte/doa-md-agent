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

interface ProductKb {
  summary?: string;
  features?: string[];
  storage_shelf_life?: string;
  packaging_options?: string[];
  pricing_hints?: string[];
  common_concerns?: string[];
  pair_recommendations?: string[];
  caveats?: string[];
  frequent_phrases?: string[];
}

interface Analysis {
  intent: string;
  sentiment: string;
  urgency: number;
  extracted: {
    order_ids: string[]; phones: string[]; amounts: string[]; products: string[]; dates: string[];
  };
  similar_replies: SimilarReply[];
  product_knowledge?: Record<string, { reply: string; count: number }[]>;
  product_kb?: Record<string, ProductKb>;
}

async function analyzeMessage(message: string): Promise<Analysis | null> {
  try {
    const { stdout } = await runCli(["cs-analyze", message]);
    const parsed = JSON.parse(stdout.trim()) as Analysis;
    // 속도 최적화 — examples 상위 5건만 유지 (Haiku + 5건이면 톤 학습 충분)
    if (parsed.similar_replies) {
      parsed.similar_replies = parsed.similar_replies.slice(0, 5);
    }
    return parsed;
  } catch {
    return null;
  }
}

// system 은 톤 가이드 거의 없음. 톤은 messages few-shot 으로만 학습.
const SYSTEM_PROMPT_FEWSHOT = `당신은 조선팔도떡집 CS 상담사입니다.

## 톤 학습 (가장 중요)
앞 messages 의 assistant 답변들이 회사의 실제 운영 답변입니다. 다음을 그대로 복사하듯 따라하세요:
- 인사말 (예: "안녕하세요, 고객님 ^^")
- 이모티콘 사용 패턴 (^^, !, ~)
- 문장 길이·줄바꿈
- 마무리 인사 (예: "감사합니다!", "조선팔도떡집 믿고 주문해 주셔서 감사합니다^^")
- "맛있게 쪄서 발송해 드릴게요" 같은 회사 고유 표현
- 친근하지만 정중한 어투

## 정보 요청 규칙 (절대 준수)
고객 확인이 필요할 때 **주문번호 묻지 말 것** — 고객이 주문번호 찾기 어려움.
대신 **"성함과 연락처 뒷자리 4자리"** 만 요청. 실제 회사 표준 패턴.

예시:
- ✗ "주문번호 알려주시면 확인해드릴게요"
- ✓ "성함과 연락처 뒷자리 4자리 알려주시면 저희가 확인해서 안내드리겠습니다!"

## 상품 지식 활용 규칙 (절대 준수)
"추출된 상품 지식" 블록에 있는 정보는 **반드시 답변에 그대로 사용**.
KB 에 없는 정보는 **절대 추측·생성하지 말 것**.

예시 — 두쫀모 가격 질문이고 KB 에 "regular_price: 28,900원, discounted_price: 18,900원" 있으면:
- ✓ "두쫀모 10개 기준 정상가 28,900원, 할인가 18,900원이에요"
- ✗ "정확한 가격은 확인 후 안내드릴게요" (KB 에 있는데 무시 X)
- ✗ "냉장 2~5℃ 7일 보관" (KB 에 없는 정보 임의 생성 X)

KB 에 정보 없는 경우만:
- "확인 후 안내드릴게요"
- 절대 추측한 정보(특정 온도, 특정 일수) 만들지 말기

## 절대 금지 — 과도한 공감 표현 X
- "저희도 너무 속상하네요" / "저희도 마음이 아프네요" / "저희도 안타까워요"
- "얼마나 속상하셨을지" / "얼마나 화나셨을지" / "당황하셨겠어요"
- 고객의 감정을 추측·대변하는 표현
- "저희가 부족해서" / "저희도 가슴이 아픕니다" 같은 자기비하·과장 표현

→ 단순 사과만 OK: "불편 드려 죄송합니다", "죄송합니다"
→ 사실 인정 + 처리 안내 위주 (감정 추측 X)

## 그 외 절대 금지
- 매뉴얼식 딱딱한 답변 ("안내드립니다", "처리해드리겠습니다" 만 쓰지 말 것)
- 톤 가이드 만들지 말기 — 위 assistant 답변 톤 그대로 (단 위 금지 표현은 제외)
- 모르는 사실 추측 금지

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

- replies 3개 = 같은 톤, 길이만 다름 (간단=2~3줄, 표준=4~5줄, 정중=5~7줄)
- 변수: #{고객명}, #{주문번호}, #{제조일}
- 위험(환불/불량/강한불만) → escalation 채우고 답변마다 "[상담사 직접 응대 필요]" 추가
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

  // few-shot — user/assistant turn pairs (Claude 모방 가장 강한 형식)
  // 빈도 낮은 거 먼저, 높은 거 마지막에 → 최근 turn 효과로 가장 흔한 패턴 강조
  type Msg = { role: "user" | "assistant"; content: string };
  const sortedSimilar = [...similar].sort((a, b) => a.count - b.count);
  const fewShotMessages: Msg[] = [];
  for (const ex of sortedSimilar) {
    fewShotMessages.push({ role: "user", content: `고객: ${ex.customer_msg}` });
    fewShotMessages.push({ role: "assistant", content: ex.agent_reply });
  }

  // 분석 정보 + 상품 지식 — 마지막 user turn 에 첨부
  const ext = analysis?.extracted;
  const extractedLines: string[] = [];
  if (ext) {
    if (ext.order_ids.length) extractedLines.push(`주문번호: ${ext.order_ids.join(", ")}`);
    if (ext.phones.length) extractedLines.push(`전화번호: ${ext.phones.join(", ")}`);
    if (ext.amounts.length) extractedLines.push(`금액: ${ext.amounts.join(", ")}`);
    if (ext.products.length) extractedLines.push(`상품: ${ext.products.join(", ")}`);
    if (ext.dates.length) extractedLines.push(`날짜: ${ext.dates.join(", ")}`);
  }

  // 상품 지식 — KB 우선 (Claude 가 cs 답변 수십건 분석한 정제 데이터) + 과거 답변 N개
  let productKnowledgeBlock = "";
  const kb = analysis?.product_kb;
  const pk = analysis?.product_knowledge;
  const productNames = new Set<string>([
    ...(kb ? Object.keys(kb) : []),
    ...(pk ? Object.keys(pk) : []),
  ]);
  if (productNames.size > 0) {
    const lines: string[] = ["", "## 🔵 추출된 상품 지식 (답변에 반드시 활용 — 추측 금지)"];
    for (const product of productNames) {
      lines.push(`\n[상품: ${product}]`);
      const k = kb?.[product];
      if (k) {
        if (k.summary) lines.push(`  · 요약: ${k.summary}`);
        if (k.features?.length) lines.push(`  · 특징: ${k.features.join(" / ")}`);
        if (k.storage_shelf_life) {
          // storage_shelf_life 가 객체 또는 문자열일 수 있음
          const s = typeof k.storage_shelf_life === "string"
            ? k.storage_shelf_life
            : JSON.stringify(k.storage_shelf_life);
          lines.push(`  · 보관·유통: ${s}`);
        }
        if (k.packaging_options?.length) lines.push(`  · 구성: ${k.packaging_options.join(" / ")}`);
        if (k.pricing_hints) {
          const p = typeof k.pricing_hints === "string"
            ? k.pricing_hints
            : Array.isArray(k.pricing_hints)
              ? k.pricing_hints.join(" / ")
              : JSON.stringify(k.pricing_hints);
          if (p) lines.push(`  · 가격: ${p}`);
        }
        if (k.caveats?.length) lines.push(`  · 주의: ${k.caveats.join(" / ")}`);
        if (k.common_concerns?.length) lines.push(`  · 자주 묻는 점: ${k.common_concerns.join(" / ")}`);
        if (k.pair_recommendations?.length) lines.push(`  · 어울리는: ${k.pair_recommendations.join(" / ")}`);
        if (k.frequent_phrases?.length) lines.push(`  · 회사 자주 쓰는 표현: ${k.frequent_phrases.join(" | ")}`);
      }
      const replies = pk?.[product];
      if (replies && replies.length > 0) {
        for (const r of replies.slice(0, 2)) {
          lines.push(`  · 실제 답변예: ${r.reply.slice(0, 150)}`);
        }
      }
    }
    lines.push("\n⚠️ 위 KB 정보를 답변에 직접 사용. KB 에 없는 정보는 절대 추측·생성 금지. KB 에 없으면 '확인 후 안내드릴게요' 만.");
    productKnowledgeBlock = lines.join("\n");
  }

  const finalUserContent = hasContext
    ? `위 assistant 답변들의 톤·이모티콘·문장 길이·인사말·마무리를 그대로 복사해서 아래 새 고객 메시지에 답변하세요.

특히 다음을 그대로 따라하세요:
- "^^" 같은 이모티콘 자주 사용
- "맛있게 쪄서 발송해 드릴게요" 같은 회사 고유 표현
- "조선팔도떡집 믿고 주문해 주셔서 감사합니다^^" 같은 마무리
- 친근하고 정성스러운 톤 (딱딱한 매뉴얼 X)

⚠️ 단, 다음 표현/패턴은 절대 사용 금지 (위 examples 에 있어도 빼고 답변):
- "저희도 속상하네요/안타까워요/마음이 아프네요" 등 공감 표현
- "얼마나 속상하셨을지" 등 고객 감정 추측
- "저희가 부족해서" 등 자기비하
- **"주문번호 알려주시면" — 절대 금지. 대신 "성함과 연락처 뒷자리 4자리" 요청.**
- **추측한 사실** — KB 에 없는 보관 온도/일수/원재료 등 추측 생성 절대 X

→ 사과는 "죄송합니다" 단순하게. 사실 인정 + 처리 안내 위주.
→ 고객 확인 = 성함 + 연락처 뒷4자리.
→ **상품 정보 = KB 에 있는 정보 그대로. KB 에 없으면 "확인 후 안내" 만 가능.**

새 고객 메시지:
"${message}"
${analysis ? `
[자동 분석]
- 의도: ${analysis.intent}
- 감정: ${analysis.sentiment} (긴급도 ${analysis.urgency}/3)
${extractedLines.length > 0 ? `- 추출 정보: ${extractedLines.join(" / ")}` : ""}` : ""}${productKnowledgeBlock}

지정된 JSON 형식으로 응답. replies 3개 모두 위 assistant 답변과 똑같은 톤이어야 합니다.`
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
        // Haiku 4.5 — Sonnet 대비 2-3배 빠름. few-shot 5건 + 명확한 system prompt 로 톤 모방 충분.
        model: "claude-haiku-4-5",
        max_tokens: 1000,    // 1500 → 1000 (응답 길이 단축)
        temperature: 0.5,    // 0.6 → 0.5 (일관성 ↑, 빠른 수렴)
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
