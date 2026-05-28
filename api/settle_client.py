"""정산자동화웹 (http://3.37.214.243) API 클라이언트.

인증 방식: Authorization: Bearer <JWT>. `.env` 의 SETTLE_API_TOKEN 에 토큰만 넣음.
토큰 만료 ~8시간 (HS256 JWT, exp 클레임). 만료 시 401 → 재로그인 필요.

확인된 엔드포인트 (메모리 출처):
  /api/health
  /api/dashboard/summary  /facets  /brand-pareto  /top-products
  /api/ads  /api/overhead  /api/skus  /api/settings/brands
  /api/kakao/summary  /api/kakao/stats
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_BASE_URL = "http://3.37.214.243"
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
# 토큰 만료 임박 임계 (초). 12시간 이내면 갱신.
TOKEN_RENEW_THRESHOLD_SEC = 12 * 3600


class SettleAuthError(RuntimeError):
    """세션 쿠키가 없거나 만료된 경우."""


def _jwt_exp(token: str) -> float | None:
    """JWT exp 클레임을 epoch seconds 로 반환. 디코드 실패 시 None."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_b64 = parts[1]
    padding = "=" * ((4 - len(payload_b64) % 4) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
    except Exception:
        return None
    exp = payload.get("exp")
    return float(exp) if isinstance(exp, (int, float)) else None


def _persist_token_to_env(new_token: str) -> None:
    """`.env` 의 SETTLE_API_TOKEN= 줄을 새 토큰으로 교체. 파일 없으면 추가."""
    if not ENV_PATH.exists():
        return
    text = ENV_PATH.read_text(encoding="utf-8")
    line = f"SETTLE_API_TOKEN={new_token}"
    if re.search(r"^SETTLE_API_TOKEN=.*$", text, flags=re.M):
        text = re.sub(r"^SETTLE_API_TOKEN=.*$", line, text, count=1, flags=re.M)
    else:
        text = text.rstrip() + "\n" + line + "\n"
    ENV_PATH.write_text(text, encoding="utf-8")


def auto_login(base_url: str | None = None) -> str:
    """SETTLE_USER/SETTLE_PASS 로 정산자동화웹에 로그인 → 새 access_token 반환.

    성공 시 `.env` 의 SETTLE_API_TOKEN 도 자동 갱신.
    """
    base = (base_url or os.getenv("SETTLE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    user = (os.getenv("SETTLE_USER") or "").strip()
    pw = (os.getenv("SETTLE_PASS") or "").strip()
    if not user or not pw:
        raise SettleAuthError("SETTLE_USER/SETTLE_PASS 가 .env 에 없음 — 자동 로그인 불가")
    r = httpx.post(
        f"{base}/api/auth/login",
        data={"username": user, "password": pw},
        timeout=15,
    )
    if r.status_code != 200:
        raise SettleAuthError(f"auto_login 실패 {r.status_code}: {r.text[:200]}")
    token = (r.json() or {}).get("access_token")
    if not token:
        raise SettleAuthError(f"auto_login 응답에 access_token 없음: {r.text[:200]}")
    _persist_token_to_env(token)
    os.environ["SETTLE_API_TOKEN"] = token
    return token


def ensure_valid_token() -> str:
    """현재 SETTLE_API_TOKEN 이 만료 임박/만료이면 auto_login 으로 갱신.

    notify.py 같은 배치 작업이 시작 직전 호출하면 토큰 만료로 죽지 않음.
    """
    token = (os.getenv("SETTLE_API_TOKEN") or "").strip()
    if not token:
        return auto_login()
    exp = _jwt_exp(token)
    if exp is None:
        return token  # 디코드 못 하면 일단 신뢰 (예전 형식)
    remaining = exp - time.time()
    if remaining < TOKEN_RENEW_THRESHOLD_SEC:
        return auto_login()
    return token


class SettleClient:
    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("SETTLE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.token = token or os.getenv("SETTLE_API_TOKEN") or ""
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self._client = httpx.Client(base_url=self.base_url, headers=headers, timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SettleClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _get(self, path: str, **params: Any) -> Any:
        r = self._client.get(path, params=params or None)
        if r.status_code == 401:
            # 자동 재로그인 1회 시도 — SETTLE_USER/PASS 있으면 새 토큰 받아서 재시도
            try:
                new_token = auto_login(self.base_url)
            except SettleAuthError as e:
                raise SettleAuthError(
                    f"401 from {path} — 자동 로그인 실패: {e}"
                ) from e
            self.token = new_token
            self._client.headers["Authorization"] = f"Bearer {new_token}"
            r = self._client.get(path, params=params or None)
            if r.status_code == 401:
                raise SettleAuthError(f"401 from {path} — 자동 로그인 후에도 거부됨 (계정 점검 필요)")
        r.raise_for_status()
        ct = r.headers.get("content-type", "")
        return r.json() if "json" in ct else r.text

    def health(self) -> Any:
        return self._get("/api/health")

    def facets(self, **params: Any) -> Any:
        """대시보드 필터 패싯 — 채널 목록은 여기에 있을 가능성이 가장 높음."""
        return self._get("/api/dashboard/facets", **params)

    def summary(self, **params: Any) -> Any:
        return self._get("/api/dashboard/summary", **params)

    def top_products(self, **params: Any) -> Any:
        return self._get("/api/dashboard/top-products", **params)

    def skus(self, **params: Any) -> Any:
        """SKU 마스터 — 원가/택배비 보유 가능성."""
        return self._get("/api/skus", **params)
