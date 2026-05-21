"""정산자동화웹 매출 데이터 ↔ 행사 매칭.

행사에 등록된 SKU 이름 + 기간 + (옵션) 채널로 정산자동화웹의 top-products 매출을
조회한 후, SKU 이름 부분일치로 매칭. 결과는 합계 + 항목별 디테일.
"""

from __future__ import annotations

from typing import Any

from .settle_client import SettleClient

NUMERIC_KEYS = ("sale", "cost", "fee", "shipping", "ad_spend", "profit", "qty", "orders")


def _norm(s: object) -> str:
    return (str(s) if s is not None else "").strip()


def _match(sku_name: str, product_name: str) -> bool:
    a, b = _norm(sku_name), _norm(product_name)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def fetch_event_sales(
    sku_names: list[str],
    start: str,
    end: str,
    channels: list[str] | None = None,
    brand: str | None = None,
    limit: int = 500,
) -> dict[str, Any]:
    """SKU 이름 리스트로 정산자동화웹 top-products 조회 + 매칭.

    channels = ["스마트스토어", "스스"] 같은 정산자동화웹 채널명 리스트.
    여러 채널을 합산하려면 각각 호출 후 product_name 으로 dedup-merge.

    Returns:
        {
          "matched":   [{...}, ...],  # 등록 SKU에 매칭된 항목 (채널 합산)
          "totals":    {sale, cost, fee, shipping, ad_spend, profit, qty, orders},
          "unmatched": [매출 없거나 이름 불일치인 등록 SKU 이름들],
          "all_count": N,             # 채널별 top-products 합계 (참고용)
          "channels_used": [...],     # 실제 호출에 사용한 채널들
        }
    """
    channels_used: list[str] = []
    all_products: list[dict] = []

    with SettleClient() as c:
        if channels:
            for ch in channels:
                params: dict[str, Any] = {"start": start, "end": end, "limit": limit, "channel": ch}
                if brand:
                    params["brand"] = brand
                try:
                    ps = c.top_products(**params)
                    if isinstance(ps, list):
                        all_products.extend(ps)
                        channels_used.append(ch)
                except Exception:  # 채널 한두 개 실패해도 나머지는 진행
                    continue
        else:
            params = {"start": start, "end": end, "limit": limit}
            if brand:
                params["brand"] = brand
            ps = c.top_products(**params)
            if isinstance(ps, list):
                all_products = ps

    # 같은 product_name 항목이 여러 채널에서 오면 수치 합산 (top-products 채널별 호출이라)
    merged: dict[str, dict] = {}
    for p in all_products:
        key = _norm(p.get("product_name"))
        if not key:
            continue
        if key not in merged:
            merged[key] = {"product_name": p.get("product_name"), "brand": p.get("brand")}
            for k in NUMERIC_KEYS:
                merged[key][k] = 0.0
        for k in NUMERIC_KEYS:
            v = p.get(k)
            if v is not None:
                merged[key][k] += float(v)

    matched: list[dict] = []
    matched_names: set[str] = set()
    for name in sku_names:
        for key, p in merged.items():
            if _match(name, p["product_name"]):
                if p not in matched:
                    matched.append(p)
                matched_names.add(name)

    totals = {k: 0.0 for k in NUMERIC_KEYS}
    for m in matched:
        for k in NUMERIC_KEYS:
            totals[k] += float(m.get(k, 0) or 0)

    # 영업이익 = 매출 - 원가 - 수수료 - 택배비 (정산자동화웹 공식, 광고비 미차감)
    # top-products.profit 은 광고비까지 차감된 "순이익" → net_profit 으로 명칭 명확화
    totals["operating_profit"] = (
        totals["sale"] - totals["cost"] - totals["fee"] - totals["shipping"]
    )
    totals["net_profit"] = totals.pop("profit", 0.0)
    # 주의: top-products 의 ad_spend 는 채널 필터에 영향 안 받음 (전 채널 광고비).
    # 채널 필터 시 net_profit 은 부정확 — 영업이익은 정확.
    totals["ad_spend_is_filtered"] = not bool(channels_used)

    return {
        "matched": matched,
        "totals": totals,
        "unmatched": [n for n in sku_names if n not in matched_names],
        "all_count": len(all_products),
        "channels_used": channels_used,
    }
