"""마진 계산 — 정산자동화웹 공식 그대로.

영업이익 = 매출 − 원가 − 수수료 − 택배비
마진율   = 영업이익 / 매출
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class MarginInput:
    sale_price: int          # 행사가 (단가)
    cost: int                # SKU 원가
    fee_rate: float          # 채널 수수료율 (0.0 ~ 1.0)
    shipping: int = 0        # 건당 택배비
    qty: int = 1


@dataclass
class MarginResult:
    revenue: int
    cost_total: int
    fee_total: int
    shipping_total: int
    operating_profit: int
    margin_rate: float       # 0.0 ~ 1.0

    @property
    def is_loss(self) -> bool:
        return self.operating_profit < 0


def estimate(m: MarginInput) -> MarginResult:
    revenue = m.sale_price * m.qty
    cost_total = m.cost * m.qty
    fee_total = round(revenue * m.fee_rate)
    shipping_total = m.shipping * m.qty
    profit = revenue - cost_total - fee_total - shipping_total
    rate = profit / revenue if revenue else 0.0
    return MarginResult(revenue, cost_total, fee_total, shipping_total, profit, rate)
