"""행사 공고 SQLite 저장소.

스키마는 의도적으로 작게 시작. 단계가 진행되면(행사 운영 라이프사이클 등)
다른 테이블이 추가될 예정. events 테이블은 "발견된 공고 + 메타데이터" 만 담당.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator

from .adapters import EventPost
from .parse import parse_event_type

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "events.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
  dedup_id        TEXT PRIMARY KEY,
  channel_key     TEXT NOT NULL,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  posted_at       TEXT,
  deadline_at     TEXT,
  category        TEXT,
  is_doa_fit      INTEGER NOT NULL DEFAULT 0,
  raw_text        TEXT,
  extra_json      TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new',
  memo            TEXT,
  status_updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_channel  ON events(channel_key);
CREATE INDEX IF NOT EXISTS idx_events_deadline ON events(deadline_at);
CREATE INDEX IF NOT EXISTS idx_events_doa_fit  ON events(is_doa_fit);
"""

# 행사 운영 상태 (라이프사이클)
STATUS_VALUES = ("new", "reviewing", "applied", "selected", "running", "closed", "skip")
STATUS_LABELS = {
    "new":       "신규",
    "reviewing": "검토중",
    "applied":   "신청완료",
    "selected":  "선정",
    "running":   "진행중",
    "closed":    "종료",
    "skip":      "패스",
}


def _migrate(conn: sqlite3.Connection) -> None:
    """기존 DB에 새 컬럼 보강. SQLite ALTER TABLE은 idempotent 하지 않아 존재 확인."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(events)")}
    if "status" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'new'")
    if "memo" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN memo TEXT")
    if "status_updated_at" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN status_updated_at TEXT")
    if "sale_start" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN sale_start TEXT")
    if "sale_end" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN sale_end TEXT")
    if "applied_skus_json" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN applied_skus_json TEXT")
    if "sales_json" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN sales_json TEXT")
    if "sales_synced_at" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN sales_synced_at TEXT")
    if "source" not in cols:
        # "rss"/"html"/"playwright" = 크롤러 수집, "manual" = MD가 직접 등록 (1:1 연락 등)
        conn.execute("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'crawl'")
    if "ad_spend_manual" not in cols:
        # 사용자가 행사별로 직접 입력하는 실제 광고비.
        # top-products.ad_spend 는 전 채널 합산이라 부정확 — 이걸 사용.
        conn.execute("ALTER TABLE events ADD COLUMN ad_spend_manual INTEGER")
    # 노션 컬럼 매핑 — 행사유형/할인/예상매출/벤더정보
    if "event_type" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN event_type TEXT")  # 기획전/타임특가/오늘끝딜 등
    if "discount_rate" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN discount_rate REAL")  # 0.0 ~ 1.0
    if "discount_burden" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN discount_burden TEXT")  # "도아"/"채널"/"분담"
    if "expected_revenue" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN expected_revenue INTEGER")  # 원
    if "vendor_name" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN vendor_name TEXT")
    if "vendor_contact" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN vendor_contact TEXT")
    if "md_owner_name" not in cols:
        # 행사 담당 MD (자유 입력). channel_key 기반 contacts 매핑보다 우선.
        conn.execute("ALTER TABLE events ADD COLUMN md_owner_name TEXT")
    if "simulation_json" not in cols:
        # 마진 시뮬레이터 결과 스냅샷. 종료 후 실제 sales_json 과 비교용.
        # { expected_sale, expected_op, expected_margin, sku_breakdown: [...], saved_at }
        conn.execute("ALTER TABLE events ADD COLUMN simulation_json TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)")

    # MD 연락처 마스터 — 채널별 담당 MD 정보. 한 번 입력해두면 다음 행사 잡을 때 또 씀.
    conn.execute(
        """CREATE TABLE IF NOT EXISTS md_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_key      TEXT NOT NULL,
            name             TEXT NOT NULL,
            kakao_id         TEXT,
            phone            TEXT,
            email            TEXT,
            memo             TEXT,
            last_contact_at  TEXT,
            created_at       TEXT NOT NULL,
            updated_at       TEXT NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_md_contacts_ch ON md_contacts(channel_key)")

    # 반복 행사 템플릿 — 예: "네이버 오늘끝딜 주간". 사용자가 새 행사 등록할 때 prefill 용.
    conn.execute(
        """CREATE TABLE IF NOT EXISTS event_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT NOT NULL,
            channel_key       TEXT NOT NULL,
            title_pattern     TEXT NOT NULL,
            category          TEXT,
            recurrence        TEXT,
            applied_skus_json TEXT,
            memo              TEXT,
            created_at        TEXT NOT NULL,
            updated_at        TEXT NOT NULL
        )"""
    )

    # 행사별 구좌 노출 캡쳐 첨부. 파일 자체는 data/attachments/<dedup_id>/<filename>.
    # DB에는 메타만 (캡션은 "메인 배너 1번 슬롯" 등 한 줄 설명).
    conn.execute(
        """CREATE TABLE IF NOT EXISTS event_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dedup_id      TEXT NOT NULL,
            filename      TEXT NOT NULL,
            original_name TEXT,
            caption       TEXT,
            mime_type     TEXT,
            size_bytes    INTEGER,
            created_at    TEXT NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_attach_event ON event_attachments(dedup_id)")

    # 진행중 운영관리 메모 (5종세트 — 노출/재고/광고/일별매출/클레임 중 자유텍스트 필드).
    # ad_spend_manual / applied_skus / sales_json 이외의 슬롯들.
    ev_cols = {row[1] for row in conn.execute("PRAGMA table_info(events)")}
    if "ops_stock_note" not in ev_cols:
        conn.execute("ALTER TABLE events ADD COLUMN ops_stock_note TEXT")  # 재고 메모
    if "ops_claim_note" not in ev_cols:
        conn.execute("ALTER TABLE events ADD COLUMN ops_claim_note TEXT")  # 클레임/이슈 메모
    if "ops_retro_note" not in ev_cols:
        conn.execute("ALTER TABLE events ADD COLUMN ops_retro_note TEXT")  # 종료 후 회고 메모

    # 행사 활동 타임라인 — 상태 변경/메모/광고비/SKU/매출/자유코멘트 자동·수동 기록.
    # kind: status / memo / period / ad_spend / sku_register / sku_unregister / sales / comment / field
    conn.execute(
        """CREATE TABLE IF NOT EXISTS event_activities (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            dedup_id    TEXT NOT NULL,
            kind        TEXT NOT NULL,
            text        TEXT,
            created_at  TEXT NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_activities_event ON event_activities(dedup_id, created_at DESC)")

    # 채널 마스터 — 정산자동화웹 facets API 자동 동기화 + yaml 기반 정보채널.
    # key = settle_name 으로 1:1 매핑되는 게 기본. yaml 의 settle_channels 가 여러 개면 각각 row.
    # source: "settle" (정산자동화웹 동기화) / "yaml" (정보채널, 어댑터와 묶임) / "manual" (사용자 추가)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS channels_master (
            settle_name      TEXT PRIMARY KEY,
            display_name     TEXT NOT NULL,
            yaml_key         TEXT,
            is_sales         INTEGER NOT NULL DEFAULT 1,
            abbr             TEXT,
            default_fee_rate REAL,
            source           TEXT NOT NULL DEFAULT 'settle',
            last_synced_at   TEXT,
            created_at       TEXT NOT NULL,
            status           TEXT,
            priority         TEXT,
            note             TEXT,
            url              TEXT,
            sku_matrix_json  TEXT
        )"""
    )
    # channels_master 컬럼 마이그레이션 (기존 row 보존)
    ch_cols = {r[1] for r in conn.execute("PRAGMA table_info(channels_master)")}
    for col, ddl in (
        ("status", "ALTER TABLE channels_master ADD COLUMN status TEXT"),
        ("priority", "ALTER TABLE channels_master ADD COLUMN priority TEXT"),
        ("note", "ALTER TABLE channels_master ADD COLUMN note TEXT"),
        ("url", "ALTER TABLE channels_master ADD COLUMN url TEXT"),
        ("sku_matrix_json", "ALTER TABLE channels_master ADD COLUMN sku_matrix_json TEXT"),
    ):
        if col not in ch_cols:
            conn.execute(ddl)


@contextmanager
def connect(db_path: Path = DB_PATH) -> Iterator[sqlite3.Connection]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def resolve_event(conn: sqlite3.Connection, id_prefix: str) -> sqlite3.Row:
    """짧은 prefix(예: 'a1b2c3')로 events 한 건을 찾음. 모호하면 예외."""
    rows = conn.execute(
        "SELECT * FROM events WHERE dedup_id LIKE ? || '%' LIMIT 2",
        (id_prefix,),
    ).fetchall()
    if not rows:
        raise LookupError(f"id prefix '{id_prefix}' 매칭 없음")
    if len(rows) > 1:
        raise LookupError(f"id prefix '{id_prefix}' 모호 — 더 길게 입력")
    return rows[0]


def insert_activity(
    conn: sqlite3.Connection,
    dedup_id: str,
    kind: str,
    text: str,
) -> None:
    """행사 활동 1건 기록. kind: status/memo/period/ad_spend/sku/sales/comment/field 등."""
    conn.execute(
        "INSERT INTO event_activities (dedup_id, kind, text, created_at) VALUES (?, ?, ?, ?)",
        (dedup_id, kind, text, datetime.now().isoformat()),
    )


def list_activities(
    conn: sqlite3.Connection, dedup_id: str, limit: int = 100
) -> list[sqlite3.Row]:
    """행사의 활동 타임라인 (최신 → 과거)."""
    return conn.execute(
        "SELECT id, kind, text, created_at FROM event_activities "
        "WHERE dedup_id = ? ORDER BY created_at DESC LIMIT ?",
        (dedup_id, limit),
    ).fetchall()


def delete_activity(conn: sqlite3.Connection, activity_id: int) -> bool:
    cur = conn.execute("DELETE FROM event_activities WHERE id = ?", (activity_id,))
    return cur.rowcount > 0


def set_status(conn: sqlite3.Connection, dedup_id: str, status: str) -> None:
    if status not in STATUS_VALUES:
        raise ValueError(f"invalid status '{status}'. 가능: {STATUS_VALUES}")
    prev_row = conn.execute("SELECT status FROM events WHERE dedup_id = ?", (dedup_id,)).fetchone()
    prev = prev_row["status"] if prev_row else None
    conn.execute(
        "UPDATE events SET status = ?, status_updated_at = ? WHERE dedup_id = ?",
        (status, datetime.now().isoformat(), dedup_id),
    )
    if prev != status:
        prev_label = STATUS_LABELS.get(prev or "", prev or "?")
        next_label = STATUS_LABELS.get(status, status)
        insert_activity(conn, dedup_id, "status", f"상태: {prev_label} → {next_label}")


def set_memo(conn: sqlite3.Connection, dedup_id: str, memo: str) -> None:
    conn.execute("UPDATE events SET memo = ? WHERE dedup_id = ?", (memo, dedup_id))
    summary = (memo or "").strip()
    if summary:
        # 너무 길면 60자 truncate
        if len(summary) > 60:
            summary = summary[:60] + "…"
        insert_activity(conn, dedup_id, "memo", f"메모: {summary}")
    else:
        insert_activity(conn, dedup_id, "memo", "메모 비움")


def list_recent_no_deadline(
    conn: sqlite3.Connection,
    limit: int = 20,
    doa_only: bool = True,
    posted_within_days: int = 14,
) -> list[sqlite3.Row]:
    """제목에서 마감일을 못 뽑은 도아적합 공고(예: 카카오 톡스토어 글)를 최근 게시 기준 정렬."""
    sql = (
        "SELECT * FROM events WHERE deadline_at IS NULL"
        " AND posted_at IS NOT NULL"
        " AND date(posted_at) >= date('now', ?)"
    )
    params: list = [f"-{posted_within_days} days"]
    if doa_only:
        sql += " AND is_doa_fit = 1"
    sql += " ORDER BY posted_at DESC LIMIT ?"
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def get_applied_skus(conn: sqlite3.Connection, dedup_id: str) -> list[dict]:
    row = conn.execute(
        "SELECT applied_skus_json FROM events WHERE dedup_id = ?", (dedup_id,)
    ).fetchone()
    if not row or not row["applied_skus_json"]:
        return []
    return json.loads(row["applied_skus_json"])


def set_applied_skus(conn: sqlite3.Connection, dedup_id: str, skus: list[dict]) -> None:
    payload = json.dumps(skus, ensure_ascii=False) if skus else None
    conn.execute(
        "UPDATE events SET applied_skus_json = ? WHERE dedup_id = ?",
        (payload, dedup_id),
    )


def add_applied_sku(
    conn: sqlite3.Connection,
    dedup_id: str,
    sku_id: int,
    sale_price: int,
    qty: int,
    sku_name: str | None = None,
) -> None:
    skus = [s for s in get_applied_skus(conn, dedup_id) if s.get("sku_id") != sku_id]
    skus.append(
        {
            "sku_id": sku_id,
            "sale_price": sale_price,
            "qty_est": qty,
            "sku_name": sku_name,
        }
    )
    set_applied_skus(conn, dedup_id, skus)
    insert_activity(
        conn, dedup_id, "sku_register",
        f"SKU 등록: {sku_name or f'#{sku_id}'} ({int(sale_price):,}원 × {qty}건)",
    )


def remove_applied_sku(conn: sqlite3.Connection, dedup_id: str, sku_id: int) -> None:
    target = next((s for s in get_applied_skus(conn, dedup_id) if s.get("sku_id") == sku_id), None)
    skus = [s for s in get_applied_skus(conn, dedup_id) if s.get("sku_id") != sku_id]
    set_applied_skus(conn, dedup_id, skus)
    if target:
        insert_activity(
            conn, dedup_id, "sku_unregister",
            f"SKU 제거: {target.get('sku_name') or f'#{sku_id}'}",
        )


def set_event_period(
    conn: sqlite3.Connection, dedup_id: str, start: str, end: str
) -> None:
    conn.execute(
        "UPDATE events SET sale_start = ?, sale_end = ? WHERE dedup_id = ?",
        (start, end, dedup_id),
    )
    insert_activity(conn, dedup_id, "period", f"기간: {start} ~ {end}")


def set_ad_spend(conn: sqlite3.Connection, dedup_id: str, ad_spend: int | None) -> None:
    """행사별 실제 광고비 (사용자 직접 입력)."""
    conn.execute(
        "UPDATE events SET ad_spend_manual = ? WHERE dedup_id = ?",
        (ad_spend, dedup_id),
    )
    if ad_spend is None or ad_spend == 0:
        insert_activity(conn, dedup_id, "ad_spend", "광고비 비움")
    else:
        insert_activity(conn, dedup_id, "ad_spend", f"광고비: {int(ad_spend):,}원")


def set_ops_note(
    conn: sqlite3.Connection, dedup_id: str, kind: str, value: str | None
) -> None:
    """진행중·종료 운영관리 메모. kind = 'stock'(재고) | 'claim'(클레임) | 'retro'(회고)."""
    col = {
        "stock": "ops_stock_note",
        "claim": "ops_claim_note",
        "retro": "ops_retro_note",
    }.get(kind)
    if not col:
        raise ValueError(f"invalid ops note kind: {kind}")
    payload = value if value else None
    conn.execute(
        f"UPDATE events SET {col} = ? WHERE dedup_id = ?",
        (payload, dedup_id),
    )


# ----- 행사 첨부 (구좌 노출 캡쳐) CRUD -----

def list_attachments(conn: sqlite3.Connection, dedup_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM event_attachments WHERE dedup_id = ? ORDER BY id",
        (dedup_id,),
    ).fetchall()


def add_attachment(
    conn: sqlite3.Connection,
    dedup_id: str,
    filename: str,
    original_name: str | None = None,
    caption: str | None = None,
    mime_type: str | None = None,
    size_bytes: int | None = None,
) -> int:
    now = datetime.now().isoformat()
    cur = conn.execute(
        """INSERT INTO event_attachments
           (dedup_id, filename, original_name, caption, mime_type, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (dedup_id, filename, original_name, caption, mime_type, size_bytes, now),
    )
    return cur.lastrowid or 0


def update_attachment_caption(
    conn: sqlite3.Connection, attach_id: int, caption: str | None
) -> bool:
    cur = conn.execute(
        "UPDATE event_attachments SET caption = ? WHERE id = ?",
        (caption if caption else None, attach_id),
    )
    return cur.rowcount > 0


def get_attachment(
    conn: sqlite3.Connection, attach_id: int
) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM event_attachments WHERE id = ?", (attach_id,)
    ).fetchone()


def delete_attachment(conn: sqlite3.Connection, attach_id: int) -> sqlite3.Row | None:
    """삭제하기 전에 row 를 반환 (파일 삭제용 filename/dedup_id 알아야 함)."""
    row = get_attachment(conn, attach_id)
    if row is None:
        return None
    conn.execute("DELETE FROM event_attachments WHERE id = ?", (attach_id,))
    return row


def delete_attachments_for_event(
    conn: sqlite3.Connection, dedup_id: str
) -> list[sqlite3.Row]:
    """행사 삭제 시 cascade. 반환된 row 들의 filename 으로 파일도 같이 지워야 함."""
    rows = list_attachments(conn, dedup_id)
    conn.execute("DELETE FROM event_attachments WHERE dedup_id = ?", (dedup_id,))
    return rows


# ----- MD 연락처 CRUD -----

def list_contacts(
    conn: sqlite3.Connection, channel_key: str | None = None
) -> list[sqlite3.Row]:
    if channel_key:
        return conn.execute(
            "SELECT * FROM md_contacts WHERE channel_key = ? ORDER BY name",
            (channel_key,),
        ).fetchall()
    return conn.execute(
        "SELECT * FROM md_contacts ORDER BY channel_key, name"
    ).fetchall()


def infer_md_owners(conn: sqlite3.Connection) -> tuple[int, int, list[str]]:
    """md_owner_name 비어있는 행사에 자동 매핑.

    채널별 contacts 가 1명일 때만 자동 적용 (여러 명이면 모호 → 미지정 유지).
    Returns: (patched_count, skipped_ambiguous, skipped_channel_keys)
    """
    rows = conn.execute(
        """SELECT channel_key, COUNT(*) as n, MIN(name) as first_name
           FROM md_contacts
           GROUP BY channel_key"""
    ).fetchall()
    unique_map: dict[str, str] = {}
    ambiguous: list[str] = []
    for r in rows:
        if r["n"] == 1:
            unique_map[r["channel_key"]] = r["first_name"]
        else:
            ambiguous.append(r["channel_key"])
    if not unique_map:
        return 0, len(ambiguous), ambiguous

    patched = 0
    for ch_key, name in unique_map.items():
        cur = conn.execute(
            """UPDATE events
               SET md_owner_name = ?
               WHERE channel_key = ?
                 AND (md_owner_name IS NULL OR TRIM(md_owner_name) = '')""",
            (name, ch_key),
        )
        patched += cur.rowcount or 0
    return patched, len(ambiguous), ambiguous


def add_contact(
    conn: sqlite3.Connection,
    channel_key: str,
    name: str,
    kakao_id: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    memo: str | None = None,
) -> int:
    now = datetime.now().isoformat()
    cur = conn.execute(
        """INSERT INTO md_contacts
           (channel_key, name, kakao_id, phone, email, memo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (channel_key, name, kakao_id, phone, email, memo, now, now),
    )
    return cur.lastrowid or 0


def update_contact(
    conn: sqlite3.Connection,
    contact_id: int,
    **fields: object,
) -> None:
    allowed = {"channel_key", "name", "kakao_id", "phone", "email", "memo", "last_contact_at"}
    cols = [f"{k} = ?" for k in fields if k in allowed]
    if not cols:
        return
    vals = [fields[k] for k in fields if k in allowed]
    vals.append(datetime.now().isoformat())
    vals.append(contact_id)
    cols.append("updated_at = ?")
    conn.execute(
        f"UPDATE md_contacts SET {', '.join(cols)} WHERE id = ?",
        vals,
    )


def delete_contact(conn: sqlite3.Connection, contact_id: int) -> bool:
    cur = conn.execute("DELETE FROM md_contacts WHERE id = ?", (contact_id,))
    return cur.rowcount > 0


# ----- 반복 행사 템플릿 CRUD -----

def list_templates(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM event_templates ORDER BY channel_key, name"
    ).fetchall()


def add_template(
    conn: sqlite3.Connection,
    name: str,
    channel_key: str,
    title_pattern: str,
    category: str | None = None,
    recurrence: str | None = None,
    applied_skus_json: str | None = None,
    memo: str | None = None,
) -> int:
    now = datetime.now().isoformat()
    cur = conn.execute(
        """INSERT INTO event_templates
           (name, channel_key, title_pattern, category, recurrence, applied_skus_json, memo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, channel_key, title_pattern, category, recurrence, applied_skus_json, memo, now, now),
    )
    return cur.lastrowid or 0


def delete_template(conn: sqlite3.Connection, template_id: int) -> bool:
    cur = conn.execute("DELETE FROM event_templates WHERE id = ?", (template_id,))
    return cur.rowcount > 0


# ----- 채널 마스터 CRUD -----

def list_channels_master(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM channels_master ORDER BY is_sales DESC, display_name"
    ).fetchall()


def upsert_channel_master(
    conn: sqlite3.Connection,
    settle_name: str,
    display_name: str,
    yaml_key: str | None = None,
    is_sales: bool = True,
    abbr: str | None = None,
    default_fee_rate: float | None = None,
    source: str = "settle",
) -> None:
    """INSERT OR UPDATE. last_synced_at 자동 갱신."""
    now = datetime.now().isoformat()
    existing = conn.execute(
        "SELECT 1 FROM channels_master WHERE settle_name = ?",
        (settle_name,),
    ).fetchone()
    if existing:
        conn.execute(
            """UPDATE channels_master SET
                display_name = COALESCE(?, display_name),
                yaml_key = COALESCE(?, yaml_key),
                is_sales = ?,
                abbr = COALESCE(?, abbr),
                default_fee_rate = COALESCE(?, default_fee_rate),
                source = ?,
                last_synced_at = ?
               WHERE settle_name = ?""",
            (display_name, yaml_key, 1 if is_sales else 0, abbr, default_fee_rate, source, now, settle_name),
        )
    else:
        conn.execute(
            """INSERT INTO channels_master
               (settle_name, display_name, yaml_key, is_sales, abbr, default_fee_rate, source, last_synced_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (settle_name, display_name, yaml_key, 1 if is_sales else 0, abbr, default_fee_rate, source, now, now),
        )


def delete_channel_master(conn: sqlite3.Connection, settle_name: str) -> bool:
    cur = conn.execute("DELETE FROM channels_master WHERE settle_name = ?", (settle_name,))
    return cur.rowcount > 0


def set_sku_channel_status(
    conn: sqlite3.Connection,
    settle_name: str,
    sku_id: int,
    status: str | None,
    entry_date: str | None = None,
    note: str | None = None,
) -> bool:
    """SKU × 채널 입점 상태 업데이트 (channels_master.sku_matrix_json 의 sku_id 키 set/clear).

    status:
      - "entered" : 입점 완료 (✓)
      - "reviewing": 검토중 (⏳)
      - "blocked"  : 입점 불가 (⚠)
      - None       : 미입점 (✕, 해당 sku_id 키 삭제)
    """
    row = conn.execute(
        "SELECT sku_matrix_json FROM channels_master WHERE settle_name = ?",
        (settle_name,),
    ).fetchone()
    if not row:
        return False
    try:
        matrix = json.loads(row["sku_matrix_json"]) if row["sku_matrix_json"] else {}
    except Exception:
        matrix = {}
    key = str(sku_id)
    if status is None:
        matrix.pop(key, None)
    else:
        entry = {"status": status}
        if entry_date:
            entry["entry_date"] = entry_date
        if note:
            entry["note"] = note
        matrix[key] = entry
    payload = json.dumps(matrix, ensure_ascii=False)
    conn.execute(
        "UPDATE channels_master SET sku_matrix_json = ? WHERE settle_name = ?",
        (payload, settle_name),
    )
    return True


def update_channel_master_meta(
    conn: sqlite3.Connection,
    settle_name: str,
    status: str | None = None,
    priority: str | None = None,
    note: str | None = None,
    url: str | None = None,
) -> bool:
    """채널 마스터의 운영 메타필드만 업데이트 (sync 와 충돌 안 함).

    None = 변경 안 함, 빈 문자열 = NULL 클리어.
    """
    fields = []
    params: list = []
    for col, val in (("status", status), ("priority", priority), ("note", note), ("url", url)):
        if val is None:
            continue
        if val == "":
            fields.append(f"{col} = NULL")
        else:
            fields.append(f"{col} = ?")
            params.append(val)
    if not fields:
        return False
    params.append(settle_name)
    cur = conn.execute(
        f"UPDATE channels_master SET {', '.join(fields)} WHERE settle_name = ?",
        params,
    )
    return cur.rowcount > 0


def update_event_fields(
    conn: sqlite3.Connection,
    dedup_id: str,
    title: str | None = None,
    deadline: str | None = None,
    category: str | None = None,
    url: str | None = None,
    event_type: str | None = None,
    discount_rate: float | None = None,
    discount_burden: str | None = None,
    expected_revenue: int | None = None,
    vendor_name: str | None = None,
    vendor_contact: str | None = None,
    md_owner_name: str | None = None,
    channel_key: str | None = None,
) -> None:
    """행사 본문 필드 직접 수정. 주로 수동 등록 행사 수정용.

    None = 변경 안 함, 빈 문자열 = NULL 로 클리어.
    """
    fields = []
    params: list = []
    if title is not None:
        fields.append("title = ?")
        params.append(title)
    if deadline is not None:
        if deadline == "":
            fields.append("deadline_at = NULL")
        else:
            try:
                deadline_iso = datetime.fromisoformat(deadline).isoformat()
            except ValueError:
                deadline_iso = f"{deadline}T23:59:00"
            fields.append("deadline_at = ?")
            params.append(deadline_iso)
    if category is not None:
        if category == "":
            fields.append("category = NULL")
        else:
            fields.append("category = ?")
            params.append(category)
    if url is not None and url != "":
        fields.append("url = ?")
        params.append(url)
    # 노션 매핑 필드
    for col, val in (
        ("event_type", event_type),
        ("discount_burden", discount_burden),
        ("vendor_name", vendor_name),
        ("vendor_contact", vendor_contact),
        ("md_owner_name", md_owner_name),
        ("channel_key", channel_key),  # 채널 잘못 등록한 경우 변경 가능
    ):
        if val is not None:
            if val == "":
                fields.append(f"{col} = NULL")
            else:
                fields.append(f"{col} = ?")
                params.append(val)
    if discount_rate is not None:
        fields.append("discount_rate = ?")
        params.append(discount_rate if discount_rate >= 0 else None)
    if expected_revenue is not None:
        fields.append("expected_revenue = ?")
        params.append(expected_revenue if expected_revenue > 0 else None)
    if not fields:
        return
    params.append(dedup_id)
    conn.execute(
        f"UPDATE events SET {', '.join(fields)} WHERE dedup_id = ?",
        params,
    )


def set_event_simulation(
    conn: sqlite3.Connection, dedup_id: str, simulation: dict | None
) -> None:
    """마진 시뮬레이터 스냅샷 저장. 종료 후 sales_json 과 비교에 사용."""
    payload = json.dumps(simulation, ensure_ascii=False, default=str) if simulation else None
    conn.execute(
        "UPDATE events SET simulation_json = ? WHERE dedup_id = ?",
        (payload, dedup_id),
    )
    if simulation and simulation.get("expected_sale") is not None:
        s = int(simulation.get("expected_sale", 0) or 0)
        insert_activity(conn, dedup_id, "simulation", f"시뮬 저장: 예상 매출 {s:,}원")
    elif simulation is None:
        insert_activity(conn, dedup_id, "simulation", "시뮬 초기화")


def set_event_sales(
    conn: sqlite3.Connection, dedup_id: str, sales: dict | None
) -> None:
    """sales 명령 결과를 캐시. 리포트가 매번 정산자동화웹 API 안 부르게."""
    payload = json.dumps(sales, ensure_ascii=False, default=str) if sales else None
    conn.execute(
        "UPDATE events SET sales_json = ?, sales_synced_at = ? WHERE dedup_id = ?",
        (payload, datetime.now().isoformat(), dedup_id),
    )
    if sales and sales.get("totals"):
        t = sales["totals"]
        sale = int(t.get("sale", 0) or 0)
        op = int(t.get("operating_profit", 0) or 0)
        insert_activity(
            conn, dedup_id, "sales",
            f"매출 매핑: {sale:,}원 / 영업이익 {op:,}원",
        )
    elif sales is None:
        insert_activity(conn, dedup_id, "sales", "매출 캐시 초기화")


def get_event_sales(conn: sqlite3.Connection, dedup_id: str) -> dict | None:
    row = conn.execute(
        "SELECT sales_json, sales_synced_at FROM events WHERE dedup_id = ?",
        (dedup_id,),
    ).fetchone()
    if not row or not row["sales_json"]:
        return None
    return {"data": json.loads(row["sales_json"]), "synced_at": row["sales_synced_at"]}


def reset_event(conn: sqlite3.Connection, dedup_id: str) -> None:
    """행사를 '발견된 직후' 상태로 되돌림 (RSS 수집은 그대로 유지).

    초기화 항목: status='new', memo, applied_skus_json, sale_start, sale_end,
    sales_json, sales_synced_at, status_updated_at.
    """
    conn.execute(
        """UPDATE events SET
            status = 'new',
            memo = NULL,
            applied_skus_json = NULL,
            sale_start = NULL,
            sale_end = NULL,
            sales_json = NULL,
            sales_synced_at = NULL,
            status_updated_at = NULL
          WHERE dedup_id = ?""",
        (dedup_id,),
    )


def delete_event(conn: sqlite3.Connection, dedup_id: str, manual_only: bool = True) -> bool:
    """행사 삭제. manual_only=True면 수동 등록(source='manual')만 삭제.

    크롤로 수집된 행사는 삭제해도 다음 crawl 에서 다시 들어오므로,
    실수 방지 위해 manual 만 기본 허용. False 주면 강제 삭제 (다음 crawl 시 재수집됨).
    """
    if manual_only:
        cur = conn.execute(
            "DELETE FROM events WHERE dedup_id = ? AND source = 'manual'",
            (dedup_id,),
        )
    else:
        cur = conn.execute("DELETE FROM events WHERE dedup_id = ?", (dedup_id,))
    return cur.rowcount > 0


def add_manual_event(
    conn: sqlite3.Connection,
    channel_key: str,
    title: str,
    deadline: str | None = None,
    url: str | None = None,
    memo: str | None = None,
    category: str | None = None,
    event_type: str | None = None,
    discount_rate: float | None = None,
    discount_burden: str | None = None,
    expected_revenue: int | None = None,
    vendor_name: str | None = None,
    vendor_contact: str | None = None,
    md_owner_name: str | None = None,
) -> str:
    """MD가 직접 받은 행사 등록 (RSS/공지에 안 뜨는 케이스).

    URL 없으면 manual://<channel_key>/<uuid> 형식의 placeholder 자동 부여.
    is_doa_fit = 1 (수동 등록은 MD 판단), status = 'reviewing' 으로 시작.
    """
    if not url:
        url = f"manual://{channel_key}/{uuid.uuid4().hex[:12]}"
    dedup_id = hashlib.sha1(f"{channel_key}|{url}".encode()).hexdigest()[:16]
    now = datetime.now().isoformat()
    deadline_iso = None
    if deadline:
        try:
            deadline_iso = datetime.fromisoformat(deadline).isoformat()
        except ValueError:
            deadline_iso = f"{deadline}T23:59:00"
    conn.execute(
        """INSERT OR REPLACE INTO events (
            dedup_id, channel_key, title, url, posted_at, deadline_at,
            category, is_doa_fit, raw_text, extra_json,
            first_seen_at, last_seen_at, status, memo, source,
            event_type, discount_rate, discount_burden, expected_revenue,
            vendor_name, vendor_contact, md_owner_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, 'reviewing', ?, 'manual',
                  ?, ?, ?, ?, ?, ?, ?)""",
        (
            dedup_id, channel_key, title, url, now, deadline_iso,
            category, json.dumps({"manual": True}), now, now, memo,
            event_type, discount_rate, discount_burden, expected_revenue,
            vendor_name, vendor_contact, md_owner_name,
        ),
    )
    return dedup_id


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def infer_event_types(conn: sqlite3.Connection, only_null: bool = True) -> tuple[int, int]:
    """기존 행사 일괄 추론. event_type 이 NULL 또는 비어있는 행만 (only_null=True) 채움.

    Returns: (검사 건수, 업데이트 건수)
    """
    sql = "SELECT dedup_id, title, category, event_type FROM events"
    if only_null:
        sql += " WHERE event_type IS NULL OR TRIM(event_type) = ''"
    rows = conn.execute(sql).fetchall()
    n_check = len(rows)
    n_updated = 0
    for r in rows:
        guess = parse_event_type(r["title"] or "", r["category"])
        if guess and guess != (r["event_type"] or ""):
            conn.execute(
                "UPDATE events SET event_type = ? WHERE dedup_id = ?",
                (guess, r["dedup_id"]),
            )
            n_updated += 1
    return n_check, n_updated


def upsert_events(
    conn: sqlite3.Connection,
    posts: Iterable[tuple[EventPost, str | None, datetime | None, bool]],
) -> tuple[int, int]:
    """공고를 upsert. (신규 개수, 갱신 개수) 반환.

    각 tuple = (EventPost, category, deadline_at, is_doa_fit)
    """
    new_count = 0
    seen_count = 0
    now = datetime.now().isoformat()
    for post, category, deadline, fit in posts:
        existing = conn.execute(
            "SELECT 1 FROM events WHERE dedup_id = ?", (post.dedup_id,)
        ).fetchone()
        if existing is None:
            inferred_etype = parse_event_type(post.title, category)
            conn.execute(
                """
                INSERT INTO events (
                  dedup_id, channel_key, title, url, posted_at, deadline_at,
                  category, is_doa_fit, raw_text, extra_json,
                  first_seen_at, last_seen_at, event_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    post.dedup_id,
                    post.channel_key,
                    post.title,
                    post.url,
                    _iso(post.posted_at),
                    _iso(deadline),
                    category,
                    1 if fit else 0,
                    post.raw_text,
                    json.dumps(post.extra, ensure_ascii=False) if post.extra else None,
                    now,
                    now,
                    inferred_etype,
                ),
            )
            new_count += 1
        else:
            conn.execute(
                "UPDATE events SET last_seen_at = ? WHERE dedup_id = ?",
                (now, post.dedup_id),
            )
            seen_count += 1
    return new_count, seen_count


def list_recent(
    conn: sqlite3.Connection,
    limit: int = 20,
    doa_only: bool = False,
    channel_key: str | None = None,
    upcoming_days: int | None = None,
) -> list[sqlite3.Row]:
    sql = "SELECT * FROM events WHERE 1=1"
    params: list = []
    if doa_only:
        sql += " AND is_doa_fit = 1"
    if channel_key:
        sql += " AND channel_key = ?"
        params.append(channel_key)
    if upcoming_days is not None:
        sql += (
            " AND deadline_at IS NOT NULL"
            " AND date(deadline_at) >= date('now')"
            " AND date(deadline_at) <= date('now', ?)"
        )
        params.append(f"+{upcoming_days} days")
        sql += " ORDER BY deadline_at ASC LIMIT ?"
    else:
        sql += " ORDER BY COALESCE(posted_at, first_seen_at) DESC LIMIT ?"
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def stats(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    by_channel = {
        row["channel_key"]: row["c"]
        for row in conn.execute(
            "SELECT channel_key, COUNT(*) AS c FROM events GROUP BY channel_key"
        )
    }
    doa_fit = conn.execute("SELECT COUNT(*) FROM events WHERE is_doa_fit = 1").fetchone()[0]
    return {"total": total, "doa_fit": doa_fit, "by_channel": by_channel}
