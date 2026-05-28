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

// 톤 = 실제 운영 답변 그대로 (cs_messages 발신 답변 분석 기반):
// "고객님 ^^", "소중한", "맛있게 쪄서", "정성껏 준비해서", "조선팔도떡집 믿고 주문해 주셔서 감사합니다^^"
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
        label: "확인 부탁 — 정보 요청",
        text: "안녕하세요, 고객님 ^^\n\n성함과 연락처 뒷자리 4자리 알려주시면\n저희가 확인해서 안내드리겠습니다!",
      },
      {
        label: "입금 확인 완료 (오늘 출고)",
        text: "소중한 입금 잘 확인되었습니다!\n주문하신 떡은 오늘 맛있게 쪄서 발송해 드릴게요.\n저희 조선팔도떡집 믿고 주문해 주셔서 감사합니다 ^^\n정성껏 준비해서 보내드릴게요!",
      },
      {
        label: "입금 확인 완료 (내일 출고 — 14시 이후)",
        text: "소중한 입금 잘 확인되었습니다!\n오늘은 출고가 마감되어, 주문하신 떡은 내일 맛있게 쪄서 발송해 드릴게요.\n정성껏 준비해서 보내드릴게요!\n저희 조선팔도떡집 믿고 주문해 주셔서 감사합니다 ^^",
      },
    ],
    policy_notes: [
      "입금자명 ≠ 주문자명 케이스 자주 발생 → 성함+연락처 뒷자리 4자리 받기",
      "당일 14시 이전 입금 = 당일 출고, 이후 = 익일 출고",
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
        label: "확인 부탁 — 정보 요청",
        text: "안녕하세요, 고객님 ^^\n\n성함과 연락처 뒷자리 4자리 알려주시면\n주문 내역 확인해서 배송 상태 안내드릴게요!",
      },
      {
        label: "출고 전 안내",
        text: "확인해드릴게요!\n주문하신 떡은 #{제조일} 맛있게 쪄서 발송될 예정이에요.\n발송 완료되면 송장번호 별도 안내드릴게요 ^^",
      },
      {
        label: "출고 완료 안내",
        text: "주문하신 상품 발송 완료되었어요!\n송장번호는 #{송장번호} 이고, 보통 1~2일 내 도착 예정이에요.\n맛있게 드세요 ^^",
      },
    ],
    policy_notes: [
      "신선식품 = 주문→제조→출고 (당일/익일 출고)",
      "공식 사이트 로그인 → 주문/배송조회 메뉴에서 직접 조회 가능",
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
        label: "전화번호 안내 요청",
        text: "안녕하세요 ^^\n\n상담을 위해 휴대폰 번호 (-없이 숫자만) 입력해 주시면\n인증 후 바로 상담 도와드릴게요!",
      },
      {
        label: "영업시간 외 안내",
        text: "지금은 상담 가능 시간이 아닙니다 (평일 9시~18시).\n남겨주신 내용 확인하고 영업시간에 우선 답변드릴게요 ^^",
      },
    ],
    escalation: "이미 운영 중인 인증→상담 플로우",
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
        label: "사유 확인 — 정보 요청",
        text: "고객님, 불편을 드려 죄송합니다.\n\n성함과 연락처 뒷자리 4자리,\n그리고 환불 사유 간단히 알려주시면\n저희가 확인 후 빠르게 처리해드릴게요.",
      },
      {
        label: "상품 불량 환불",
        text: "불편 드려 죄송합니다.\n상품 사진 한 장 보내주시면 확인 후\n재발송 또는 환불 처리 도와드릴게요!",
      },
      {
        label: "단순 변심 — 정책 안내",
        text: "고객님, 안내드릴게요.\n신선식품 특성상 제조 시작 후에는 변심 환불이 어려운 점\n양해 부탁드립니다.\n다른 사유가 있으시면 말씀해 주세요.",
      },
    ],
    escalation: "🚨 자동 응대 금지 — 사유 확인 후 상담사 처리. 회계팀 컨펌 후 진행.",
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
        label: "확인 부탁 — 정보 요청",
        text: "안녕하세요 ^^\n주문 취소 도와드릴게요!\n\n성함과 연락처 뒷자리 4자리 알려주시면\n바로 확인해서 안내드릴게요.",
      },
      {
        label: "취소 완료 (제조 전)",
        text: "주문 취소 완료되었습니다!\n결제하신 수단으로 환불 처리 시작했어요.\n다음에 또 뵐게요 ^^",
      },
      {
        label: "취소 불가 (제조 시작 후)",
        text: "고객님, 주문하신 떡은 이미 제조 중이라\n취소가 어려운 점 양해 부탁드립니다.\n불편하신 부분 있으시면 말씀해 주세요.",
      },
    ],
    policy_notes: [
      "제조 시작 전 = 자유 취소, 시작 후 = 사유 확인",
      "결제수단별 환불 소요: 카드 3-5일, 무통장 1일",
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
        label: "사유 확인 — 사진 요청",
        text: "불편 드려 죄송합니다.\n상품 사진 한 장 보내주시면 확인 후\n빠르게 처리해드릴게요.",
      },
      {
        label: "재발송 — 공장 책임",
        text: "죄송합니다.\n바로 새 상품으로 재발송 도와드릴게요!\n발송되면 송장번호 별도 안내드릴게요.",
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
        text: "고객님, 죄송합니다.\n상품 사진 한 장 보내주시면\n확인 후 재발송 또는 환불 처리해드릴게요.",
      },
      {
        label: "재발송 결정 + 사과",
        text: "확인되었습니다.\n바로 새 상품으로 재발송 도와드릴게요.\n발송되면 송장번호 별도 안내드릴게요!\n앞으로 검수 더 꼼꼼히 챙기겠습니다.",
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
        label: "사과 + 추적 안내",
        text: "배송 지연으로 불편 드려 죄송합니다.\n성함과 연락처 뒷자리 4자리 알려주시면\n택배사 추적 후 도착 예정일 안내드릴게요!",
      },
      {
        label: "택배사 사유 — 보상 안내",
        text: "확인해보니 택배사 사정으로 지연되고 있습니다.\n예상 도착일은 #{도착일}입니다.\n지연에 대한 사과로 #{쿠폰/할인} 보내드렸어요.\n양해 부탁드립니다 ^^",
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
        text: "불편 드려 죄송합니다.\n어떤 부분이 문제였는지 자세히 알려주시면\n즉시 확인하고 처리해드릴게요.",
      },
      {
        label: "상담사 직접 연결",
        text: "더 정확한 처리를 위해\n담당자가 직접 연락드릴게요!\n잠시만 기다려 주시면 빠르게 연결드리겠습니다.",
      },
    ],
    escalation: "🚨🚨 즉시 상담사 전환 — 자동 응대 절대 금지. 사실 확인 후 보상안 적극 제시.",
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
        label: "확인 부탁 — 정보 요청",
        text: "안녕하세요, 고객님 ^^\n\n성함과 연락처 뒷자리 4자리 알려주시면\n주문 내역 확인해서 안내드릴게요!",
      },
      {
        label: "상품 문의",
        text: "안녕하세요 ^^\n문의 주신 상품에 대해 안내드릴게요!\n\n구체적으로 어떤 부분이 궁금하신지 말씀해 주시면\n자세히 알려드릴게요.",
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
