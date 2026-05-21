from __future__ import annotations

from pathlib import Path

from .base import Adapter, EventPost

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"


class PlaywrightAdapter(Adapter):
    """셀러 로그인 필요 채널용 (쿠팡 Wing / 11번가 / 토스 / G마켓).

    세션 부트스트랩 흐름:
      1) python -m crawler.bootstrap_session <channel_key>
         → headed 브라우저로 수동 로그인 → storage/<key>.json 저장
      2) 이후 fetch() 는 해당 storageState 재사용 (headless)
    세션 만료 감지 시 슬랙으로 재로그인 요청 알림.
    """

    def storage_path(self) -> Path:
        return STORAGE_DIR / f"{self.key}.json"

    def fetch(self) -> list[EventPost]:
        if not self.storage_path().exists():
            raise RuntimeError(
                f"[{self.key}] 세션 없음 — `python -m crawler.bootstrap_session {self.key}` 먼저 실행"
            )
        raise NotImplementedError(
            f"[{self.key}] PlaywrightAdapter 미구현 — 로그인 흐름 잡힌 뒤 채울 예정"
        )
