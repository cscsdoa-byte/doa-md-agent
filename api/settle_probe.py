"""정산자동화웹 데이터 구조 확인용 CLI.

사용:
  uv run python -m api.settle_probe          # facets/skus 일부 출력
  uv run python -m api.settle_probe --raw    # JSON 원본 그대로
"""

from __future__ import annotations

import argparse
import json
import sys

from .settle_client import SettleAuthError, SettleClient

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")


def _dump(label: str, value: object, raw: bool, limit: int = 5) -> None:
    print(f"\n=== {label} ===")
    if raw:
        print(json.dumps(value, ensure_ascii=False, indent=2, default=str)[:4000])
        return
    if isinstance(value, list):
        print(f"(list, {len(value)} items, showing first {min(limit, len(value))})")
        for item in value[:limit]:
            print(json.dumps(item, ensure_ascii=False, default=str))
    elif isinstance(value, dict):
        print(f"keys: {list(value.keys())}")
        for k, v in value.items():
            preview = json.dumps(v, ensure_ascii=False, default=str)
            print(f"  {k}: {preview[:200]}{'…' if len(preview) > 200 else ''}")
    else:
        print(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="정산자동화웹 데이터 구조 점검")
    parser.add_argument("--raw", action="store_true", help="JSON 원본 그대로 덤프")
    args = parser.parse_args()

    with SettleClient() as c:
        if not c.token:
            print("ERROR: .env 의 SETTLE_API_TOKEN 이 비어있습니다.", file=sys.stderr)
            print("브라우저로 http://3.37.214.243 로그인 후 DevTools → Network 탭에서", file=sys.stderr)
            print("/api/* 요청의 Request Headers → 'Authorization: Bearer …' 토큰을 복사해 넣으세요.", file=sys.stderr)
            sys.exit(2)
        try:
            _dump("health", c.health(), args.raw)
            _dump("facets (채널/필터 목록)", c.facets(), args.raw)
            _dump("skus (상품 마스터)", c.skus(), args.raw)
        except SettleAuthError as e:
            print(f"\nAUTH ERROR: {e}", file=sys.stderr)
            sys.exit(2)


if __name__ == "__main__":
    main()
