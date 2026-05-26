"""Playwright 기반 셀러센터 어댑터.

세션 부트스트랩 흐름:
  1) `uv run python -m crawler.bootstrap_session <channel_key>`
     → headed 브라우저 열림 → 사용자가 수동 로그인 → 콘솔 Enter
     → crawler/storage/<key>.json 저장
  2) 이후 fetch() 는 storageState 재사용 (headless)

채널별 페이지 구조가 달라서, PlaywrightAdapter 베이스 + 채널 key 별 _extract()
서브클래스 구현. 새 채널 추가:
  - 이 파일에 ChannelXxxAdapter(PlaywrightAdapter) 만들고 _extract 채우기
  - SUBCLASS_BY_KEY 에 등록
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from .base import Adapter, EventPost

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"


class PlaywrightAdapter(Adapter):
    """공통 베이스. 서브클래스가 _extract(page) 구현."""

    def storage_path(self) -> Path:
        return STORAGE_DIR / f"{self.key}.json"

    def list_url(self) -> str | None:
        urls = (self.channel.get("urls") or {})
        return urls.get("list")

    def fetch(self) -> list[EventPost]:
        list_url = self.list_url()
        if not list_url:
            raise NotImplementedError(
                f"[{self.key}] list URL 미확정 — channels.yaml 의 urls.list 채우기 필요"
            )
        auth_needed = (self.channel.get("auth") == "session")
        storage = self.storage_path()
        if auth_needed and not storage.exists():
            raise RuntimeError(
                f"[{self.key}] 세션 파일 없음 — "
                f"`uv run python -m crawler.bootstrap_session {self.key}` 로 1회 수동 로그인"
            )

        # Playwright import 는 fetch 시점에 (테스트/CI에서 어댑터 인스턴스만 만들 때 불러오지 않게)
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx_kwargs: dict[str, Any] = {}
            if auth_needed:
                ctx_kwargs["storage_state"] = str(storage)
            context = browser.new_context(**ctx_kwargs)
            page = context.new_page()
            try:
                page.goto(list_url, wait_until="domcontentloaded", timeout=30000)
                posts = self._extract(page)
            finally:
                context.close()
                browser.close()
        return posts

    def _extract(self, page) -> list[EventPost]:  # type: ignore[no-untyped-def]
        raise NotImplementedError(
            f"[{self.key}] _extract() 미구현 — 셀러센터 페이지 구조 확인 후 selector 채우기"
        )


def _now() -> datetime:
    return datetime.now()


class TossShoppingAdapter(PlaywrightAdapter):
    """토스쇼핑 판매자센터 공지/행사. list_url = .../notice.

    placeholder — 셀러센터 실제 selector 는 사용자가 페이지 캡쳐/HTML 확인 후 채워야.
    일단 페이지 본문 텍스트에서 행사/모집 키워드가 보이는 줄을 한 건씩 EventPost 로 잡는 보수적 구현.
    """

    KEYWORDS = ("행사", "기획전", "모집", "프로모션", "오늘끝딜", "할인전")

    def _extract(self, page) -> list[EventPost]:
        posts: list[EventPost] = []
        # 첫 단계: 페이지의 모든 <a> 텍스트 + href 수집해서 키워드 매칭.
        # 정확한 컴포넌트 selector 는 사용자 확인 후 교체.
        anchors = page.locator("a").all()
        seen: set[str] = set()
        for a in anchors:
            try:
                text = (a.inner_text(timeout=500) or "").strip()
                href = a.get_attribute("href") or ""
            except Exception:
                continue
            if not text or not href:
                continue
            if not any(k in text for k in self.KEYWORDS):
                continue
            url = href if href.startswith("http") else f"https://partner.tossshopping.com{href}"
            if url in seen:
                continue
            seen.add(url)
            posts.append(EventPost(
                channel_key=self.key,
                title=text[:200],
                url=url,
                posted_at=_now(),
                extra={"source": "playwright_anchor_keyword"},
            ))
        return posts


class StubAdapter(PlaywrightAdapter):
    """URL 또는 selector 미확정 채널용 — fetch 시 즉시 NotImplementedError.

    channels.yaml 에 urls.list 가 채워지고 selector 가 정해지면
    각 채널별 클래스를 만들어 SUBCLASS_BY_KEY 에 등록.
    """

    def _extract(self, page) -> list[EventPost]:
        raise NotImplementedError(
            f"[{self.key}] 어댑터 미구현 — channels.yaml URL 확정 + selector 작성 필요"
        )


SUBCLASS_BY_KEY: dict[str, type[PlaywrightAdapter]] = {
    "toss_shopping": TossShoppingAdapter,
    # 나머지는 URL/selector 확정되면 클래스 추가 후 등록.
    # 현 시점은 StubAdapter 로 fallback (load_adapter 에서 처리).
}


def make_adapter(channel: dict[str, Any]) -> Adapter:
    """key 로 PlaywrightAdapter 서브클래스 선택. 미등록 → StubAdapter."""
    cls = SUBCLASS_BY_KEY.get(channel["key"], StubAdapter)
    return cls(channel)
