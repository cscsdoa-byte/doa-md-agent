"""토스쇼핑 정산 csv 업로드 endpoint.

POST /api/upload/toss-settlement
  - multipart/form-data: file=<csv>
  - 인증: Bearer JWT (require_admin)
  - 응답: {csv_orders, orders_updated, not_matched_count, ...}

사용 예 (curl):
    curl -X POST http://localhost:8000/api/upload/toss-settlement \\
      -H "Authorization: Bearer <TOKEN>" \\
      -F "file=@건별정산내역.csv"

토스 csv 의 fee 가 이미 광고전환/오늘출발 면제를 반영한 정확한 값이므로
orders.fee 에 그대로 덮어쓴다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..db import get_db
from ..models import User
from ..parsers.toss_settlement import parse_toss_settlement

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("/toss-settlement")
async def upload_toss_settlement(
    file: UploadFile = File(...),
    _user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """토스 건별 정산 csv 업로드 → orders.fee 업데이트."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return {"error": "csv 파일만 업로드 가능"}
    content = await file.read()
    return parse_toss_settlement(content, db)
