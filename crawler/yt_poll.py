"""YouTube Data API v3 댓글 폴링.

영상 ID 별로 commentThreads endpoint 호출 → 새 댓글 ad_comments insert.

API 키:
- https://console.cloud.google.com → APIs & Services
- YouTube Data API v3 enable → 자격증명 → API 키 생성
- .env 에 YOUTUBE_API_KEY=... 추가

비용: 무료 (할당량 일 10,000 unit, commentThreads.list = 1 unit/호출).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

from .store import (
    connect, add_ad_comment, yt_list_videos, yt_mark_polled,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def fetch_video_comments(video_id: str, api_key: str, max_pages: int = 5) -> list[dict]:
    """commentThreads.list API → 댓글 list (페이지네이션).

    Returns: [{external_id, author, text, posted_at, like_count}, ...]
    """
    out: list[dict] = []
    page_token: str | None = None
    pages = 0
    while pages < max_pages:
        params = {
            "part": "snippet",
            "videoId": video_id,
            "maxResults": "100",
            "order": "time",
            "textFormat": "plainText",
            "key": api_key,
        }
        if page_token:
            params["pageToken"] = page_token
        r = httpx.get(
            "https://www.googleapis.com/youtube/v3/commentThreads",
            params=params,
            timeout=20.0,
        )
        if r.status_code != 200:
            err = r.json().get("error", {}).get("message", r.text[:200])
            raise RuntimeError(f"YouTube API {r.status_code}: {err}")
        data = r.json()
        for item in data.get("items", []):
            top = (item.get("snippet") or {}).get("topLevelComment", {}).get("snippet", {})
            out.append({
                "external_id": item.get("id"),
                "author": top.get("authorDisplayName"),
                "text": top.get("textDisplay") or top.get("textOriginal") or "",
                "posted_at": top.get("publishedAt"),
                "like_count": top.get("likeCount", 0),
            })
        page_token = data.get("nextPageToken")
        pages += 1
        if not page_token:
            break
    return out


def poll_all_videos() -> dict:
    """등록된 모든 active 영상 → 새 댓글 수집 → ad_comments insert.

    Returns: {videos: N, new_comments: N, errors: [...]}
    """
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return {"error": "YOUTUBE_API_KEY 미설정 — .env 확인"}

    n_new = 0
    n_total = 0
    errors: list[str] = []
    with connect() as conn:
        videos = yt_list_videos(conn, active_only=True)
    for v in videos:
        vid = v["video_id"]
        label = v.get("label") or v.get("title") or vid
        print(f"  - {label} ({vid}) 폴링 중...", flush=True)
        try:
            comments = fetch_video_comments(vid, api_key, max_pages=3)
        except Exception as e:
            err = f"{vid}: {e}"
            print(f"    ✗ {err}", flush=True)
            errors.append(err)
            continue
        print(f"    가져온 댓글: {len(comments)}", flush=True)
        n_total += len(comments)
        with connect() as conn:
            for c in comments:
                if not c["text"]:
                    continue
                cid = add_ad_comment(
                    conn,
                    platform="youtube",
                    comment_text=c["text"],
                    post_url=f"https://www.youtube.com/watch?v={vid}",
                    post_label=label,
                    author=c.get("author"),
                    posted_at=c.get("posted_at"),
                    external_id=c.get("external_id"),
                )
                if cid > 0:
                    n_new += 1
            yt_mark_polled(conn, vid, len(comments))

    print(f"\n✓ {len(videos)}개 영상 폴링 — 총 {n_total} 댓글 중 신규 {n_new}건")
    if errors:
        print(f"  오류 {len(errors)}건: {errors[:3]}")
    return {"videos": len(videos), "total_comments": n_total, "new_comments": n_new, "errors": errors}


def main() -> None:
    import argparse
    p = argparse.ArgumentParser(description="YouTube 댓글 폴링")
    p.parse_args()
    result = poll_all_videos()
    if "error" in result:
        print(f"ERROR: {result['error']}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
