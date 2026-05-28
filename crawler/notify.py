"""슬랙 알림 — 마감 임박 행사 / 라이브 행사 / 신규 도아 적합 공고 + 셀러센터 세션 만료.

사용:  uv run python -m crawler.notify        # 한 번 알림
       uv run python -m crawler.notify --dry  # 슬랙 전송 없이 콘솔에만 출력

매일 / 매시간 작업 스케줄러로 호출하는 것이 본 용도.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import yaml
from dotenv import load_dotenv

from .store import connect, list_recent, list_recent_no_deadline

CHANNELS_YAML = Path(__file__).resolve().parent / "channels.yaml"
STORAGE_DIR = Path(__file__).resolve().parent / "storage"
# 셀러센터 세션은 보통 30일 정도 유지 — 25일 넘으면 갱신 권장
SESSION_WARN_DAYS = 25
# 정산자동화웹 JWT 만료 임박 알림 임계 (시간)
SETTLE_TOKEN_WARN_HOURS = 2

# 카니발 검출에서 ACTIVE 상태 (검출 대상 — Calendar 의 conflict.ts 와 동일)
CANNIBAL_ACTIVE = {"new", "reviewing", "applied", "selected", "running"}
# 회의록(2026-05-20) — "네이버↔카카오만 카니발 금지". 다른 채널 겹침은 OK.
CANNIBAL_BLOCKED_PAIRS = frozenset({
    frozenset({"naver_smartstore", "kakao_talkstore"}),
})


def _is_blocked_pair(a: str, b: str) -> bool:
    return frozenset({a, b}) in CANNIBAL_BLOCKED_PAIRS

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
    "k_shopping": "K쇼핑",
    "lotte_homeshopping": "롯데홈쇼핑",
    "homeshopping_moa": "홈쇼핑모아",
    "gongyoung_homeshopping": "공영홈쇼핑",
    "cj_onstyle": "CJ온스타일",
    "shinsegae_homeshopping": "신세계홈쇼핑",
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


def detect_cannibal_conflicts() -> list[dict]:
    """카니발(같은 SKU·겹치는 기간·다른 채널) 행사 페어 검출.

    Calendar 의 conflict.ts 로직과 동일. 반환은 페어 dedup 된 리스트:
    [{a: {short, title, channel}, b: {short, title, channel}, common_skus: [ids]}, ...]
    """
    with connect() as conn:
        rows = conn.execute(
            "SELECT dedup_id, channel_key, title, status, sale_start, sale_end, applied_skus_json "
            "FROM events "
            "WHERE status IN ('new','reviewing','applied','selected','running') "
            "  AND applied_skus_json IS NOT NULL "
            "  AND sale_start IS NOT NULL AND sale_end IS NOT NULL"
        ).fetchall()
    events: list[dict] = []
    for r in rows:
        d = dict(r)
        try:
            skus = {int(s.get("sku_id")) for s in json.loads(d["applied_skus_json"] or "[]") if s.get("sku_id")}
        except Exception:
            skus = set()
        if not skus:
            continue
        d["_skus"] = skus
        events.append(d)

    pairs: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for a in events:
        for b in events:
            if a["dedup_id"] == b["dedup_id"]:
                continue
            if a["channel_key"] == b["channel_key"]:
                continue
            if not _is_blocked_pair(a["channel_key"], b["channel_key"]):
                continue
            key = tuple(sorted([a["dedup_id"], b["dedup_id"]]))
            if key in seen:
                continue
            if a["sale_end"][:10] < b["sale_start"][:10]:
                continue
            if b["sale_end"][:10] < a["sale_start"][:10]:
                continue
            common = sorted(a["_skus"] & b["_skus"])
            if not common:
                continue
            seen.add(key)
            pairs.append({
                "a": {"short": a["dedup_id"][:6], "title": a["title"], "channel": a["channel_key"]},
                "b": {"short": b["dedup_id"][:6], "title": b["title"], "channel": b["channel_key"]},
                "common_skus": common,
            })
    return pairs


def detect_setup_incomplete() -> list[dict]:
    """진행 중이거나 시작 임박(D-0/D-1)인 selected/running 행사 중 셋업 누락 검출.

    누락 = SKU 미등록(applied_skus_json 비어있음) 또는 매출 매칭 미실행(sales_json 없음).
    오늘 사고 패턴(fa8f08 NS홈쇼핑 selected · 5/28 시작 · SKU 미등록) 방지용.

    반환: [{short, title, channel, status, sale_start, sale_end, issues:[...]}]
    """
    with connect() as conn:
        rows = conn.execute(
            """SELECT dedup_id, channel_key, title, status, sale_start, sale_end,
                      applied_skus_json, sales_json
               FROM events
               WHERE status IN ('selected','running')
                 AND sale_start IS NOT NULL"""
        ).fetchall()
    today = datetime.now().date()
    out: list[dict] = []
    for r in rows:
        try:
            start = datetime.fromisoformat(r["sale_start"][:10]).date()
            end = datetime.fromisoformat(r["sale_end"][:10]).date() if r["sale_end"] else start
        except (ValueError, TypeError):
            continue
        # 시작 D-1 이내 ~ 종료까지 (이미 끝난 건 회고 알림에 맡김)
        if (start - today).days > 1 or today > end:
            continue
        sku_empty = not r["applied_skus_json"] or r["applied_skus_json"].strip() in ("", "[]")
        sales_empty = not r["sales_json"]
        issues = []
        if sku_empty:
            issues.append("SKU 미등록")
        if not sku_empty and sales_empty:
            issues.append("매출 매칭 미실행")
        if not issues:
            continue
        out.append({
            "short": r["dedup_id"][:6],
            "title": r["title"],
            "channel": r["channel_key"],
            "status": r["status"],
            "sale_start": r["sale_start"][:10],
            "sale_end": (r["sale_end"] or r["sale_start"])[:10],
            "issues": issues,
        })
    return out


def detect_retro_pending() -> list[dict]:
    """closed + sale_end 가 오늘 ~ 14일 전 사이 + ops_retro_note 비어있는 행사.

    회고 미작성 알림 대상 (page.tsx 의 retroPendingCount 와 동일 로직).
    """
    with connect() as conn:
        rows = conn.execute(
            """SELECT dedup_id, title, sale_end, ops_retro_note
               FROM events
               WHERE status = 'closed'
                 AND sale_end IS NOT NULL"""
        ).fetchall()
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=14)
    out: list[dict] = []
    for r in rows:
        try:
            end = datetime.fromisoformat(r["sale_end"][:10])
        except Exception:
            continue
        if end > today or end < cutoff:
            continue
        if (r["ops_retro_note"] or "").strip():
            continue
        out.append({"short": r["dedup_id"][:6], "title": r["title"], "sale_end": r["sale_end"]})
    return out


def check_settle_token_expiry() -> dict | None:
    """SETTLE_API_TOKEN JWT exp 디코드 → 만료 임박/만료 상태 반환.

    반환: None = 토큰 정상(여유 있음).
          {status: 'missing'|'expired'|'expiring', hours_left?: float}
    """
    token = (os.getenv("SETTLE_API_TOKEN") or "").strip()
    if not token:
        return {"status": "missing"}
    parts = token.split(".")
    if len(parts) != 3:
        return {"status": "missing"}  # 비정상 형식 = 사실상 없는 것
    import base64
    payload_b64 = parts[1]
    padding = "=" * ((4 - len(payload_b64) % 4) % 4)
    try:
        payload_raw = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_raw)
    except Exception:
        return {"status": "missing"}
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)):
        return None  # exp 없으면 만료 검증 못함 → 통과
    now_ts = datetime.now().timestamp()
    if exp <= now_ts:
        return {"status": "expired", "hours_left": 0}
    hours_left = (exp - now_ts) / 3600
    if hours_left < SETTLE_TOKEN_WARN_HOURS:
        return {"status": "expiring", "hours_left": hours_left}
    return None


def check_session_expiry() -> list[dict]:
    """auth=session 채널의 storage state 파일을 점검.

    반환: [{key, name, status: "missing"|"stale", age_days?, login_url}, ...]
    status:
      missing — storage 파일 자체가 없음 (수동 로그인 한 번도 안 함)
      stale   — 파일이 SESSION_WARN_DAYS 이상 오래됨 (만료 직전 또는 만료됨)
    """
    if not CHANNELS_YAML.exists():
        return []
    try:
        with CHANNELS_YAML.open(encoding="utf-8") as f:
            channels = yaml.safe_load(f).get("channels", [])
    except Exception:
        return []
    issues: list[dict] = []
    now = datetime.now()
    for ch in channels:
        if ch.get("auth") != "session":
            continue
        key = ch.get("key")
        if not key:
            continue
        path = STORAGE_DIR / f"{key}.json"
        login_url = ((ch.get("urls") or {}).get("login")) or ""
        if not path.exists():
            issues.append({
                "key": key,
                "name": ch.get("name", key),
                "status": "missing",
                "login_url": login_url,
            })
            continue
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime)
        except OSError:
            continue
        age_days = (now - mtime).days
        if age_days >= SESSION_WARN_DAYS:
            issues.append({
                "key": key,
                "name": ch.get("name", key),
                "status": "stale",
                "age_days": age_days,
                "login_url": login_url,
            })
    return issues


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

        # 회고 미작성 — closed 상태 + sale_end 지남 + ops_retro_note 비어있음.
        # 너무 오래된 건 무한 누적되므로 sale_end 기준 14일 이내만 알림.
        retro_pending = [
            dict(r) for r in conn.execute(
                "SELECT * FROM events "
                "WHERE status = 'closed' "
                "  AND sale_end IS NOT NULL "
                "  AND date(sale_end) <= date('now') "
                "  AND date(sale_end) >= date('now', '-14 days') "
                "  AND (ops_retro_note IS NULL OR TRIM(ops_retro_note) = '') "
                "ORDER BY sale_end DESC"
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

    if retro_pending:
        lines.append(f"\n📝 *회고 작성 필요 — {len(retro_pending)}건* (종료 행사, 14일 이내)")
        for e in retro_pending:
            ch = CHANNEL_NAMES.get(e["channel_key"], e["channel_key"])
            end = e["sale_end"][:10] if e["sale_end"] else "?"
            lines.append(f"• *{ch}* {e['title'][:50]} — 종료 {end}")
            notified.append({"id": e["dedup_id"], "kind": "retro_pending"})

    # 셋업 누락 — 진행 중/임박 행사에 SKU 미등록 또는 매출 매칭 미실행
    setup_issues = detect_setup_incomplete()
    if setup_issues:
        lines.append(f"\n🛠 *진행 행사 셋업 누락 — {len(setup_issues)}건* (지금 처리 필요)")
        for s in setup_issues:
            ch = CHANNEL_NAMES.get(s["channel"], s["channel"])
            period = s["sale_start"] if s["sale_start"] == s["sale_end"] else f"{s['sale_start']}~{s['sale_end']}"
            issues_str = " · ".join(s["issues"])
            lines.append(f"• [{s['short']}] *{ch}* {s['title'][:40]} ({period}) — {issues_str}")
            notified.append({"id": f"setup:{s['short']}", "kind": "setup_incomplete"})

    # 카니발 충돌 — 같은 SKU·겹치는 기간·다른 채널 페어
    cannibals = detect_cannibal_conflicts()
    if cannibals:
        lines.append(f"\n⚡ *카니발 충돌 — {len(cannibals)}쌍* (같은 SKU 다른 채널 기간 겹침)")
        for c in cannibals[:10]:  # 너무 많으면 잘림 → 상위 10쌍만
            a_ch = CHANNEL_NAMES.get(c["a"]["channel"], c["a"]["channel"])
            b_ch = CHANNEL_NAMES.get(c["b"]["channel"], c["b"]["channel"])
            lines.append(
                f"• [{c['a']['short']}] *{a_ch}* {c['a']['title'][:35]}\n"
                f"  ↕ [{c['b']['short']}] *{b_ch}* {c['b']['title'][:35]}\n"
                f"  공통 SKU: {c['common_skus']}"
            )
            notified.append({
                "id": f"cannibal:{c['a']['short']}-{c['b']['short']}",
                "kind": "cannibal",
            })
        if len(cannibals) > 10:
            lines.append(f"  …외 {len(cannibals) - 10}쌍")

    # 회고 미작성 — closed + sale_end 14일 이내 + ops_retro_note 비어있음
    retro_pending = detect_retro_pending()
    if retro_pending:
        lines.append(f"\n📝 *회고 미작성 — {len(retro_pending)}건* (종료 14일 이내)")
        for r in retro_pending[:5]:
            lines.append(f"• [{r['short']}] {r['title'][:50]} (종료 {r['sale_end'][:10]})")
            notified.append({"id": f"retro:{r['short']}", "kind": "retro"})
        if len(retro_pending) > 5:
            lines.append(f"  …외 {len(retro_pending) - 5}건")

    # 정산자동화웹 토큰 만료 임박
    token_status = check_settle_token_expiry()
    if token_status:
        lines.append(f"\n🔑 *정산자동화웹 토큰 점검*")
        if token_status["status"] == "missing":
            lines.append("• ❌ SETTLE_API_TOKEN 비어있음 — auto_login 실패 또는 .env 미설정")
            notified.append({"id": "settle_token:missing", "kind": "settle_token"})
        elif token_status["status"] == "expired":
            lines.append("• ❌ 토큰 만료 — 매출 매칭/일별 매출 호출 즉시 401")
            notified.append({"id": "settle_token:expired", "kind": "settle_token"})
        else:
            h = token_status.get("hours_left", 0)
            lines.append(f"• ⏰ 토큰 만료 임박 — {h:.1f}시간 후 만료 (auto_login 점검 권장)")
            notified.append({"id": "settle_token:expiring", "kind": "settle_token"})

    # 셀러센터 세션 점검 — auth=session 채널의 storage 파일 만료/누락
    sessions = check_session_expiry()
    if sessions:
        lines.append(f"\n🔐 *셀러센터 세션 점검 — {len(sessions)}건* (재로그인 필요)")
        for s in sessions:
            if s["status"] == "missing":
                lines.append(f"• ❌ *{s['name']}* — 세션 파일 없음 (bootstrap_session 첫 로그인 필요)")
            else:
                lines.append(
                    f"• ⏰ *{s['name']}* — 세션 {s['age_days']}일 경과 (≥{SESSION_WARN_DAYS}일, 갱신 권장)"
                )
            if s.get("login_url"):
                lines.append(f"  → {s['login_url']}")
            notified.append({"id": f"session:{s['key']}:{s['status']}", "kind": "session"})

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
