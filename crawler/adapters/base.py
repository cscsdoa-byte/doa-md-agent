from __future__ import annotations

import hashlib
import importlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class EventPost:
    """채널에서 수집한 행사 공고 한 건."""

    channel_key: str
    title: str
    url: str
    posted_at: datetime | None = None
    deadline_at: datetime | None = None
    discount_hint: str | None = None
    raw_text: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def dedup_id(self) -> str:
        h = hashlib.sha1(f"{self.channel_key}|{self.url}".encode()).hexdigest()
        return h[:16]


class Adapter(ABC):
    """채널 어댑터 인터페이스.

    fetch() 는 새 공고 후보를 모두 반환한다. 중복 제거/저장은 파이프라인이 한다.
    """

    def __init__(self, channel: dict[str, Any]):
        self.channel = channel
        self.key: str = channel["key"]
        self.name: str = channel["name"]

    @abstractmethod
    def fetch(self) -> list[EventPost]:
        ...


_ADAPTER_BY_TYPE: dict[str, str] = {
    "rss": "crawler.adapters.rss_adapter:RssAdapter",
    "html": "crawler.adapters.html_adapter:HtmlAdapter",
    "playwright": "crawler.adapters.playwright_adapter:PlaywrightAdapter",
}


def load_adapter(channel: dict[str, Any]) -> Adapter:
    adapter_type = channel["adapter"]
    target = _ADAPTER_BY_TYPE.get(adapter_type)
    if not target:
        raise ValueError(f"Unknown adapter type: {adapter_type}")
    module_path, cls_name = target.split(":")
    module = importlib.import_module(module_path)
    cls = getattr(module, cls_name)
    return cls(channel)
