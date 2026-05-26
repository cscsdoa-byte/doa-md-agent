"""제목 파서 + 도아 적합도 매칭.

제목에서 카테고리(`[신선]` 같은 머리표)와 마감일을 추출.
한국어 자연어 날짜(`~5/26(화) 자정까지`, `~ 05/26`)에 대응.
"""

from __future__ import annotations

import re
from datetime import datetime, time

CATEGORY_PATTERN = re.compile(r"^\s*\[([^\]]+)\]")

# "~5/26", "~ 05/26", "~5/26(화)" 패턴
DEADLINE_PATTERN = re.compile(
    r"~\s*(\d{1,2})\s*/\s*(\d{1,2})(?:\s*\([월화수목금토일]\))?"
)

# 시간대 힌트 (있으면 적용, 없으면 23:59 = 자정 직전)
TIME_HINT_PATTERNS: list[tuple[re.Pattern, time]] = [
    (re.compile(r"자정까지|자정\s*마감"), time(23, 59)),
    (re.compile(r"오전까지|정오까지|12시까지"), time(12, 0)),
    (re.compile(r"오후까지"), time(18, 0)),
]

# 떡집(조선팔도떡집) 적합 카테고리 / 키워드
DOA_FRIENDLY_CATEGORIES = {
    "신선", "식품", "푸드", "푸드페스타", "푸드딜",
    "건강", "선물", "디저트", "한식", "오늘끝딜", "라이브",
    "쇼핑라이브", "쇼핑라이브_기준완화", "활용Tip",
}
DOA_PRODUCT_KEYWORDS = [
    "떡", "설기", "두쫀모", "쑥콩", "밤설기", "서리태",
    "쑥버무리", "한과", "디저트", "전통", "신선식품", "식품",
    "푸드", "건강식품", "선물", "명절",
]


def parse_category(title: str) -> str | None:
    m = CATEGORY_PATTERN.match(title)
    if not m:
        return None
    raw = m.group(1).strip()
    # `[쇼핑라이브_기준완화!]` 같이 ! 붙은 거 정리
    return raw.rstrip("!?★☆").strip()


def parse_deadline(title: str, posted_at: datetime | None = None) -> datetime | None:
    """제목에서 마감일 추출. 년도는 posted_at 기준, 없으면 오늘."""
    matches = list(DEADLINE_PATTERN.finditer(title))
    if not matches:
        return None
    # 마지막 매칭이 보통 마감일 (앞쪽은 행사 기간일 수 있음)
    m = matches[-1]
    month = int(m.group(1))
    day = int(m.group(2))
    base = posted_at or datetime.now()
    year = base.year
    # 마감일이 base 보다 6개월 이상 과거면 다음해로 추정
    candidate = datetime(year, month, day)
    if (base - candidate).days > 180:
        candidate = datetime(year + 1, month, day)
    # 시간 힌트 적용
    for pat, t in TIME_HINT_PATTERNS:
        if pat.search(title):
            return candidate.replace(hour=t.hour, minute=t.minute)
    return candidate.replace(hour=23, minute=59)


# 카테고리/제목 → 행사 유형(event_type) 추정 매핑.
# event_type 은 사용자 노션 컬럼 — "기획전/타임특가/오늘끝딜/라이브/모집..." 같은 행사 형태.
# (category 는 채널이 분류한 [신선]/[리빙] 같은 머리표 → 다른 축)
EVENT_TYPE_BY_TAG: list[tuple[str, str]] = [
    ("오늘끝딜",   "오늘끝딜"),
    ("타임특가",   "타임특가"),
    ("타임딜",     "타임특가"),
    ("쇼핑라이브", "라이브"),
    ("라이브",     "라이브"),
    ("기획전",     "기획전"),
    ("푸드페스타", "기획전"),
    ("푸드딜",     "기획전"),
    ("모집",       "모집"),
    ("제안",       "모집"),
    ("입점",       "모집"),
]


def parse_event_type(title: str, category: str | None) -> str | None:
    """카테고리/제목에서 event_type 자동 추정. 못 잡으면 None.

    우선순위:
      1) category 머리표가 매핑 테이블에 있으면 그 값
      2) 제목 본문에 키워드 있으면 그 값
    """
    if category:
        norm = category.replace(" ", "")
        for tag, etype in EVENT_TYPE_BY_TAG:
            if tag in norm:
                return etype
    norm_title = title.replace(" ", "")
    for tag, etype in EVENT_TYPE_BY_TAG:
        if tag in norm_title:
            return etype
    return None


def is_doa_fit(title: str, category: str | None) -> bool:
    if category:
        clean = category.replace(" ", "")
        for tag in DOA_FRIENDLY_CATEGORIES:
            if tag in clean:
                return True
    for kw in DOA_PRODUCT_KEYWORDS:
        if kw in title:
            return True
    return False
