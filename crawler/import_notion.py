"""노션 export CSV → 우리 DB 임포트.

정산자동화웹이 진실의 원천 — 노션 데이터를 임포트할 때 정산자동화웹의
SKU/채널 데이터와 매핑 검증해서 충돌은 경고만 띄우고 임포트는 진행.

사용:  uv run python -m crawler.import_notion
       uv run python -m crawler.import_notion --dry  # 미리보기

기대 파일 (data/notion_import/ 안):
  - md_contacts.csv      # 이전 진행한 MD 행사 DB _all.csv
  - events.csv           # 다음 행사 일정 DB _all.csv
  - vendor_master.csv    # 한 행사일정 행사 DB _all.csv (판매처 + SKU 매트릭스)
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from api.settle_client import SettleAuthError, SettleClient
from crawler.store import (
    add_contact,
    add_manual_event,
    add_applied_sku,
    connect,
    list_channels_master,
    list_contacts,
    set_event_period,
    upsert_channel_master,
)

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

IMPORT_DIR = Path(__file__).resolve().parent.parent / "data" / "notion_import"


# 노션 채널명 → 우리 channels.yaml 키 매핑 + 정산자동화웹 settle_name
# 정산자동화웹 facets channels 12개 + 노션 추가 6개
NOTION_CHANNEL_MAP = {
    # 정산자동화웹에 있는 채널 (sales)
    "스마트스토어":  ("naver_smartstore", "스마트스토어", True),
    "카카오쇼핑":    ("kakao_talkstore",  "카카오쇼핑",   True),  # 정산자동화웹엔 미입점 (심사중)
    "쿠팡":          ("coupang_wing",     "쿠팡",         True),
    "11번가":        ("11st_soffice",     "11번가",       True),
    "토스쇼핑":      ("toss_shopping",    "토스쇼핑",     True),
    "G마켓/옥션":    ("esmplus",          "지마켓",       True),
    "NS홈쇼핑":      ("ns_homeshopping",  "yaml:ns_homeshopping", True),
    "쇼핑엔티":      ("shoppingnT",       "쇼핑엔티",     True),
    # 정산자동화웹에 없지만 노션엔 있는 채널 (info / 입점전)
    "카페24":        ("cafe24",           "yaml:cafe24",   True),
    "Hmall":         ("hmall",            "yaml:hmall",    True),
    "알리익스프레스": ("aliexpress",       "yaml:aliexpress", True),
    "롯데ON":        ("lotteon",          "yaml:lotteon",  True),
    "테무":          ("temu",             "yaml:temu",     True),
    "네이트온딜":    ("nateondeal",       "yaml:nateondeal", True),
}


def _parse_date_kr(s: str) -> str | None:
    """'2026년 5월 20일' → '2026-05-20'."""
    if not s:
        return None
    s = s.strip()
    m = re.search(r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일", s)
    if m:
        y, mo, d = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    return None


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if any(v.strip() for v in r.values())]
    return rows


def import_contacts(dry: bool) -> int:
    path = IMPORT_DIR / "md_contacts.csv"
    rows = _read_csv(path)
    if not rows:
        print(f"[contacts] {path.name} 없음 또는 빈 파일 — skip")
        return 0
    print(f"\n=== MD 연락처 임포트 ({len(rows)}건) ===")
    n_added = 0
    with connect() as conn:
        existing = {(c["channel_key"], c["name"]) for c in list_contacts(conn)}
        for r in rows:
            name = r.get("담당자명", "").strip()
            if not name:
                continue
            ch_label = r.get("채널", "").strip()
            ch_key = None
            for nl, (yk, _sn, _is) in NOTION_CHANNEL_MAP.items():
                if ch_label.lower().replace(" ", "") == nl.lower().replace(" ", ""):
                    ch_key = yk
                    break
            if ch_key is None:
                print(f"  [WARN] '{name}' — 노션 채널 '{ch_label}' 매핑 못 찾음, 'manual' 로 저장")
                ch_key = "manual"
            key = (ch_key, name)
            if key in existing:
                print(f"  [skip] {name} ({ch_key}) — 이미 있음")
                continue
            kakao = ""
            memo = (r.get("비고") or "").strip()
            phone = (r.get("연락처") or "").strip()
            email = (r.get("이메일") or "").strip()
            print(f"  + {name:10s} [{ch_key}]  {phone}  {email}  {memo}")
            if not dry:
                add_contact(conn, channel_key=ch_key, name=name, kakao_id=kakao,
                            phone=phone, email=email, memo=memo)
                n_added += 1
    print(f"  → {n_added}건 추가 ({'dry' if dry else '실제 저장'})")
    return n_added


def import_vendor_master(dry: bool) -> int:
    path = IMPORT_DIR / "vendor_master.csv"
    rows = _read_csv(path)
    if not rows:
        print(f"[vendor] {path.name} 없음 — skip")
        return 0
    print(f"\n=== 판매처 마스터 임포트 ({len(rows)}건) ===")
    n_added = 0
    with connect() as conn:
        existing_settle = {c["settle_name"] for c in list_channels_master(conn)}
        for r in rows:
            vendor = (r.get("판매처") or "").strip()
            if not vendor:
                continue
            mapped = NOTION_CHANNEL_MAP.get(vendor)
            if not mapped:
                print(f"  [WARN] '{vendor}' — 매핑 없음, skip")
                continue
            yaml_key, settle_name, is_sales = mapped
            fee_str = (r.get("수수료(%)") or "").strip()
            try:
                fee_rate = float(fee_str) / 100 if fee_str else None
            except ValueError:
                fee_rate = None
            status = (r.get("상태") or "").strip()
            note = (r.get("비고") or "").strip()
            print(
                f"  + {vendor:14s} → settle={settle_name:25s} yaml={yaml_key:18s} "
                f"fee={fee_rate or 0:.4f} status={status} note={note[:30]}"
            )
            if not dry:
                if settle_name in existing_settle:
                    upsert_channel_master(
                        conn, settle_name=settle_name, display_name=vendor,
                        yaml_key=yaml_key, is_sales=is_sales,
                        default_fee_rate=fee_rate, source="settle",
                    )
                else:
                    # 정산자동화웹에 없으면 yaml: prefix 로 정보채널
                    upsert_channel_master(
                        conn, settle_name=settle_name, display_name=vendor,
                        yaml_key=yaml_key, is_sales=is_sales,
                        default_fee_rate=fee_rate, source="notion",
                    )
                n_added += 1
    print(f"  → {n_added}건 upsert")
    return n_added


def import_events(dry: bool) -> int:
    path = IMPORT_DIR / "events.csv"
    rows = _read_csv(path)
    if not rows:
        print(f"[events] {path.name} 없음 — skip")
        return 0
    print(f"\n=== 행사 임포트 ({len(rows)}건) ===")
    n_added = 0
    with connect() as conn:
        for r in rows:
            title = (r.get("일정명") or "").strip()
            if not title:
                continue
            period = (r.get("기간") or "").strip()
            date_iso = _parse_date_kr(period)
            ch_label = (r.get("채널") or "").strip()
            ch_key = "manual"
            for nl, (yk, _sn, _is) in NOTION_CHANNEL_MAP.items():
                if ch_label and ch_label.lower().replace(" ", "") == nl.lower().replace(" ", ""):
                    ch_key = yk
                    break
            # 채널 명시 없으면 제목에서 추측
            if ch_key == "manual" and ch_label == "":
                for nl, (yk, _sn, _is) in NOTION_CHANNEL_MAP.items():
                    if nl.replace(" ", "") in title.replace(" ", ""):
                        ch_key = yk
                        break
            category = (r.get("카테고리") or "").strip() or None
            memo_parts: list[str] = []
            for k in ("메모", "행사유형", "할인부담주체", "할인율(%)", "예상매출(원)", "업체명", "업체연락처", "마진율(%)"):
                v = (r.get(k) or "").strip()
                if v:
                    memo_parts.append(f"{k}: {v}")
            memo = " | ".join(memo_parts) or None
            url = (r.get("출처 URL") or "").strip() or None
            deadline = _parse_date_kr(r.get("신청마감일") or "")
            print(f"  + {title[:50]:50s} ch={ch_key:18s} date={date_iso} deadline={deadline}")
            if not dry:
                dedup = add_manual_event(
                    conn, channel_key=ch_key, title=title,
                    deadline=deadline, url=url, memo=memo, category=category,
                )
                # 기간이 단일 날짜면 sale_start=sale_end
                if date_iso:
                    set_event_period(conn, dedup, date_iso, date_iso)
                n_added += 1
    print(f"  → {n_added}건 추가")
    return n_added


def validate_against_settle() -> None:
    """정산자동화웹의 facets 와 노션 채널 매핑 검증."""
    print("\n=== 정산자동화웹 검증 ===")
    try:
        with SettleClient() as c:
            facets = c.facets()
    except SettleAuthError as e:
        print(f"  [SKIP] 정산자동화웹 인증 실패: {e}")
        return
    except Exception as e:
        print(f"  [SKIP] 정산자동화웹 호출 실패: {e}")
        return
    settle_channels = set(facets.get("channels", []) if isinstance(facets, dict) else [])
    print(f"  정산자동화웹 channels: {sorted(settle_channels)}")
    print()
    print(f"  {'노션 채널':14s}  → 정산자동화웹  매핑상태")
    print("  " + "-" * 60)
    for nl, (yk, sn, _is) in NOTION_CHANNEL_MAP.items():
        if sn.startswith("yaml:"):
            mark = "📰 정산자동화웹 없음 (정보채널)"
        elif sn in settle_channels:
            mark = "✅ 매핑 OK"
        else:
            mark = f"⚠️ 정산자동화웹에 없음 (settle_name={sn})"
        print(f"  {nl:14s}  → {sn:20s}  {mark}")


def main() -> None:
    p = argparse.ArgumentParser(description="노션 export CSV 임포트")
    p.add_argument("--dry", action="store_true", help="DB 수정 없이 미리보기")
    p.add_argument("--skip-validate", action="store_true", help="정산자동화웹 검증 skip")
    args = p.parse_args()

    if not IMPORT_DIR.exists():
        print(f"ERROR: {IMPORT_DIR} 폴더 없음. 노션 CSV 4개를 이 폴더에 넣으세요:", file=sys.stderr)
        print("  - md_contacts.csv", file=sys.stderr)
        print("  - events.csv", file=sys.stderr)
        print("  - vendor_master.csv", file=sys.stderr)
        sys.exit(2)

    if not args.skip_validate:
        validate_against_settle()

    print()
    if args.dry:
        print("=== DRY RUN — DB 변경 없음 ===")

    import_vendor_master(args.dry)
    import_contacts(args.dry)
    import_events(args.dry)

    print()
    print("✓ 임포트 완료" + (" (dry-run)" if args.dry else ""))
    print()
    if not args.dry:
        print("다음:")
        print("  uv run python -m crawler.run dump-json")
        print("  sudo systemctl restart doa-md-web")


if __name__ == "__main__":
    main()
