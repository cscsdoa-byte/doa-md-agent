"""이지데스크 (EZDesk) CS .xls export 파서.

실제 파일은 HTML 포맷으로 저장된 .xls (Excel 바이너리 아님).
구조 특수: `</tr>` 만 있고 `<tr>` 여는 태그 없음 → BeautifulSoup/lxml 표준 파싱 안 됨.
→ 직접 `</tr>` 로 split 후 `<td>...</td>` 정규식 추출.

11 컬럼: 전송일 / 전송시간 / 경로 / 발신자 / 수신번호·이름 / 채널 / 채널명 / 메세지 / 상태 / 최초수신 / 최초발신
- 상태: "수신" = 인입, "발신" = 발신 (자동응답·캔드답변 포함)
- 채널: "카카오" / "SMS" / "네이버" / 기타
- 경로: "DESK" = 상담원, 빈 칸 = 챗봇/자동
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterator

# 컬럼 정의 — header 순서 그대로
COLUMNS = (
    "date", "time", "route", "sender", "receiver",
    "channel", "channel_name", "message", "status",
    "first_receive_at", "first_send_at",
)

TR_SPLIT = re.compile(r"</tr>", re.IGNORECASE)
TD_PATTERN = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL | re.IGNORECASE)
TAG_STRIP = re.compile(r"<[^>]+>")


def _clean_cell(raw: str) -> str:
    """HTML 태그 제거 + 공백 정리 (메시지 내 줄바꿈은 보존)."""
    if not raw:
        return ""
    # <br> → \n 로 변환 (메시지 내 줄바꿈)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    text = TAG_STRIP.sub(" ", raw)
    # 다중 공백 단일화 (단 줄바꿈은 보존)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln or True).strip()


def parse_ezdesk_xls(path: str | Path) -> Iterator[dict]:
    """파일에서 row dict 시퀀스 생성. 헤더는 skip."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    html = p.read_text(encoding="utf-8", errors="replace")
    chunks = TR_SPLIT.split(html)
    if not chunks:
        return
    # 첫 chunk = 헤더 (또는 헤더+첫 데이터 섞임). 컬럼 수로 검증.
    for ci, chunk in enumerate(chunks):
        cells_raw = TD_PATTERN.findall(chunk)
        if len(cells_raw) < len(COLUMNS):
            continue  # 컬럼 부족 → 헤더 또는 파편
        cells = [_clean_cell(c) for c in cells_raw[: len(COLUMNS)]]
        # 헤더 행 스킵 — 첫 컬럼이 "전송일" 같은 라벨이면 헤더
        if ci == 0 and cells[0] in ("전송일", "date") or cells[0] == "":
            continue
        # 데이터 row — 날짜 형식 (YYYY-MM-DD) 검증
        if not re.match(r"\d{4}-\d{2}-\d{2}", cells[0]):
            continue
        yield dict(zip(COLUMNS, cells))


def parse_ezdesk_bytes(content: bytes) -> Iterator[dict]:
    """업로드된 bytes 직접 파싱 (임시 파일 안 거치고)."""
    try:
        html = content.decode("utf-8")
    except UnicodeDecodeError:
        html = content.decode("cp949", errors="replace")
    chunks = TR_SPLIT.split(html)
    for ci, chunk in enumerate(chunks):
        cells_raw = TD_PATTERN.findall(chunk)
        if len(cells_raw) < len(COLUMNS):
            continue
        cells = [_clean_cell(c) for c in cells_raw[: len(COLUMNS)]]
        if not re.match(r"\d{4}-\d{2}-\d{2}", cells[0]):
            continue
        yield dict(zip(COLUMNS, cells))
