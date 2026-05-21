from __future__ import annotations

from datetime import datetime
from time import mktime

import feedparser

from .base import Adapter, EventPost


class RssAdapter(Adapter):
    def fetch(self) -> list[EventPost]:
        url = self.channel["urls"]["list"]
        feed = feedparser.parse(url)
        out: list[EventPost] = []
        for entry in feed.entries:
            posted_at: datetime | None = None
            if getattr(entry, "published_parsed", None):
                posted_at = datetime.fromtimestamp(mktime(entry.published_parsed))
            out.append(
                EventPost(
                    channel_key=self.key,
                    title=getattr(entry, "title", "").strip(),
                    url=getattr(entry, "link", ""),
                    posted_at=posted_at,
                    raw_text=getattr(entry, "summary", "") or None,
                )
            )
        return out
