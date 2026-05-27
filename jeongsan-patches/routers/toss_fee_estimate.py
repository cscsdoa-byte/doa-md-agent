"""토스쇼핑 fee 미반영 자동 보정 patch.

CSV 업로드 안 한 토스 주문(fee=0)에 대해 sale × 0.104 (결제 2.4% + 정산 8%)
worst-case 수수료를 자동 입혀서 영업이익 과대 계상 방지.

CSV 업로드 후 실 fee 로 자동 덮어쓰기 — 기존 toss_settlement.py 가 처리.

## 사용

```python
from app.routers.toss_fee_estimate import apply_toss_fee_estimate

# 이지어드민 import 직후 또는 scheduled job 으로:
report = apply_toss_fee_estimate(db, brand=None, start=None, end=None)
# {orders_patched: N, total_fee_estimated: X원}
```

## 적용 흐름 권장

1. 이지어드민 .xls import (orders 테이블에 토스 주문 들어옴, fee=0)
2. 이 함수 호출 — fee=0 인 토스 주문에 sale × 0.104 자동 입력
3. (월말) MD가 토스 CSV 업로드 → toss_settlement.py 가 실 fee 로 덮어씀

## DB 영향

- orders.fee 컬럼만 UPDATE (기존 컬럼)
- 신규 컬럼 없음 (단순 구조 유지)
- 토스 채널 + fee=0 만 대상 (정확한 값 들어온 주문은 절대 안 건드림)
"""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import and_, func, update
from sqlalchemy.orm import Session

from ..models import Order

# 토스 worst-case 수수료율 (결제 2.4% + 정산 8%)
# 면제(오늘출발/광고전환)는 CSV 업로드 후 실 fee 로 보정됨
TOSS_FEE_RATE = 0.104


def apply_toss_fee_estimate(
    db: Session,
    brand: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> dict[str, Any]:
    """토스 채널 + fee=0 인 주문에 sale × 0.104 자동 입력.

    Args:
        brand: 특정 브랜드만 처리. None = 전체.
        start, end: 주문일 범위 필터. None = 전체.

    Returns:
        {orders_patched: int, total_fee_estimated: float}
    """
    conds = [Order.channel == "토스쇼핑", Order.fee == 0]
    if brand:
        conds.append(Order.brand == brand)
    if start:
        conds.append(Order.order_date >= start)
    if end:
        conds.append(Order.order_date <= end)

    # 보정 전 합계 (리포트용)
    pre = db.query(
        func.count(Order.id).label("n"),
        func.coalesce(func.sum(Order.sale_price), 0).label("total_sale"),
    ).filter(and_(*conds)).first()

    if not pre or pre.n == 0:
        return {"orders_patched": 0, "total_fee_estimated": 0.0}

    # 일괄 UPDATE
    result = db.execute(
        update(Order)
        .where(and_(*conds))
        .values(fee=Order.sale_price * TOSS_FEE_RATE)
    )
    db.commit()

    return {
        "orders_patched": int(result.rowcount or 0),
        "total_fee_estimated": float(pre.total_sale or 0) * TOSS_FEE_RATE,
    }
