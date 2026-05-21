"""슬랙 알림 — 마감 임박 행사 / 라이브 행사 / 신규 도아 적합 공고.

사용:  uv run python -m crawler.notify        # 한 번 알림
       uv run python -m crawler.notify --dry  # 슬랙 전송 없이 콘솔에만 출력

매일 / 매시간 작업 스케줄러로 호출하는 것이 본 용도.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

from .store import connect, list_recent, list_recent_no_deadline

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CHANNEL_NAMES = {
    "naver_smartstore": "네이버",
    "kakao_talkstore": "카카오 톡스토어",
    "coupang_wing": "쿠팡",
    "11st_soffice": "11번가",
    "toss_shopping": "토스",
    "esmplus": "G마켓/옥션",
    "ns_homeshopping": "NS홈쇼핑",
    "shoppingnT": "쇼핑엔티",
    "fanfandaero": "판판대로",
    "sellernow": "셀러나우",
    "onmd_mdlounge": "ONMD",
    "iboss": "아이보스",
}

# 알림 상태 캐시 — 같은 행사 같은 날에 중복 알림 안 가게
STATE_PATH = Path(__file__).resolve().parent.parent / "data" / "notify_state.json"


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def build_message() -> tuple[str, list[dict]]:
    """슬랙으로 보낼 메시지 본문 + 알림 대상 행사 목록."""
    lines = [f"📅 *도아 MD 일일 행사 알림* — {datetime.now().strftime('%Y-%m-%d %H:%M')}"]
    notified: list[dict] = []

    with connect() as conn:
        # 오늘/내일 마감 (도아 적합, 미진행)
        urgent = list_recent(conn, limit=30, doa_only=True, upcoming_days=2)
        urgent = [
            dict(r) for r in urgent
            if r["status"] not in ("closed", "skip", "running", "selected")
        ]
        today_d = []
        tomorrow_d = []
        for e in urgent:
            if not e["deadline_at"]:
                continue
            try:
                d = datetime.fromisoformat(e["deadline_at"])
            except ValueError:
                continue
            days = (d.date() - datetime.now().date()).days
            if days == 0:
                today_d.append(e)
            elif days == 1:
                tomorrow_d.append(e)

        # 마감 미상 — 최근 게시
        nodl = list_recent_no_deadline(conn, limit=10, doa_only=True, posted_within_days=2)

        # 진행중
        running = [
            dict(r) for r in conn.execute(
                "SELECT * FROM events WHERE status = 'running' ORDER BY sale_start"
            )
        ]

    def _fmt(e: dict) -> str:
        ch = CHANNEL_NAMES.get(e["channel_key"], e["channel_key"])
        cat = f"[{e['category']}] " if e.get("category") else ""
        return f"• *{ch}* {cat}{e['title']}\n  → {e['url']}"

    if today_d:
        lines.append(f"\n🚨 *오늘 자정 마감 — {len(today_d)}건* (지금 신청!)")
        for e in today_d:
            lines.append(_fmt(e))
            notified.append({"id": e["dedup_id"], "kind": "today"})

    if tomorrow_d:
        lines.append(f"\n⚠️ *내일 마감 — {len(tomorrow_d)}건*")
        for e in tomorrow_d:
            lines.append(_fmt(e))
            notified.append({"id": e["dedup_id"], "kind": "tomorrow"})

    if running:
        lines.append(f"\n🔴 *진행 중 — {len(running)}건*")
        for e in running:
            period = ""
            if e["sale_start"] and e["sale_end"]:
                period = f" ({e['sale_start'][:10]}~{e['sale_end'][:10]})"
            ch = CHANNEL_NAMES.get(e["channel_key"], e["channel_key"])
            lines.append(f"• *{ch}*{period} {e['title']}")

    if nodl:
        recent = [dict(r) for r in nodl][:5]
        lines.append(f"\n🆕 *최근 게시 — 마감일 미상* (확인 필요)")
        for e in recent:
            lines.append(_fmt(e))
            notified.append({"id": e["dedup_id"], "kind": "nodl"})

    if len(lines) == 1:
        lines.append("\n(알림 대상 없음 — 오늘은 조용한 날)")

    return "\n".join(lines), notified


def main() -> None:
    p = argparse.ArgumentParser(description="도아 MD 슬랙 알림")
    p.add_argument("--dry", action="store_true", help="슬랙 전송 안 하고 콘솔에만 출력")
    p.add_argument(
        "--force",
        action="store_true",
        help="알림 상태 캐시 무시하고 강제 전송 (중복 알림 가능)",
    )
    args = p.parse_args()

    message, notified = build_message()

    if args.dry:
        print(message)
        print(f"\n[dry-run] 알림 대상 {len(notified)}건 — 슬랙 전송 안 함")
        return

    # 중복 알림 방지 — 같은 날 같은 행사·같은 kind 는 한 번만
    state = load_state()
    today_key = datetime.now().strftime("%Y-%m-%d")
    today_state = state.get(today_key, [])
    today_set = set(json.dumps(x, sort_keys=True) for x in today_state)
    new_items = [n for n in notified if json.dumps(n, sort_keys=True) not in today_set]

    if not new_items and not args.force:
        print(f"[notify] 오늘 이미 알린 행사만 있음 — 슬랙 전송 생략 ({len(notified)}건)")
        return

    webhook = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    if not webhook:
        print("ERROR: SLACK_WEBHOOK_URL 이 .env 에 없음", file=sys.stderr)
        print("\n--- 슬랙으로 보낼 내용 (dry) ---\n")
        print(message)
        sys.exit(2)

    r = httpx.post(webhook, json={"text": message}, timeout=15)
    if r.status_code >= 400:
        print(f"ERROR: 슬랙 전송 실패 {r.status_code}: {r.text[:200]}", file=sys.stderr)
        sys.exit(1)

    # state 갱신
    today_state.extend(new_items)
    state[today_key] = today_state
    # 7일 지난 state 정리
    cutoff = datetime.now().strftime("%Y-%m-%d")
    state = {k: v for k, v in state.items() if k >= cutoff or (datetime.strptime(cutoff, "%Y-%m-%d") - datetime.strptime(k, "%Y-%m-%d")).days < 7}
    save_state(state)

    print(f"✓ 슬랙 전송 완료 — 신규 {len(new_items)}건 알림")


if __name__ == "__main__":
    main()
