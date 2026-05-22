"""정산자동화웹 자동 로그인 → Bearer 토큰 추출 → .env 갱신.

8시간 만료 토큰을 매번 수동 갱신하지 않게 자동화. SETTLE_USER/SETTLE_PASS 필요.
헤드리스 chromium 으로 로그인 → 첫 /api/* 요청의 Authorization 헤더 캡쳐
또는 localStorage 우선 조회.

사용:
  uv run python -m crawler.auto_login
  uv run python -m crawler.auto_login --headed   # 디버깅: 브라우저 보이게

작업 스케줄러에 7시간 주기로 등록 권장 (8시간 만료 → 1시간 여유).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)


def login_and_capture_token(headed: bool = False, timeout_ms: int = 20000) -> str | None:
    from playwright.sync_api import sync_playwright

    base = os.getenv("SETTLE_BASE_URL", "http://3.37.214.243").rstrip("/")
    user = os.getenv("SETTLE_USER", "").strip()
    pw = os.getenv("SETTLE_PASS", "").strip()
    if not user or not pw:
        print("ERROR: .env 의 SETTLE_USER / SETTLE_PASS 가 비었습니다.", file=sys.stderr)
        return None

    captured_tokens: list[str] = []
    bearer_re = re.compile(r"Bearer\s+(.+)", re.IGNORECASE)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        ctx = browser.new_context()
        page = ctx.new_page()

        def on_request(req: object) -> None:
            try:
                url = req.url  # type: ignore[attr-defined]
                headers = req.headers  # type: ignore[attr-defined]
            except AttributeError:
                return
            if "/api/" not in url:
                return
            auth = headers.get("authorization") if isinstance(headers, dict) else None
            if not auth:
                return
            m = bearer_re.match(auth)
            if m:
                captured_tokens.append(m.group(1).strip())

        page.on("request", on_request)

        page.goto(base + "/login", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector('input[autocomplete="username"]', timeout=timeout_ms)
        page.fill('input[autocomplete="username"]', user)
        page.fill('input[autocomplete="current-password"]', pw)
        page.click('button:has-text("로그인")')

        # 로그인 후 dashboard 로 이동 + 첫 API 호출 트리거 대기
        try:
            page.wait_for_url(re.compile(r".*/dashboard.*"), timeout=timeout_ms)
        except Exception:
            pass
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass

        # localStorage 우선 시도 (가장 안정적)
        ls_keys = ["access_token", "accessToken", "token", "settle_token", "auth_token"]
        ls_token = page.evaluate(
            "keys => { for (const k of keys) { const v = localStorage.getItem(k); if (v && v.length > 30) return v; } return null; }",
            ls_keys,
        )
        browser.close()

    if isinstance(ls_token, str) and len(ls_token) > 30:
        return ls_token.strip()
    if captured_tokens:
        # 가장 긴 후보 채택 (JWT 가 다른 헤더보다 길 가능성)
        return max(captured_tokens, key=len)
    return None


def update_env_token(new_token: str) -> bool:
    if not ENV_PATH.exists():
        print(f"ERROR: {ENV_PATH} 없음", file=sys.stderr)
        return False
    text = ENV_PATH.read_text(encoding="utf-8")
    pattern = r"^SETTLE_API_TOKEN=.*$"
    if re.search(pattern, text, re.MULTILINE):
        text = re.sub(pattern, f"SETTLE_API_TOKEN={new_token}", text, flags=re.MULTILINE)
    else:
        if not text.endswith("\n"):
            text += "\n"
        text += f"SETTLE_API_TOKEN={new_token}\n"
    ENV_PATH.write_text(text, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="정산자동화웹 자동 로그인 → 토큰 갱신")
    parser.add_argument("--headed", action="store_true", help="브라우저 창 보이게 (디버깅용)")
    args = parser.parse_args()

    token = login_and_capture_token(headed=args.headed)
    if not token:
        print("ERROR: 토큰 추출 실패. --headed 로 한 번 시도해서 로그인이 되는지 확인.", file=sys.stderr)
        sys.exit(1)
    if update_env_token(token):
        print(f"✓ 토큰 갱신 완료 ({len(token)} chars)")
        # 토큰 앞 12자만 표시 (전체 노출 안 함)
        print(f"  preview: {token[:12]}...")
    else:
        print("ERROR: .env 갱신 실패", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
