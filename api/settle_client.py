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

import os
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_BASE_URL = "http://3.37.214.243"


class SettleAuthError(RuntimeError):
    """세션 쿠키가 없거나 만료된 경우."""


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
            raise SettleAuthError(
                f"401 from {path} — SETTLE_API_TOKEN 이 비었거나 만료됨 (재로그인 후 토큰 갱신)"
            )
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
