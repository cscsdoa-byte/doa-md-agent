"""HTML 리포트 생성 + 브라우저 자동 오픈.

사용:  uv run python -m crawler.report

콘솔에 텍스트로 출력하던 결과를 HTML 한 페이지로 묶고 기본 브라우저로 띄움.
정식 Next.js 대시보드(6번 단계) 만들기 전까지 임시 뷰어.
"""

from __future__ import annotations

import html as _html
import sqlite3
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

from .store import (
    STATUS_LABELS,
    connect,
    get_applied_skus,
    get_event_sales,
    list_recent,
    list_recent_no_deadline,
    stats,
)

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

REPORT_PATH = Path(__file__).resolve().parent.parent / "data" / "report.html"


def _esc(s: object) -> str:
    return _html.escape(str(s)) if s else ""


def _fmt_deadline(iso: str | None) -> tuple[str, str]:
    if not iso:
        return "—", "nodl"
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return iso, ""
    days = (dt.date() - datetime.now().date()).days
    if days < 0:
        return f"{dt.strftime('%m/%d %H:%M')} (지남)", "expired"
    if days == 0:
        return f"오늘 {dt.strftime('%H:%M')}", "today"
    if days <= 3:
        return f"D-{days} ({dt.strftime('%m/%d %H:%M')})", "soon"
    return f"D-{days} ({dt.strftime('%m/%d')})", ""


def _render_skus_period(conn, dedup_id: str, sale_start, sale_end) -> str:
    """등록 SKU + 진행기간 + 캐시된 매출."""
    skus = get_applied_skus(conn, dedup_id)
    sales = get_event_sales(conn, dedup_id)
    parts = []
    if sale_start or sale_end:
        s = sale_start or "?"
        e = sale_end or "?"
        parts.append(f'<span class="period">🗓 {_esc(s)} ~ {_esc(e)}</span>')
    if skus:
        chips = []
        for s in skus[:5]:
            name = s.get("sku_name") or f"#{s.get('sku_id')}"
            price = int(s.get("sale_price", 0))
            qty = s.get("qty_est", 0)
            chips.append(
                f'<span class="skuchip">{_esc(name)} · {price:,}원 · {qty}건</span>'
            )
        if len(skus) > 5:
            chips.append(f'<span class="skuchip">+{len(skus) - 5}</span>')
        parts.append(" ".join(chips))
    if sales and sales.get("data"):
        d = sales["data"]
        t = d.get("totals", {})
        sale = int(t.get("sale", 0))
        op_profit = int(t.get("operating_profit", 0))
        qty = int(t.get("qty", 0))
        expected = int(d.get("expected_revenue", 0))
        ratio = (sale / expected * 100) if expected else 0
        ratio_str = f" ({ratio:.0f}% of 예상)" if expected else ""
        synced = (sales.get("synced_at") or "")[:16]
        chs = ", ".join(d.get("channels_used") or []) or "전체"
        parts.append(
            f'<span class="sales">💰 매출 {sale:,}원 · 영업이익 {op_profit:,}원 · '
            f'{qty}건{ratio_str} <em>[{chs} · {synced}]</em></span>'
        )
    return f'<div class="extras">{" ".join(parts)}</div>' if parts else ""


def render_table(conn, rows: list[sqlite3.Row], show_deadline_col: bool = True) -> str:
    if not rows:
        return '<p class="empty">(해당 공고 없음)</p>'
    body = []
    for r in rows:
        dline, cls = _fmt_deadline(r["deadline_at"])
        status = STATUS_LABELS.get(r["status"], r["status"] or "-")
        status_cls = f"st-{r['status']}"
        short = r["dedup_id"][:6]
        memo_html = (
            f'<div class="memo">📝 {_esc(r["memo"])}</div>' if r["memo"] else ""
        )
        extras_html = _render_skus_period(
            conn, r["dedup_id"], r["sale_start"], r["sale_end"]
        )
        dl_cell = f'<td class="dl">{_esc(dline)}</td>' if show_deadline_col else ""
        body.append(
            f'<tr class="{cls}">'
            f'<td class="sid">{_esc(short)}</td>'
            f'{dl_cell}'
            f'<td class="ch">{_esc(r["channel_key"])}</td>'
            f'<td class="cat">{_esc(r["category"] or "-")}</td>'
            f'<td class="st"><span class="badge {status_cls}">{_esc(status)}</span></td>'
            f'<td class="title">'
            f'<a href="{_esc(r["url"])}" target="_blank" rel="noopener">{_esc(r["title"])}</a>'
            f'{extras_html}{memo_html}</td>'
            "</tr>"
        )
    head_cells = ["ID"]
    if show_deadline_col:
        head_cells.append("마감")
    head_cells.extend(["채널", "카테고리", "상태", "행사명 (클릭→신청 페이지)"])
    head = "".join(f"<th>{c}</th>" for c in head_cells)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def render() -> str:
    with connect() as conn:
        urgent = list_recent(conn, limit=30, doa_only=True, upcoming_days=7)
        later = list_recent(conn, limit=50, doa_only=True, upcoming_days=30)
        nodl = list_recent_no_deadline(conn, limit=20, doa_only=True, posted_within_days=21)
        urgent_ids = {r["dedup_id"] for r in urgent}
        later = [r for r in later if r["dedup_id"] not in urgent_ids]
        s = stats(conn)

        urgent_html = render_table(conn, urgent)
        later_html = render_table(conn, later)
        nodl_html = render_table(conn, nodl, show_deadline_col=False)

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    by_ch = "".join(
        f"<li><span class='ck'>{_esc(k)}</span>: {v}건</li>"
        for k, v in sorted(s["by_channel"].items(), key=lambda x: -x[1])
    )

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>도아 MD 행사 모니터링</title>
<meta http-equiv="refresh" content="600">
<style>
  body {{ font-family: 'Segoe UI', '맑은 고딕', sans-serif; padding: 28px; max-width: 1180px; margin: 0 auto; color: #1a1a1a; line-height: 1.5; }}
  h1 {{ font-size: 1.7em; margin: 0 0 6px 0; }}
  .meta {{ color: #666; font-size: 0.9em; margin-bottom: 28px; }}
  h2 {{ border-bottom: 3px solid #2563eb; padding-bottom: 4px; margin-top: 36px; font-size: 1.25em; color: #1e3a8a; }}
  table {{ border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 0.97em; }}
  th, td {{ border-bottom: 1px solid #e5e7eb; padding: 11px 8px; text-align: left; vertical-align: top; }}
  th {{ background: #f9fafb; font-weight: 600; color: #374151; font-size: 0.9em; }}
  tr.today {{ background: #fee2e2; }}
  tr.today .dl {{ color: #b91c1c; font-weight: 700; }}
  tr.soon .dl {{ color: #ea580c; font-weight: 700; }}
  tr.expired {{ color: #9ca3af; }}
  td.sid {{ white-space: nowrap; font-family: 'Cascadia Code', 'Consolas', monospace; color: #9ca3af; font-size: 0.85em; }}
  td.dl {{ white-space: nowrap; font-family: 'Cascadia Code', 'Consolas', monospace; }}
  td.ch {{ white-space: nowrap; color: #6b7280; font-size: 0.92em; }}
  td.cat {{ white-space: nowrap; color: #2563eb; font-weight: 600; }}
  td.st {{ white-space: nowrap; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.82em; background: #e5e7eb; color: #374151; }}
  .badge.st-new       {{ background: #e5e7eb; color: #374151; }}
  .badge.st-reviewing {{ background: #fef3c7; color: #92400e; }}
  .badge.st-applied   {{ background: #dbeafe; color: #1e40af; }}
  .badge.st-selected  {{ background: #d1fae5; color: #065f46; }}
  .badge.st-running   {{ background: #fce7f3; color: #9d174d; font-weight: 700; }}
  .badge.st-closed    {{ background: #f3f4f6; color: #9ca3af; }}
  .badge.st-skip      {{ background: #f3f4f6; color: #9ca3af; text-decoration: line-through; }}
  .memo {{ color: #6b7280; font-size: 0.88em; margin-top: 4px; padding: 4px 8px; background: #fffbeb; border-left: 3px solid #fbbf24; border-radius: 2px; }}
  .extras {{ margin-top: 6px; }}
  .period {{ display: inline-block; padding: 2px 8px; background: #ecfeff; color: #155e75; border-radius: 6px; font-size: 0.85em; margin-right: 6px; }}
  .skuchip {{ display: inline-block; padding: 2px 8px; background: #f5f3ff; color: #5b21b6; border-radius: 6px; font-size: 0.85em; margin: 2px 4px 0 0; }}
  .sales {{ display: inline-block; padding: 4px 10px; background: #ecfdf5; color: #065f46; border-radius: 6px; font-size: 0.88em; margin-top: 4px; font-weight: 600; }}
  .sales em {{ font-style: normal; color: #6b7280; font-weight: 400; font-size: 0.9em; margin-left: 4px; }}
  td.title a {{ color: #111827; text-decoration: none; }}
  td.title a:hover {{ text-decoration: underline; color: #2563eb; }}
  .empty {{ color: #9ca3af; padding: 10px; }}
  .stats {{ background: #f9fafb; padding: 14px 18px; border-radius: 8px; border: 1px solid #e5e7eb; }}
  .stats ul {{ list-style: none; padding: 0; margin: 0; }}
  .stats li {{ display: inline-block; margin: 4px 16px 4px 0; }}
  .stats .ck {{ font-family: 'Cascadia Code', 'Consolas', monospace; color: #2563eb; }}
  .legend {{ font-size: 0.85em; color: #6b7280; margin-top: 6px; }}
  .footer {{ margin-top: 40px; color: #9ca3af; font-size: 0.85em; text-align: center; }}
</style>
</head>
<body>
<h1>📅 도아 MD 행사 모니터링</h1>
<div class="meta">갱신: {now} · 도아 적합 자동 필터(★) · 10분마다 페이지 자동 새로고침</div>

<h2>🔥 마감 7일 이내 (지금 검토해야 함)</h2>
{urgent_html}
<div class="legend">🟥 오늘 마감 / 🟧 D-3 이내 · 자정 마감은 23:59 기준</div>

<h2>📌 8~30일 이내 마감</h2>
{later_html}

<h2>🆕 최근 게시 — 마감일 미상 (카카오 톡스토어 등)</h2>
{nodl_html}
<div class="legend">제목에서 마감일을 못 뽑은 도아 적합 공고. 본문에서 마감일 확인 필요 — URL 클릭해서 확인.</div>

<h2>📊 채널별 수집 현황</h2>
<div class="stats"><ul>{by_ch}</ul>
<p style="margin-top:10px">전체 <b>{s['total']}</b>건 · 도아 적합 <b>{s['doa_fit']}</b>건</p></div>

<div class="footer">md-report.bat 더블클릭 → 채널 폴링 + 리포트 갱신 자동</div>
</body>
</html>"""


def main() -> None:
    html_str = render()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(html_str, encoding="utf-8")
    abs_uri = REPORT_PATH.resolve().as_uri()
    print(f"리포트: {REPORT_PATH}")
    print(f"여는 중: {abs_uri}")
    webbrowser.open(abs_uri)


if __name__ == "__main__":
    main()
