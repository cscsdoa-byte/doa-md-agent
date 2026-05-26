"""토스쇼핑 건별 정산 csv 파서.

토스 판매자센터에서 다운받은 '건별 정산 내역' csv 를 받아 주문번호별 fee 를
계산해서 orders.fee 컬럼을 업데이트한다.

csv 핵심 컬럼:
  [0]  주문번호                  — orders.order_no 와 매칭
  [22] 수수료 합계               — 결제+판매 수수료 + 부가세 모두 합한 값 (음수)
                                    ← 토스가 광고전환/오늘출발 면제까지 이미 분기해서 합산해줌

한 주문번호에 여러 행(상품/배송비 분리)이 있을 수 있어 합산 처리.
fee 값은 csv 에 음수로 들어오므로 abs() 적용 (Order.fee 는 양수로 저장).
"""
from __future__ import annotations

import csv
import io
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from ..models import Order


def parse_toss_settlement(file_content: bytes, db: Session) -> dict[str, Any]:
    """csv 바이트 → 주문번호별 fee 합산 → orders.fee 업데이트.

    Returns:
        {csv_rows, orders_updated, not_matched_count, not_matched_sample}
    """
    # 인코딩 — 토스 csv 는 utf-8-sig (BOM)
    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_content.decode("cp949", errors="replace")

    reader = csv.reader(io.StringIO(text))

    # 헤더 찾기 — csv 첫 줄이 빈 줄이거나 BOM-only 일 수 있음
    header: list[str] | None = None
    for row in reader:
        if row and "주문번호" in row:
            header = row
            break
    if not header:
        return {"error": "header not found — '주문번호' 컬럼이 있는 헤더 행을 못 찾음"}

    required = ["주문번호", "수수료 합계"]
    missing = [c for c in required if c not in header]
    if missing:
        return {"error": f"missing columns: {missing}"}

    idx_order = header.index("주문번호")
    idx_fee = header.index("수수료 합계")

    # 주문번호별 fee 합산 (한 주문에 여러 행 가능 — 상품/배송비 등)
    fee_by_order: dict[str, float] = {}
    parse_errors = 0
    for row in reader:
        if len(row) <= max(idx_order, idx_fee):
            continue
        order_no = (row[idx_order] or "").strip()
        if not order_no:
            continue
        raw_fee = (row[idx_fee] or "0").strip().replace(",", "")
        try:
            fee = abs(float(raw_fee))
        except ValueError:
            parse_errors += 1
            continue
        fee_by_order[order_no] = fee_by_order.get(order_no, 0) + fee

    # DB 업데이트
    updated = 0
    not_matched: list[str] = []
    for order_no, fee_total in fee_by_order.items():
        result = db.execute(
            update(Order)
            .where(Order.channel == "토스쇼핑", Order.order_no == order_no)
            .values(fee=fee_total)
        )
        if result.rowcount > 0:
            updated += int(result.rowcount)
        else:
            not_matched.append(order_no)
    db.commit()

    return {
        "csv_orders": len(fee_by_order),
        "orders_updated": updated,
        "not_matched_count": len(not_matched),
        "not_matched_sample": not_matched[:5],
        "parse_errors": parse_errors,
    }
