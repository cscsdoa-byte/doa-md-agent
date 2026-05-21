"""마진 미리보기 CLI.

사용:
  uv run python -m api.margin_cli search 밤설기
  uv run python -m api.margin_cli calc 220 30000        # SKU id 220, 행사가 30000원
  uv run python -m api.margin_cli calc 220 30000 -q 100 # 100건 기준
  uv run python -m api.margin_cli calc 220 30000 -c naver_smartstore  # 특정 채널만
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from .margin import MarginInput, estimate
from .settle_client import SettleAuthError, SettleClient

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

CHANNELS_YAML = Path(__file__).resolve().parent.parent / "crawler" / "channels.yaml"


def load_channels() -> list[dict]:
    with CHANNELS_YAML.open(encoding="utf-8") as f:
        return yaml.safe_load(f)["channels"]


def _int(v) -> int:
    try:
        return int(round(float(v or 0)))
    except (TypeError, ValueError):
        return 0


def cmd_search(query: str, limit: int = 20) -> int:
    q = query.strip()
    if not q:
        print("검색어가 비어있음", file=sys.stderr)
        return 1
    with SettleClient() as c:
        skus = c.skus()
        hits = [s for s in skus if q in (s.get("product_name") or "")]
        if not hits:
            print(f"'{q}' 검색 결과 없음 (전체 {len(skus)}개 SKU 중)")
            return 1
        print(f"\n'{q}' 검색 결과: {len(hits)}건 (상위 {min(limit, len(hits))}건)\n")
        print(f"  {'id':>4s}  {'sku_code':<10s} {'원가':>8s} {'택배':>6s}  {'공급사':<10s} 상품명")
        for s in hits[:limit]:
            print(
                f"  {s.get('id', 0):>4d}  "
                f"{(s.get('sku_code') or '-'):<10s} "
                f"{_int(s.get('cost')):>8,} "
                f"{_int(s.get('shipping_fee')):>6,}  "
                f"{(s.get('supplier') or '-'):<10s} "
                f"{s.get('product_name') or ''}"
            )
    return 0


def cmd_calc(
    sku_id: int,
    sale_price: int,
    qty: int = 1,
    only_channel: str | None = None,
) -> int:
    with SettleClient() as c:
        skus = c.skus()
        sku = next((s for s in skus if s.get("id") == sku_id), None)
        if not sku:
            print(f"SKU id={sku_id} 없음. 먼저 search 로 id 확인하세요.", file=sys.stderr)
            return 1
        cost = _int(sku.get("cost"))
        shipping = _int(sku.get("shipping_fee"))
        name = sku.get("product_name") or "(이름 없음)"

    print()
    print(f"=== {name} ===")
    print(
        f"  SKU id={sku_id}  원가 {cost:,}원  /  건당 택배 {shipping:,}원  "
        f"/  행사가 {sale_price:,}원 × {qty}건"
    )
    print()

    channels = load_channels()
    if only_channel:
        channels = [c for c in channels if c["key"] == only_channel]
        if not channels:
            print(f"채널 key '{only_channel}' 없음", file=sys.stderr)
            return 1

    rows = []
    for ch in channels:
        fee_rate = float(ch.get("default_fee_rate") or 0.0)
        m = estimate(
            MarginInput(
                sale_price=sale_price,
                cost=cost,
                fee_rate=fee_rate,
                shipping=shipping,
                qty=qty,
            )
        )
        rows.append((ch["name"], fee_rate, m))

    rows.sort(key=lambda x: -x[2].margin_rate)

    print(
        f"  {'채널':<24s} {'수수료':>6s}   {'매출':>10s} {'원가':>9s} "
        f"{'수수료':>8s} {'택배':>7s} {'영업이익':>10s} {'마진율':>7s}"
    )
    print("  " + "-" * 100)
    for nm, rate, m in rows:
        warn = " 적자" if m.is_loss else ("  ☆" if m.margin_rate >= 0.20 else "")
        print(
            f"  {nm:<24s} {rate * 100:>5.2f}%  "
            f"{m.revenue:>10,} {m.cost_total:>9,} "
            f"{m.fee_total:>8,} {m.shipping_total:>7,} "
            f"{m.operating_profit:>10,} {m.margin_rate * 100:>6.1f}%{warn}"
        )
    print()
    print("  ※ 수수료율은 channels.yaml 의 default_fee_rate (정산자동화웹 실데이터로 추후 교체 예정)")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(prog="md-margin", description="도아 MD 마진 미리보기 CLI")
    sp = p.add_subparsers(dest="cmd", required=True)

    ps = sp.add_parser("search", help="상품명으로 SKU 검색 (정산자동화웹)")
    ps.add_argument("query", help="검색어 (예: 밤설기)")
    ps.add_argument("-n", "--limit", type=int, default=20)

    pc = sp.add_parser("calc", help="행사가로 채널별 마진 계산")
    pc.add_argument("sku_id", type=int, help="SKU id (search 결과의 id 컬럼)")
    pc.add_argument("sale_price", type=int, help="행사가 (원)")
    pc.add_argument("-q", "--qty", type=int, default=1, help="수량 (기본 1)")
    pc.add_argument("-c", "--channel", default=None, help="특정 채널 key 만 (반복 가능 미지원)")

    args = p.parse_args()
    try:
        if args.cmd == "search":
            sys.exit(cmd_search(args.query, args.limit))
        elif args.cmd == "calc":
            sys.exit(cmd_calc(args.sku_id, args.sale_price, args.qty, args.channel))
    except SettleAuthError as e:
        print(f"AUTH ERROR: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
