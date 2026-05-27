/**
 * 조선팔도떡집 CS 답변 매뉴얼.
 *
 * 톤 규칙 (메모리: project_joseon_paldo_alimtalk_convention.md):
 * - 톤A — 공손·간결·정확
 * - "#{고객명}" 변수 표기 가능
 * - "[조선팔도떡집]" 접두 (알림톡 한정)
 * - 5060 친화 — 큰 단위, 쉬운 말, 정중함
 *
 * 카테고리는 인입 TOP + 큰 이슈 카드와 같은 기준.
 * intent 키워드는 메시지 자동 분류용 (포함시 매칭).
 */

export interface CsManualItem {
  id: string;
  category: string;
  icon: string;
  severity: "info" | "warn" | "danger";  // 답변 시 신중도 (danger = 상담사 우선, 자동 X)
  intent_keywords: string[];
  customer_intent: string;
  reply_templates: { label: string; text: string }[];
  escalation?: string;  // 상담사 에스컬레이션 기준
  policy_notes?: string[];  // 정책 메모
}

export const CS_MANUAL: CsManualItem[] = [
  {
    id: "deposit",
    category: "입금 확인",
    icon: "💰",
    severity: "info",
    intent_keywords: ["입금", "송금", "결제", "입금했", "송금했", "보냈"],
    customer_intent: "무통장입금 했는데 확인 부탁",
    reply_templates: [
      {
        label: "기본 응대",
        text: "안녕하세요 조선팔도떡집입니다.\n입금 확인 도와드리겠습니다.\n주문번호 알려주시면 즉시 확인해드릴게요.",
      },
      {
        label: "주문번호 모를 때",
        text: "주문하신 휴대폰 번호 알려주시면 입금 확인 후 안내드리겠습니다.",
      },
      {
        label: "확인 완료",
        text: "입금 확인 완료되었습니다. 제조 시작합니다.\n수령 예정일은 별도 안내드리겠습니다.",
      },
    ],
    policy_notes: [
      "입금자명 ≠ 주문자명 케이스 자주 발생 → 주문번호 우선 확인",
      "당일 14시 이후 입금건은 익일 제조 시작",
    ],
  },
  {
    id: "delivery",
    category: "배송조회",
    icon: "🚚",
    severity: "info",
    intent_keywords: ["배송", "배송조회", "언제", "어디", "도착", "출고", "송장"],
    customer_intent: "주문 상품 어디까지 왔는지 확인",
    reply_templates: [
      {
        label: "기본 응대",
        text: "주문번호 알려주시면 배송 상태 안내드리겠습니다.\n또는 [택배사 추적 링크]에서 송장번호로 직접 조회 가능합니다.",
      },
      {
        label: "출고 전",
        text: "주문하신 상품은 #{제조일} 제조 후 발송됩니다.\n발송 완료 시 송장번호를 별도 안내드리겠습니다.",
      },
      {
        label: "배송 중",
        text: "송장번호 [XXXX-XXXX] 로 배송 중입니다.\n도착 예정일은 [날짜] 입니다.",
      },
    ],
    policy_notes: [
      "조선팔도떡집은 신선식품 — 주문→제조→출고 흐름",
      "수령예정일 명시는 필수 (제조 기간 고객 안내)",
    ],
  },
  {
    id: "agent",
    category: "상담원 연결",
    icon: "👤",
    severity: "info",
    intent_keywords: ["상담원", "상담사", "상담", "연결", "전화"],
    customer_intent: "사람과 직접 대화 원함",
    reply_templates: [
      {
        label: "기본 응대 (인증 후 자동)",
        text: "잠시만 기다려주세요. 상담사가 곧 연결됩니다.\n영업시간 외 문의는 익영업일 순차 답변드립니다.",
      },
      {
        label: "영업시간 외",
        text: "현재 영업시간이 아닙니다 (평일 9시~18시).\n남겨주신 내용 확인 후 영업시간 시작 시 우선 답변드리겠습니다.",
      },
    ],
    escalation: "이미 운영 중인 인증→상담 플로우 사용",
  },
  {
    id: "refund",
    category: "환불",
    icon: "💸",
    severity: "danger",
    intent_keywords: ["환불", "돈 돌려", "환불해", "환불요청", "환불 부탁"],
    customer_intent: "주문 환불 요청",
    reply_templates: [
      {
        label: "사유 확인 — 신중",
        text: "환불 처리 도와드리겠습니다.\n주문번호와 함께 환불 사유 알려주시면 1영업일 내 확인 후 안내드리겠습니다.",
      },
      {
        label: "상품 불량 환불",
        text: "불편 드려 죄송합니다. 상품 사진과 함께 어떤 문제인지 알려주시면 우선 처리해드리겠습니다.",
      },
      {
        label: "단순 변심",
        text: "신선식품 특성상 제조 시작 전(주문 후 1시간 이내) 취소·환불만 가능합니다.\n자세한 정책은 [환불 정책 링크] 참고 부탁드립니다.",
      },
    ],
    escalation: "🚨 자동 응대 금지 — 사유 확인 후 상담사 처리",
    policy_notes: [
      "신선식품 = 변심 환불 제한 (제조 시작 전만)",
      "불량 환불 = 사진 필수, 전액 환불 + 재발송",
      "환불 처리는 회계팀 컨펌 후 진행",
    ],
  },
  {
    id: "cancel",
    category: "주문 취소",
    icon: "🚫",
    severity: "warn",
    intent_keywords: ["취소", "주문 취소", "취소해", "취소 부탁"],
    customer_intent: "주문 취소 요청",
    reply_templates: [
      {
        label: "기본 응대",
        text: "주문 취소 도와드리겠습니다.\n주문번호 알려주시면 가능 여부 확인 후 안내드리겠습니다.",
      },
      {
        label: "제조 전 (가능)",
        text: "주문 #{주문번호} 취소 완료되었습니다.\n결제하신 수단으로 환불 처리 시작합니다.",
      },
      {
        label: "제조 시작 후 (불가)",
        text: "안내 드립니다. 주문하신 상품은 이미 제조 시작되어 취소가 어렵습니다.\n불가피한 사유라면 환불 정책 확인 후 처리 가능 여부 안내드리겠습니다.",
      },
    ],
    policy_notes: [
      "제조 시작 전 = 자유 취소, 시작 후 = 사유 확인",
      "결제수단별 환불 소요시간 안내 (카드 3-5일, 무통장 1일)",
    ],
  },
  {
    id: "exchange",
    category: "교환·반품",
    icon: "🔄",
    severity: "warn",
    intent_keywords: ["교환", "반품", "바꿔", "다시 보내"],
    customer_intent: "받은 상품 교환·반품",
    reply_templates: [
      {
        label: "사유 확인",
        text: "교환·반품 도와드리겠습니다.\n상품 사진과 함께 어떤 문제인지 알려주시면 우선 처리해드리겠습니다.",
      },
      {
        label: "공장 책임 (재발송)",
        text: "불편 드려 죄송합니다.\n바로 재발송 도와드리겠습니다. 발송 후 송장번호 별도 안내드리겠습니다.",
      },
    ],
    policy_notes: [
      "신선식품 = 단순 교환 제한, 사유 있어야 처리",
      "재발송 = 사진 필수, 회수 안 함",
    ],
  },
  {
    id: "defect",
    category: "불량·상품이상",
    icon: "⚠️",
    severity: "danger",
    intent_keywords: ["불량", "곰팡이", "변질", "상했", "이상", "썩었", "터졌", "찢어"],
    customer_intent: "받은 상품에 문제 있음",
    reply_templates: [
      {
        label: "사과 + 사진 요청",
        text: "정말 죄송합니다.\n불편 드린 상품 사진과 함께 어떤 문제인지 알려주시면 즉시 재발송 또는 환불 처리해드리겠습니다.",
      },
      {
        label: "재발송 결정",
        text: "확인되었습니다. 바로 재발송 도와드리겠습니다.\n발송 후 송장번호 별도 안내드리겠습니다. 추가 불편 없도록 제조 검수 강화하겠습니다.",
      },
    ],
    escalation: "🚨 즉시 응대 — 사진 받고 공장 보고 + 재발송 또는 환불 결정. 답변 지연 시 부정 리뷰 위험.",
    policy_notes: [
      "신선식품 클레임 = 회사 이미지 직결, 최우선 처리",
      "공장 책임 케이스는 회계팀 보고",
      "고객 책임 케이스(보관 미흡 등)도 일부 보상 권장",
    ],
  },
  {
    id: "delay",
    category: "배송지연",
    icon: "⏰",
    severity: "warn",
    intent_keywords: ["안 왔", "안와", "안왔", "도착 안", "늦어", "지연", "왜 안", "왜 아직"],
    customer_intent: "예상보다 배송 늦음",
    reply_templates: [
      {
        label: "사과 + 추적",
        text: "배송 지연으로 불편 드려 죄송합니다.\n주문번호 알려주시면 택배사 추적 후 정확한 도착 예정일 안내드리겠습니다.",
      },
      {
        label: "택배사 사유 (보상안)",
        text: "확인 결과 택배사 사정으로 지연되고 있습니다.\n예상 도착일은 [날짜] 입니다. 지연에 대한 사과의 의미로 [쿠폰/할인] 발송해드렸습니다.",
      },
    ],
    policy_notes: [
      "신선식품 = 지연 = 변질 위험 → 도착 즉시 사진 확인 요청",
      "공장 책임 지연 = 보상안 적극 제안",
      "택배사 책임 = 사과 + 추적 안내 (보상은 케이스별)",
    ],
  },
  {
    id: "complaint",
    category: "강한 불만",
    icon: "🔥",
    severity: "danger",
    intent_keywords: ["진짜", "최악", "실망", "별로", "짜증", "화가", "신고", "소비자보호원", "법적"],
    customer_intent: "감정적 불만 표출",
    reply_templates: [
      {
        label: "사과 + 즉시 응대",
        text: "고객님 정말 죄송합니다. 불편 드린 부분 진심으로 사과드립니다.\n어떤 부분이 문제였는지 자세히 알려주시면 즉시 처리해드리겠습니다.",
      },
      {
        label: "상담사 전환",
        text: "더 정확한 처리를 위해 상담사가 직접 연락드리겠습니다.\n잠시만 기다려주시면 빠르게 연결드리겠습니다.",
      },
    ],
    escalation: "🚨🚨 즉시 상담사 전환 — 자동 응대 절대 금지. 감정 응대 후 사실 확인, 보상안 적극 제시.",
    policy_notes: [
      "감정적 응대보다 사실 인정 + 진심 사과 우선",
      "법적/언론 언급 시 경영팀 즉시 보고",
    ],
  },
  {
    id: "order_inquiry",
    category: "주문 문의",
    icon: "📋",
    severity: "info",
    intent_keywords: ["주문", "문의", "주문했", "주문 확인", "확인 부탁"],
    customer_intent: "주문 관련 일반 문의",
    reply_templates: [
      {
        label: "기본 응대",
        text: "주문번호 또는 휴대폰 번호 알려주시면 확인 후 안내드리겠습니다.",
      },
      {
        label: "상품 문의",
        text: "문의하신 상품에 대해 안내드리겠습니다.\n구체적으로 어떤 부분이 궁금하신가요?",
      },
    ],
  },
];

// 메시지 → 카테고리 자동 매칭 (intent_keywords 포함시)
export function classifyMessage(message: string): CsManualItem[] {
  const matched: CsManualItem[] = [];
  for (const item of CS_MANUAL) {
    if (item.intent_keywords.some((kw) => message.includes(kw))) {
      matched.push(item);
    }
  }
  // severity 위험한 거 우선
  matched.sort((a, b) => {
    const order = { danger: 0, warn: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  return matched;
}
