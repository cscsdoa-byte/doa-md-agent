"""factory-list.md → supplier-import 용 JSON 변환.

표 구조: | # | 공장명 | 지역 | 주력 카테고리 | 추정 규모 | 컨택 단서 | 발굴 출처 | 메모 |
섹션 헤더로 카테고리 분류:
  ## 1) 떡류 ... → 떡류
  ## 2) 냉동떡 ... → 냉동떡
  ## 3) 한과 ... → 한과
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "data" / "factory-list.md"
DST = Path(__file__).resolve().parent.parent / "data" / "factory-list.json"

SECTION_PATTERNS = [
    (re.compile(r"^## 1\)"), "떡류"),
    (re.compile(r"^## 2\)"), "냉동떡"),
    (re.compile(r"^## 3\)"), "한과"),
]
# 검증/주의 섹션은 import 대상 아님
STOP_PATTERN = re.compile(r"^## (검증|다음 단계|출처|컨택 우선순위)")

PHONE_RE = re.compile(r"0\d{1,2}-\d{3,4}-\d{4}")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
DOMAIN_RE = re.compile(r"\b([\w-]+\.(?:com|kr|net|co\.kr|or\.kr|modoo\.at))\b")

SCALE_NORMALIZE = {
    "소규모(공방)": "소규모(공방)",
    "소규모": "소규모(공방)",
    "공방": "소규모(공방)",
    "중소(중견)": "중소",
    "중소": "중소",
    "중대형": "중대형",
}


def parse_contact_cell(cell: str) -> dict:
    """컨택 단서 셀에서 phone/email/homepage 추출."""
    out: dict = {}
    # 명백한 오류/확인필요 마커가 있으면 phone 미채움
    has_invalid = any(
        kw in cell for kw in ("확인필요", "검증필요", "검증 필요", "오류", "확인 필요", "미확인")
    )
    phones = PHONE_RE.findall(cell)
    if phones and not has_invalid:
        out["phone"] = phones[0]
    emails = EMAIL_RE.findall(cell)
    if emails:
        out["email"] = emails[0]
    domains = DOMAIN_RE.findall(cell)
    if domains:
        # 이메일 도메인 부분 매칭 방지
        for d in domains:
            if not any(d in e for e in emails):
                out["homepage"] = d if d.startswith("http") else f"https://{d}"
                break
    return out


def parse_row(row: str, category: str) -> dict | None:
    """| # | 공장명 | 지역 | 주력 | 규모 | 컨택 | 출처 | 메모 |"""
    parts = [c.strip() for c in row.split("|")]
    # 양 끝 공백 셀 제거: ['', '#', 'name', ..., 'memo', '']
    parts = [p for p in parts if p != ""] if parts and parts[0] == "" else parts
    if len(parts) < 8:
        return None
    _idx, name, region, subcategory, scale_raw, contact_cell, source, notes = parts[:8]
    if not name or name == "공장/상호명":
        return None
    # name 정리 — bold 마크다운 ** 제거
    name = re.sub(r"\*\*", "", name).strip()
    if not name:
        return None
    out: dict = {
        "name": name,
        "category": category,
        "address": region if not region.startswith("(") else None,  # "(지역 확인필요)" 같은 건 비움
        "scale": SCALE_NORMALIZE.get(scale_raw.strip(), None),
        "source": source if source else None,
        "notes": _build_notes(subcategory, notes),
    }
    out.update(parse_contact_cell(contact_cell))
    # None 값 정리
    return {k: v for k, v in out.items() if v not in (None, "")}


def _build_notes(subcategory: str, notes: str) -> str | None:
    parts = []
    if subcategory:
        parts.append(f"주력: {subcategory}")
    if notes:
        # bold 마크다운 정리
        notes_clean = re.sub(r"\*\*", "", notes).strip()
        if notes_clean:
            parts.append(notes_clean)
    return " | ".join(parts) if parts else None


def main() -> int:
    text = SRC.read_text(encoding="utf-8")
    lines = text.splitlines()
    current_category: str | None = None
    rows: list[dict] = []
    stats = {"떡류": 0, "냉동떡": 0, "한과": 0, "skipped_invalid_phone": 0}

    for line in lines:
        if STOP_PATTERN.match(line):
            current_category = None
            continue
        for pat, cat in SECTION_PATTERNS:
            if pat.match(line):
                current_category = cat
                break
        if not current_category:
            continue
        if not line.startswith("|"):
            continue
        # 헤더/구분 행 스킵
        if line.startswith("|---") or "공장/상호명" in line:
            continue
        parsed = parse_row(line, current_category)
        if parsed:
            rows.append(parsed)
            stats[current_category] += 1
            if "phone" not in parsed:
                stats["skipped_invalid_phone"] += 1

    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✓ {DST} 생성: 총 {len(rows)}곳")
    print(f"  - 떡류: {stats['떡류']}")
    print(f"  - 냉동떡: {stats['냉동떡']}")
    print(f"  - 한과: {stats['한과']}")
    print(f"  - 전화번호 비어있음(검증필요): {stats['skipped_invalid_phone']}곳")
    print()
    print("샘플 3건:")
    for r in rows[:3]:
        print(f"  - {r.get('name')} [{r.get('category')}] {r.get('address', '')} · {r.get('phone', '(전화미확보)')}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
