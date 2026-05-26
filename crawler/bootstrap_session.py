"""셀러센터 1회 수동 로그인 → storageState 저장.

사용:
  uv run python -m crawler.bootstrap_session <channel_key>

흐름:
  1) channels.yaml 에서 <channel_key> 의 urls.login 읽음
  2) Playwright headed 브라우저 열고 그 URL 로 이동
  3) 사용자가 직접 ID/PW + 2FA 로그인
  4) 콘솔에 Enter 입력하면 storageState 를 crawler/storage/<channel_key>.json 에 저장
  5) 이후 crawl 명령은 이 storage 를 재사용해 headless 로 동작

세션 만료 시(보통 30일 정도) 다시 실행하면 됨.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

CHANNELS_YAML = Path(__file__).resolve().parent / "channels.yaml"
STORAGE_DIR = Path(__file__).resolve().parent / "storage"


def load_channel(key: str) -> dict:
    with CHANNELS_YAML.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    for ch in data.get("channels", []):
        if ch.get("key") == key:
            return ch
    raise SystemExit(f"ERROR: channels.yaml 에 key='{key}' 없음")


def main() -> None:
    p = argparse.ArgumentParser(description="셀러센터 수동 로그인 → 세션 저장")
    p.add_argument("channel_key", help="channels.yaml 의 key (예: toss_shopping)")
    p.add_argument(
        "--url",
        default=None,
        help="login URL 강제 지정 (yaml 의 urls.login 이 비었을 때)",
    )
    args = p.parse_args()

    ch = load_channel(args.channel_key)
    if ch.get("auth") != "session":
        print(
            f"WARN: '{args.channel_key}' 는 auth=session 채널이 아님 (auth={ch.get('auth')})",
            file=sys.stderr,
        )
    login_url = args.url or (ch.get("urls") or {}).get("login")
    if not login_url:
        raise SystemExit(
            f"ERROR: '{args.channel_key}' 의 login URL 없음. "
            f"channels.yaml 의 urls.login 채우거나 --url 로 직접 지정."
        )

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    storage_path = STORAGE_DIR / f"{args.channel_key}.json"

    print(f"=== {args.channel_key} 세션 부트스트랩 ===")
    print(f"login URL: {login_url}")
    print(f"저장 위치: {storage_path}")
    print()
    print("1) 잠시 후 브라우저가 열립니다. 평소처럼 로그인하세요 (2FA 포함).")
    print("2) 로그인 완료 후, 이 콘솔로 돌아와 Enter 입력하면 세션 저장.")
    print("   (브라우저 닫지 말고 콘솔에서 Enter)")
    print()

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto(login_url, wait_until="domcontentloaded")
        except Exception as e:
            print(f"[warn] 초기 URL 이동 실패 ({e}) — 직접 브라우저 주소창에 입력하셔도 됩니다.")

        try:
            input("\n>>> 로그인 끝나면 Enter (Ctrl+C 로 취소) ... ")
        except KeyboardInterrupt:
            print("\n취소됨. 세션 저장 안 함.")
            context.close()
            browser.close()
            return

        context.storage_state(path=str(storage_path))
        context.close()
        browser.close()

    print(f"\n✓ 세션 저장 완료: {storage_path}")
    print("이제 `uv run python -m crawler.run crawl -c {key}` 로 헤드리스 크롤링 가능".format(
        key=args.channel_key,
    ))


if __name__ == "__main__":
    main()
