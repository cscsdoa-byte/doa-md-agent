"""정산자동화웹 facets API → 채널 마스터 DB 동기화.

호출 흐름:
  1. SettleClient.facets() → {brands, channels, dates_with_data}
  2. channels 목록을 channels_master 테이블에 upsert (source='settle')
  3. yaml 의 정보채널 (판판대로/ONMD/아이보스/셀러나우) 도 함께 seed (source='yaml')

채널 약어/판매여부 매핑은 _CHANNEL_HINTS 에 하드코딩 — 정산자동화웹엔 그 정보가 없음.
새 채널이 facets 에 나타나면 abbr=null 로 등록되고, 사용자가 UI 에서 수정 가능.

사용:  uv run python -m crawler.sync_channels        # 동기화
       uv run python -m crawler.sync_channels --dry  # 미리보기
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml as yamlmod
from dotenv import load_dotenv

from api.settle_client import SettleAuthError, SettleClient
from crawler.store import (
    connect,
    list_channels_master,
    upsert_channel_master,
)

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# 정산자동화웹 채널명 → (abbr, is_sales, default_fee_rate, yaml_key)
_CHANNEL_HINTS: dict[str, tuple[str, bool, float, str | None]] = {
    "스마트스토어": ("N",   True,  0.0273, "naver_smartstore"),
    "스스":         ("N",   True,  0.0273, "naver_smartstore"),  # 표기 다른 동일 채널
    "쿠팡":         ("C",   True,  0.106,  "coupang_wing"),
    "11번가":       ("11",  True,  0.13,   "11st_soffice"),
    "토스쇼핑":     ("T",   True,  0.08,   "toss_shopping"),
    "지마켓":       ("ESM", True,  0.13,   "esmplus"),
    "옥션":         ("ESM", True,  0.13,   "esmplus"),
    "쇼핑엔티":     ("엔티", True,  0.15,   "shoppingnT"),
    "오늘의집":     ("오집", True,  0.12,   None),
    "자사몰":       ("자몰", False, 0.0,    None),  # 자체 운영 — 모니터링 X 하지만 매출 잡힘
    "문자주문":     ("문자", False, 0.0,    None),  # 오프라인
    "전화주문":     ("전화", False, 0.0,    None),  # 오프라인
}

# yaml 만 있는 정보채널 (정산자동화웹엔 없음)
_YAML_INFO_CHANNELS: list[tuple[str, str, str]] = [
    # (settle_name placeholder, display_name, abbr) — settle_name 은 'yaml:' prefix 로 구분
    ("yaml:fanfandaero", "판판대로 (정부지원)", "F"),
    ("yaml:sellernow",   "셀러나우",            "SN"),
    ("yaml:onmd_mdlounge", "ONMD",              "O"),
    ("yaml:iboss",       "아이보스",            "보"),
]


def sync(dry: bool = False) -> int:
    try:
        with SettleClient() as c:
            facets = c.facets()
    except SettleAuthError as e:
        print(f"AUTH ERROR: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"ERROR: 정산자동화웹 호출 실패 — {e}", file=sys.stderr)
        return 1

    channels = facets.get("channels", []) if isinstance(facets, dict) else []
    if not channels:
        print("WARN: facets 응답에 channels 가 없거나 비어있음", file=sys.stderr)
        return 1

    print(f"정산자동화웹 channels: {channels}")
    new_count = 0
    update_count = 0

    if dry:
        for name in channels:
            hint = _CHANNEL_HINTS.get(name)
            if hint:
                abbr, is_sales, fee, yk = hint
                print(f"  {name} → abbr={abbr} is_sales={is_sales} fee={fee} yaml_key={yk}")
            else:
                print(f"  {name} → (힌트 없음 — abbr 미정, 판매채널로 가정)")
        for sn, dn, abbr in _YAML_INFO_CHANNELS:
            print(f"  [yaml] {dn} → abbr={abbr} (정보채널)")
        return 0

    with connect() as conn:
        existing = {r["settle_name"] for r in list_channels_master(conn)}
        # 정산자동화웹 채널 upsert
        for name in channels:
            hint = _CHANNEL_HINTS.get(name)
            if hint:
                abbr, is_sales, fee, yk = hint
            else:
                abbr, is_sales, fee, yk = None, True, None, None
            upsert_channel_master(
                conn,
                settle_name=name,
                display_name=name,
                yaml_key=yk,
                is_sales=is_sales,
                abbr=abbr,
                default_fee_rate=fee,
                source="settle",
            )
            if name in existing:
                update_count += 1
            else:
                new_count += 1
        # yaml 정보채널 seed (없으면)
        for sn, dn, abbr in _YAML_INFO_CHANNELS:
            if sn not in existing:
                upsert_channel_master(
                    conn,
                    settle_name=sn,
                    display_name=dn,
                    yaml_key=sn.replace("yaml:", ""),
                    is_sales=False,
                    abbr=abbr,
                    default_fee_rate=0.0,
                    source="yaml",
                )
                new_count += 1

    print(f"✓ 동기화 완료 — 신규 {new_count}건, 갱신 {update_count}건")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="정산자동화웹 채널 → DB 동기화")
    p.add_argument("--dry", action="store_true", help="DB 쓰지 않고 미리보기만")
    args = p.parse_args()
    sys.exit(sync(args.dry))


if __name__ == "__main__":
    main()
