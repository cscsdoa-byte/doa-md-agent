from __future__ import annotations

from .base import Adapter, EventPost


class HtmlAdapter(Adapter):
    """채널별 셀렉터를 channel['selectors'] 에서 받아 파싱.

    카카오 톡딜 / 판판대로 / 셀러나우 처럼 정적 HTML로 공고 목록이
    노출되는 채널용. 현재는 채널별 셀렉터 미정 — 셀렉터 정의 후 채울 것.
    """

    def fetch(self) -> list[EventPost]:
        raise NotImplementedError(
            f"[{self.key}] HtmlAdapter 미구현 — channels.yaml 에 selectors 추가 후 구현"
        )
