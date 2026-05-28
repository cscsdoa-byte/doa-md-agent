from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from crawler.adapters import EventPost, load_adapter
from crawler.parse import is_doa_fit, parse_category, parse_deadline
from crawler.store import (
    STATUS_LABELS,
    STATUS_VALUES,
    add_applied_sku,
    add_attachment,
    add_contact,
    add_manual_event,
    add_template,
    connect,
    delete_attachment,
    delete_attachments_for_event,
    delete_channel_master,
    delete_contact,
    delete_event,
    delete_template,
    get_applied_skus,
    get_attachment,
    infer_event_types,
    insert_activity,
    delete_activity,
    list_activities,
    list_attachments,
    list_channels_master,
    set_sku_channel_status,
    list_contacts,
    list_recent,
    list_templates,
    remove_applied_sku,
    reset_event,
    resolve_event,
    set_ad_spend,
    set_event_period,
    set_event_sales,
    set_memo,
    set_ops_note,
    set_status,
    stats,
    update_attachment_caption,
    update_channel_master_meta,
    update_contact,
    update_event_fields,
    upsert_channel_master,
    upsert_events,
)

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

CHANNELS_YAML = Path(__file__).resolve().parent / "channels.yaml"


def load_channels() -> list[dict[str, Any]]:
    with CHANNELS_YAML.open(encoding="utf-8") as f:
        return yaml.safe_load(f)["channels"]


def _annotate(post: EventPost) -> tuple[EventPost, str | None, Any, bool]:
    cat = parse_category(post.title)
    deadline = parse_deadline(post.title, post.posted_at)
    fit = is_doa_fit(post.title, cat)
    return post, cat, deadline, fit


def cmd_crawl(only: list[str] | None, doa_only_log: bool) -> int:
    channels = load_channels()
    if only:
        channels = [c for c in channels if c["key"] in only]
    total_new = 0
    total_seen = 0
    failures: list[tuple[str, str]] = []
    with connect() as conn:
        for ch in channels:
            try:
                adapter = load_adapter(ch)
                posts: list[EventPost] = adapter.fetch()
            except NotImplementedError as e:
                print(f"[skip] {ch['key']}: {e}", file=sys.stderr)
                continue
            except Exception as e:
                failures.append((ch["key"], repr(e)))
                print(f"[err ] {ch['key']}: {e!r}", file=sys.stderr)
                continue
            annotated = [_annotate(p) for p in posts]
            new, seen = upsert_events(conn, annotated)
            total_new += new
            total_seen += seen
            doa_count = sum(1 for _, _, _, f in annotated if f)
            print(
                f"[ok  ] {ch['key']:18s} fetched={len(posts):3d} "
                f"new={new:3d} seen={seen:3d} doa_fit={doa_count:3d}"
            )
    print(f"\nTOTAL new={total_new} seen={total_seen} failures={len(failures)}")
    return 1 if failures else 0


def cmd_list(limit: int, doa_only: bool, channel: str | None, upcoming: int | None) -> int:
    with connect() as conn:
        rows = list_recent(
            conn,
            limit=limit,
            doa_only=doa_only,
            channel_key=channel,
            upcoming_days=upcoming,
        )
        if not rows:
            print("(no events)")
            return 0
        for r in rows:
            short = r["dedup_id"][:6]
            mark = "★" if r["is_doa_fit"] else " "
            cat = f"[{r['category']}]" if r["category"] else ""
            dl = r["deadline_at"][:16] if r["deadline_at"] else "마감미상"
            posted = r["posted_at"][:10] if r["posted_at"] else "-"
            status = STATUS_LABELS.get(r["status"], r["status"])
            print(
                f"{mark} {short} {posted} {dl} [{status:4s}] "
                f"{r['channel_key']:18s} {cat} {r['title']}"
            )
            if r["memo"]:
                print(f"          memo: {r['memo']}")
            print(f"          {r['url']}")
    return 0


def cmd_status(id_prefix: str, status: str) -> int:
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        try:
            set_status(conn, evt["dedup_id"], status)
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        print(
            f"✓ {evt['dedup_id'][:6]} {evt['title'][:60]}"
            f"\n  → 상태: {STATUS_LABELS.get(status, status)}"
        )
    return 0


def cmd_memo(id_prefix: str, memo: str) -> int:
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        set_memo(conn, evt["dedup_id"], memo)
        print(f"✓ {evt['dedup_id'][:6]} {evt['title'][:60]}\n  memo: {memo}")
    return 0


def cmd_show(id_prefix: str) -> int:
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        print(f"id:        {evt['dedup_id']}")
        print(f"채널:      {evt['channel_key']}")
        print(f"제목:      {evt['title']}")
        print(f"카테고리:  {evt['category'] or '-'}")
        print(f"등록일:    {evt['posted_at'] or '-'}")
        print(f"마감일:    {evt['deadline_at'] or '-'}")
        print(f"상태:      {STATUS_LABELS.get(evt['status'], evt['status'])} "
              f"({evt['status_updated_at'] or '미변경'})")
        print(f"메모:      {evt['memo'] or '-'}")
        print(f"URL:       {evt['url']}")
        print(f"도아적합:  {'★' if evt['is_doa_fit'] else '-'}")
        period_s = evt["sale_start"] or "-"
        period_e = evt["sale_end"] or "-"
        print(f"진행기간:  {period_s} ~ {period_e}")
        skus = get_applied_skus(conn, evt["dedup_id"])
        if skus:
            print("등록SKU:")
            for s in skus:
                print(
                    f"  - id={s['sku_id']:>4d}  "
                    f"행사가 {int(s.get('sale_price', 0)):,}원  "
                    f"수량 {s.get('qty_est', 0)}건  "
                    f"{s.get('sku_name') or ''}"
                )
        else:
            print("등록SKU:   (없음)")
    return 0


def _lookup_sku_name(sku_id: int) -> str | None:
    """정산자동화웹에서 SKU 이름을 조회. 실패해도 None 반환 (등록은 계속 진행)."""
    try:
        from api.settle_client import SettleClient

        with SettleClient() as c:
            for s in c.skus():
                if s.get("id") == sku_id:
                    return s.get("product_name")
    except Exception as e:  # noqa: BLE001
        print(f"WARN: SKU 이름 조회 실패 ({e}) — id만 저장", file=sys.stderr)
    return None


def cmd_register(id_prefix: str, sku_id: int, sale_price: int, qty: int) -> int:
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        sku_name = _lookup_sku_name(sku_id)
        add_applied_sku(conn, evt["dedup_id"], sku_id, sale_price, qty, sku_name)
        print(
            f"✓ {evt['dedup_id'][:6]} 행사에 SKU 등록\n"
            f"  id={sku_id}  {sku_name or '(이름 조회 실패)'}\n"
            f"  행사가 {sale_price:,}원  /  예상수량 {qty}건"
        )
    return 0


def cmd_unregister(id_prefix: str, sku_id: int) -> int:
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        remove_applied_sku(conn, evt["dedup_id"], sku_id)
        print(f"✓ {evt['dedup_id'][:6]} 행사에서 SKU id={sku_id} 제거")
    return 0


def cmd_sales_all() -> int:
    """모든 active 행사(applied/selected/running) 의 매출 자동 새로고침.

    SKU 등록 + 진행기간 있는 행사만 대상. systemd timer 가 매시간 호출.
    """
    from api.sales import fetch_event_sales

    with connect() as conn:
        rows = conn.execute(
            """SELECT dedup_id, title, channel_key, sale_start, sale_end, applied_skus_json
               FROM events
               WHERE status IN ('applied', 'selected', 'running')
                 AND applied_skus_json IS NOT NULL
                 AND sale_start IS NOT NULL
                 AND sale_end IS NOT NULL"""
        ).fetchall()
    print(f"[sales-all] 대상 행사: {len(rows)}건")
    n_ok = 0
    n_err = 0
    for r in rows:
        try:
            import json as _j
            skus = _j.loads(r["applied_skus_json"]) or []
            sku_names = [s.get("sku_name") for s in skus if s.get("sku_name")]
            if not sku_names:
                continue
            settle_names = _channel_settle_names(r["channel_key"]) or None
            result = fetch_event_sales(
                sku_names, r["sale_start"], r["sale_end"], channels=settle_names
            )
            with connect() as conn2:
                expected = sum(
                    int(s.get("sale_price", 0)) * int(s.get("qty_est", 0)) for s in skus
                )
                set_event_sales(
                    conn2, r["dedup_id"], {**result, "expected_revenue": expected}
                )
            sale = int(result["totals"].get("sale", 0))
            print(f"  ✓ {r['dedup_id'][:6]}  매출 {sale:>14,}원  {r['title'][:50]}")
            n_ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {r['dedup_id'][:6]}  {e!r}", file=sys.stderr)
            n_err += 1
    print(f"[sales-all] 완료 — 성공 {n_ok}건, 실패 {n_err}건")
    return 0 if n_err == 0 else 1


def _channel_settle_names(channel_key: str) -> list[str]:
    """events.channel_key → channels.yaml 의 settle_channels 리스트."""
    channels = load_channels()
    for ch in channels:
        if ch.get("key") == channel_key:
            return list(ch.get("settle_channels") or [])
    return []


def cmd_sales(id_prefix: str, override_channels: list[str] | None, no_filter: bool) -> int:
    """행사 등록 SKU + 기간으로 정산자동화웹 매출 매칭 후 실제 vs 예상 비교."""
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        skus = get_applied_skus(conn, evt["dedup_id"])
        if not skus:
            print("ERROR: 등록 SKU가 없습니다. register 로 먼저 등록.", file=sys.stderr)
            return 1
        if not (evt["sale_start"] and evt["sale_end"]):
            print("ERROR: 진행기간이 없습니다. period 로 먼저 설정.", file=sys.stderr)
            return 1

        from api.sales import fetch_event_sales

        # 채널 자동 매핑: events.channel_key → settle_channels
        if no_filter:
            channels = None
        elif override_channels:
            channels = override_channels
        else:
            channels = _channel_settle_names(evt["channel_key"]) or None

        sku_names = [s.get("sku_name") for s in skus if s.get("sku_name")]
        result = fetch_event_sales(
            sku_names, evt["sale_start"], evt["sale_end"], channels=channels
        )

        expected_revenue = sum(
            int(s.get("sale_price", 0)) * int(s.get("qty_est", 0)) for s in skus
        )

        # 결과를 DB에 캐시 (리포트가 매번 API 안 호출하게)
        set_event_sales(conn, evt["dedup_id"], {**result, "expected_revenue": expected_revenue})

    ch_label = (
        "전 채널(필터 없음)" if no_filter else
        (", ".join(channels) if channels else f"{evt['channel_key']} → 매핑 없음, 전 채널 사용")
    )
    print(f"\n=== {evt['title'][:60]} ===")
    print(f"  기간:   {evt['sale_start']} ~ {evt['sale_end']}")
    print(f"  채널:   {evt['channel_key']}  (매출 필터: {ch_label})")
    print()
    print(f"등록 SKU ({len(skus)}건, 예상 매출 {expected_revenue:,}원):")
    for s in skus:
        price = int(s.get("sale_price", 0))
        qty = int(s.get("qty_est", 0))
        name = s.get("sku_name") or f"#{s.get('sku_id')}"
        print(f"  - {name:30s} {price:>8,}원 × {qty:>4}건 = {price*qty:>12,}원")

    print()
    print(f"정산자동화웹 매칭 결과 (전체 top-products {result['all_count']}건 중 {len(result['matched'])}건 매칭):")
    if not result["matched"]:
        print("  (매칭 없음 — SKU 이름이 매출 데이터에 안 잡힘. 이름 정확히 일치하는지 확인)")
    else:
        for m in result["matched"]:
            print(
                f"  - {m.get('product_name', ''):28s} "
                f"매출 {int(m.get('sale', 0)):>12,}원  "
                f"({int(m.get('qty', 0)):>4}건 / {int(m.get('orders', 0)):>4}주문)"
            )

    if result["unmatched"]:
        print()
        print(f"⚠️ 매칭 실패 SKU: {result['unmatched']}")

    t = result["totals"]
    sale = int(t.get("sale", 0))
    op_profit = int(t.get("operating_profit", 0))
    net_profit = int(t.get("net_profit", 0))
    ad_spend = int(t.get("ad_spend", 0))
    op_margin = (op_profit / sale * 100) if sale else 0
    net_margin = (net_profit / sale * 100) if sale else 0
    ad_warn = "  ⚠️ 전 채널 광고비 (채널 필터에 영향 안 받음)" if t.get("ad_spend_is_filtered") is False else ""

    print()
    print("=== 실제 매출 합계 ===")
    print(f"  매출           {sale:>14,} 원")
    print(f"  원가           {int(t['cost']):>14,} 원")
    print(f"  수수료         {int(t['fee']):>14,} 원")
    print(f"  택배비         {int(t['shipping']):>14,} 원")
    print(f"  영업이익       {op_profit:>14,} 원   ← 매출-원가-수수료-택배비")
    print(f"  영업이익률     {op_margin:>14.1f} %")
    print()
    print(f"  광고비         {ad_spend:>14,} 원{ad_warn}")
    print(f"  순이익         {net_profit:>14,} 원   ← 영업이익-광고비")
    print(f"  순이익률       {net_margin:>14.1f} %")
    print()
    print(f"  수량           {int(t['qty']):>14,} 건")
    print(f"  주문수         {int(t['orders']):>14,} 건")
    if expected_revenue > 0 and sale:
        ratio = sale / expected_revenue * 100
        print(f"\n  실제/예상 매출  {ratio:.1f}%  ({sale:,} / {expected_revenue:,})")
    return 0


def cmd_cs_similar_replies(customer_message: str, limit: int = 5) -> int:
    """과거 비슷한 인입에 대한 실제 발신 답변 N개 (JSON 출력)."""
    import json as _j
    from .store import connect, cs_find_similar_replies
    with connect() as conn:
        out = cs_find_similar_replies(conn, customer_message, limit=limit)
    print(_j.dumps(out, ensure_ascii=False))
    return 0


def cmd_build_product_kb(force: bool = False, smart: bool = False) -> int:
    """조선팔도떡집 11종 상품 지식 베이스 자동 빌드.

    매일 cs-upload 후 호출되어 새 답변 반영.

    모드:
    - 기본 (smart=False, force=False): 기존 KB 없는 상품만 신규 빌드
    - smart (--smart): 답변 수 10%+ 늘었거나 7일+ 된 상품만 재빌드 (incremental)
    - force (--force): 11종 전체 재빌드

    Claude API 호출 횟수 = 빌드 대상 수.
    """
    import os
    import json as _j
    import httpx
    from datetime import datetime, timedelta
    from pathlib import Path
    from dotenv import load_dotenv
    from .store import connect, JOSEON_PRODUCTS, cs_product_all_replies

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY 미설정 — .env 확인", file=sys.stderr)
        return 1

    kb_path = Path(__file__).resolve().parent.parent / "data" / "product_kb.json"
    existing: dict = {}
    if kb_path.exists() and not force:
        existing = _j.loads(kb_path.read_text(encoding="utf-8"))

    def needs_rebuild(product: str, new_reply_count: int) -> tuple[bool, str]:
        """smart 모드 재빌드 판단."""
        if product not in existing:
            return True, "신규"
        prev = existing[product]
        prev_n = prev.get("_reply_count", 0)
        prev_built = prev.get("_built_at", "")
        # 답변 수 10%+ 변화
        if prev_n == 0 or abs(new_reply_count - prev_n) / max(prev_n, 1) >= 0.1:
            return True, f"답변수 변화 {prev_n}→{new_reply_count}"
        # 7일 이상 된 KB
        try:
            built = datetime.fromisoformat(prev_built)
            if datetime.now() - built > timedelta(days=7):
                return True, f"7일+ 경과"
        except Exception:
            return True, "빌드일 불명"
        return False, "최신"

    SYSTEM = """당신은 조선팔도떡집 상품 데이터 분석가입니다.
아래는 CS 상담사가 해당 상품에 대해 실제 고객에게 보낸 답변들입니다.
이 답변들에서 추출할 수 있는 상품 정보를 JSON 으로 요약하세요.

추출 항목:
- summary: 상품 한 줄 설명 (회사가 고객에게 설명하는 방식)
- features: 주요 특징 (식감/맛/원재료/제조법 등 답변에서 언급된 것들)
- storage_shelf_life: 보관법·유통기한 (답변에 언급되면)
- packaging_options: 구성·포장 단위 (답변에 언급되면)
- pricing_hints: 가격 관련 언급 (할인·세트 등)
- common_concerns: 고객이 자주 묻는 점·우려사항
- pair_recommendations: 어울리는 차/음료/디저트 (답변에 언급되면)
- caveats: 주의사항 (보관·해동·섭취)
- frequent_phrases: 회사가 이 상품을 설명할 때 자주 쓰는 핵심 문구 3-5개

각 항목은 답변에 명시된 내용만. 답변에 없는 정보는 빈 배열/null.
JSON 외 텍스트 X."""

    output: dict = dict(existing)
    n_built = 0
    n_skipped = 0
    with connect() as conn:
        for product in JOSEON_PRODUCTS:
            replies = cs_product_all_replies(conn, product, max_rows=40)
            if not replies:
                if product not in existing:
                    print(f"  - {product}: 답변 0건 → 스킵")
                continue

            # 빌드 여부 판단
            if force:
                reason = "전체 재빌드"
            elif smart:
                build, reason = needs_rebuild(product, len(replies))
                if not build:
                    print(f"  - {product}: skip ({reason})")
                    n_skipped += 1
                    continue
            else:
                # 기본: 신규만
                if product in existing:
                    print(f"  - {product}: skip (이미 있음, --smart 또는 --force 로 갱신)")
                    n_skipped += 1
                    continue
                reason = "신규"
            joined = "\n---\n".join(replies[:40])
            user_content = f"상품: {product}\n\nCS 답변 {len(replies)}건:\n\n{joined}"
            print(f"  - {product}: {reason} · 답변 {len(replies)}건 → Claude 호출 중…")
            try:
                resp = httpx.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-sonnet-4-6",
                        "max_tokens": 2000,
                        "temperature": 0.3,
                        "system": SYSTEM,
                        "messages": [{"role": "user", "content": user_content}],
                    },
                    timeout=120.0,
                )
                resp.raise_for_status()
                data = resp.json()
                raw = (data.get("content") or [{}])[0].get("text", "").strip()
                # ```json ``` 처리
                import re as _re
                m = _re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
                if m:
                    raw = m.group(1)
                parsed = _j.loads(raw)
                output[product] = {
                    "summary": parsed.get("summary"),
                    "features": parsed.get("features") or [],
                    "storage_shelf_life": parsed.get("storage_shelf_life"),
                    "packaging_options": parsed.get("packaging_options") or [],
                    "pricing_hints": parsed.get("pricing_hints") or [],
                    "common_concerns": parsed.get("common_concerns") or [],
                    "pair_recommendations": parsed.get("pair_recommendations") or [],
                    "caveats": parsed.get("caveats") or [],
                    "frequent_phrases": parsed.get("frequent_phrases") or [],
                    "_reply_count": len(replies),
                    "_built_at": datetime.now().isoformat(),
                }
                n_built += 1
                print(f"    ✓ {parsed.get('summary', '(요약 없음)')[:60]}")
            except Exception as e:
                print(f"    ✗ 실패: {e}")

    kb_path.parent.mkdir(parents=True, exist_ok=True)
    kb_path.write_text(_j.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ product_kb.json 저장: {n_built}건 신규, {n_skipped}건 스킵 → 총 {len(output)}건")
    return 0


def cmd_cs_analyze(customer_message: str) -> int:
    """인입 메시지 종합 분석 (intent + sentiment + 추출정보 + 과거 답변) JSON."""
    import json as _j
    from .store import connect, cs_analyze_message
    with connect() as conn:
        out = cs_analyze_message(conn, customer_message)
    print(_j.dumps(out, ensure_ascii=False))
    return 0


def cmd_import_cs(file_path: str, clear_all: bool = False) -> int:
    """이지데스크 .xls (HTML 포맷) → cs_messages 테이블 import.

    clear_all=True: import 전에 cs_messages 전체 비움.
    기본: 같은 날짜 데이터만 자동 교체.
    """
    from .store import connect, import_cs_messages
    from .cs_parser import parse_ezdesk_xls

    rows = list(parse_ezdesk_xls(file_path))
    if not rows:
        print(f"ERROR: 파싱된 row 0건 — 파일 형식 확인 ({file_path})", file=sys.stderr)
        return 1
    with connect() as conn:
        if clear_all:
            n_before = conn.execute("SELECT COUNT(*) FROM cs_messages").fetchone()[0]
            conn.execute("DELETE FROM cs_messages")
            print(f"  ⚠ 전체 삭제: {n_before}건")
        report = import_cs_messages(conn, rows, replace_dates=True)
    print(f"✓ CS import: {report['inserted']}건 (기존 같은날짜 {report['deleted_existing']}건 교체)")
    print(f"  기간: {report['date_min']} ~ {report['date_max']}")
    print(f"  채널: {report['channels']}")
    return 0


def cmd_cs_clear() -> int:
    """cs_messages 전체 삭제 (재업로드 전 초기화)."""
    from .store import connect
    with connect() as conn:
        n = conn.execute("SELECT COUNT(*) FROM cs_messages").fetchone()[0]
        conn.execute("DELETE FROM cs_messages")
    print(f"✓ cs_messages 전체 삭제: {n}건")
    return 0


def cmd_infer_md_owner() -> int:
    """md_owner_name 비어있는 행사에 contacts 채널 1:1 매핑 기준 자동 매핑."""
    from .store import connect, infer_md_owners
    with connect() as conn:
        patched, ambiguous_n, ambiguous_keys = infer_md_owners(conn)
    print(f"[infer-md-owner] 자동 매핑: {patched}건")
    if ambiguous_n:
        print(f"  모호(채널에 MD 여러명, 미지정 유지): {ambiguous_n}개 채널 — {ambiguous_keys}")
    return 0


def cmd_save_simulation(
    id_prefix: str,
    price: int,
    cost: int,
    ship: int,
    commission: float,
    discount: float,
    extra: int,
) -> int:
    """마진 시뮬레이터 입력값을 행사 simulation_json 에 스냅샷 저장.

    저장값:
      - 입력 그대로 (price/cost/ship/commission_pct/discount_pct/extra)
      - 계산값 (sale_price=price*(1-d), expected_op, expected_margin)
      - 단가 기준이므로 expected_sale 은 명시 안 하고 단위 영업이익만 (qty 모름)
    """
    from .store import connect, resolve_event, set_event_simulation
    from datetime import datetime as _dt

    sale_price = price * (1 - discount / 100)
    commission_amt = sale_price * (commission / 100)
    total_cost = cost + ship + extra
    expected_op = sale_price - commission_amt - total_cost
    expected_margin = (expected_op / sale_price * 100) if sale_price > 0 else 0

    snapshot = {
        "price": price,
        "cost": cost,
        "ship": ship,
        "commission_pct": commission,
        "discount_pct": discount,
        "extra": extra,
        "sale_price": round(sale_price),
        "commission_amt": round(commission_amt),
        "total_cost": total_cost,
        "expected_op": round(expected_op),
        "expected_margin": round(expected_margin, 1),
        "saved_at": _dt.now().isoformat(),
    }

    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        set_event_simulation(conn, evt["dedup_id"], snapshot)

    print(f"✓ {evt['dedup_id'][:6]} 시뮬 저장 — 단위 영업이익 {snapshot['expected_op']:,}원 ({snapshot['expected_margin']}%)")
    return 0


def cmd_attach_channel_totals(
    id_prefix: str,
    channel_name: str,
    brand: str,
    close: bool,
) -> int:
    """행사 진행기간의 채널 전체 매출(totals + top-products) 을 sales_json 에 attach.

    SKU 매칭 없이 채널/브랜드 단위 매출을 그대로 기록.
    "그날 채널 매출 = 전부 행사 매출" 인 케이스용 (전 SKU 행사가 일괄 적용 등).
    """
    import json as _json

    from api.settle_client import SettleClient

    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        if not (evt["sale_start"] and evt["sale_end"]):
            print("ERROR: 진행기간이 없습니다. period 로 먼저 설정.", file=sys.stderr)
            return 1
        start = evt["sale_start"][:10]
        end = evt["sale_end"][:10]

        with SettleClient() as c:
            summary = c.summary(start=start, end=end, brand=brand, channel=channel_name)
            top = c.top_products(start=start, end=end, brand=brand, channel=channel_name)

        totals = summary.get("totals") or {}
        products = top if isinstance(top, list) else (top.get("items") if isinstance(top, dict) else [])

        sale = int(totals.get("real_sale") or totals.get("sale_ezadmin") or 0)
        cost = int(totals.get("cost") or 0)
        fee = int(totals.get("fee") or 0)
        shipping = int(totals.get("shipping") or 0)
        op_profit = int(totals.get("operating_profit") or 0)
        ad_cost = int(totals.get("ad_cost") or 0)
        net_profit = int(totals.get("net_profit") or 0)
        orders = int(totals.get("orders") or 0)
        qty = int(totals.get("qty") or 0)

        sales_payload = {
            "totals": {
                "sale": sale,
                "cost": cost,
                "fee": fee,
                "shipping": shipping,
                "operating_profit": op_profit,
                "ad_cost": ad_cost,
                "net_profit": net_profit,
                "orders": orders,
                "qty": qty,
            },
            "channels_used": [channel_name],
            "matched": products,
            "all_count": len(products),
            "unmatched": [],
            "note": f"채널 전체 매출 attach ({brand}/{channel_name} {start}~{end}) — SKU 매칭 생략",
        }
        set_event_sales(conn, evt["dedup_id"], sales_payload)
        if close:
            set_status(conn, evt["dedup_id"], "closed")

    print(f"=== {evt['title'][:60]} ===")
    print(f"  채널/기간:  {channel_name} / {start} ~ {end}")
    print(f"  실 매출      {sale:>14,} 원   ({orders}주문 / {qty}개)")
    print(f"  영업이익(전) {op_profit:>14,} 원   ({(op_profit/sale*100 if sale else 0):.1f}%)")
    print(f"  광고비       {ad_cost:>14,} 원")
    print(f"  순이익(후)   {net_profit:>14,} 원")
    print(f"\n  top-products {len(products)}건:")
    for p in products[:10]:
        name = (p.get("product_name") or "")[:30]
        sval = int(p.get("sale") or 0)
        qval = int(p.get("qty") or 0)
        print(f"    - {name:30s} {sval:>12,}원 ({qval}개)")
    print(f"\n✓ events.{evt['dedup_id'][:6]} sales_json 저장" + (" + status=closed" if close else ""))
    return 0


def cmd_dump_json(out_path: str | None) -> int:
    """events 전체를 JSON 파일로 dump. Next.js 캘린더 화면이 이걸 읽음."""
    import json as _json
    target = Path(out_path) if out_path else Path(__file__).resolve().parent.parent / "data" / "events.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        rows = conn.execute("SELECT * FROM events ORDER BY COALESCE(deadline_at, posted_at) DESC").fetchall()
        items = []
        for r in rows:
            d = dict(r)
            d["short_id"] = d["dedup_id"][:6]
            d["applied_skus"] = get_applied_skus(conn, d["dedup_id"])
            d["attachments"] = [dict(a) for a in list_attachments(conn, d["dedup_id"])]
            # 활동 타임라인 — 최근 30건
            d["activities"] = [dict(a) for a in list_activities(conn, d["dedup_id"], limit=30)]
            if d.get("sales_json"):
                try:
                    d["sales"] = _json.loads(d["sales_json"])
                except Exception:
                    d["sales"] = None
            else:
                d["sales"] = None
            if d.get("simulation_json"):
                try:
                    d["simulation"] = _json.loads(d["simulation_json"])
                except Exception:
                    d["simulation"] = None
            else:
                d["simulation"] = None
            # status_label 변환
            d["status_label"] = STATUS_LABELS.get(d.get("status", "new"), d.get("status"))
            # 너무 무거운 컬럼 제거
            d.pop("raw_text", None)
            d.pop("extra_json", None)
            d.pop("sales_json", None)
            d.pop("simulation_json", None)
            d.pop("applied_skus_json", None)
            items.append(d)
        s = stats(conn)
        contacts = [dict(r) for r in list_contacts(conn)]
        templates = [dict(r) for r in list_templates(conn)]
        channels_master = [dict(r) for r in list_channels_master(conn)]
        # CS 통계 — 일별/시간대별/짧은 질문 top + 캔드답변 + 큰 이슈
        from .store import (
            cs_daily_stats, cs_hourly_stats, cs_top_questions, cs_top_canned,
            cs_critical_issues, cs_repeat_callers,
        )
        cs_daily = cs_daily_stats(conn, days=14)
        cs_hourly = cs_hourly_stats(conn, days=7)
        cs_top = cs_top_questions(conn, max_len=20, limit=10, days=30)
        cs_canned = cs_top_canned(conn, max_len=200, limit=10, days=30)
        cs_critical = cs_critical_issues(conn, days=7, limit_per=5)
        cs_repeat = cs_repeat_callers(conn, days=7, min_messages=5)
        # 상품 지식 베이스 (build-product-kb CLI 로 한 번 빌드한 결과)
        product_kb_path = Path(__file__).resolve().parent.parent / "data" / "product_kb.json"
        product_kb = {}
        if product_kb_path.exists():
            try:
                product_kb = _json.loads(product_kb_path.read_text(encoding="utf-8"))
            except Exception:
                product_kb = {}

        # 광고/SNS 댓글 — 부정 댓글 위주, 메인 대시보드 카드용
        from .store import list_ad_comments, ad_comment_stats
        ad_comments_recent = list_ad_comments(conn, min_severity=1, limit=50)
        ad_comments_stats_obj = ad_comment_stats(conn, days=14)
    payload = {
        "generated_at": datetime.now().isoformat(),
        "total": s["total"],
        "doa_fit": s["doa_fit"],
        "by_channel": s["by_channel"],
        "events": items,
        "contacts": contacts,
        "templates": templates,
        "channels_master": channels_master,
        "cs_daily": cs_daily,
        "cs_hourly": cs_hourly,
        "cs_top": cs_top,
        "cs_canned": cs_canned,
        "cs_critical": cs_critical,
        "cs_repeat": cs_repeat,
        "product_kb": product_kb,
        "ad_comments": ad_comments_recent,
        "ad_comment_stats": ad_comment_stats_obj,
    }
    target.write_text(_json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"✓ dump: {target}  ({len(items)}건)")
    return 0


def cmd_reset(id_prefix: str) -> int:
    """행사의 상태/메모/SKU/기간/매출캐시 초기화 (행사 자체는 유지)."""
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        reset_event(conn, evt["dedup_id"])
        print(f"✓ {evt['dedup_id'][:6]} 초기화 (상태/메모/SKU/기간/매출 캐시 삭제)")
        print(f"  제목: {evt['title'][:60]}")
    return 0


def cmd_fee_rates(days: int) -> int:
    """정산자동화웹 매출 데이터로 채널별 실효 수수료율 계산.

    summary API 의 breakdown(채널×브랜드) 합산 후 fee/sale 비율 = 실효율.
    이게 시뮬레이터/channels.yaml 의 default_fee_rate 진실의 원천.
    """
    from datetime import datetime, timedelta
    from api.settle_client import SettleClient

    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    with SettleClient() as c:
        data = c.summary(start=start, end=end)
    br = data.get("breakdown", []) if isinstance(data, dict) else []

    by: dict[str, dict] = {}
    for row in br:
        ch = row.get("channel") or "?"
        if ch not in by:
            by[ch] = {"sale": 0.0, "fee": 0.0, "orders": 0, "cost": 0.0, "shipping": 0.0}
        by[ch]["sale"] += float(row.get("sale", 0) or 0)
        by[ch]["fee"] += float(row.get("fee", 0) or 0)
        by[ch]["cost"] += float(row.get("cost", 0) or 0)
        by[ch]["shipping"] += float(row.get("shipping", 0) or 0)
        by[ch]["orders"] += int(row.get("orders", 0) or 0)

    print(f"\n=== 채널별 실효 수수료율 (최근 {days}일: {start} ~ {end}) ===\n")
    print(f"{'채널':18s}  {'매출':>14s}  {'수수료':>12s}  {'실효율':>7s}  {'주문수':>7s}")
    print("-" * 70)
    rows_for_yaml: list[tuple[str, float]] = []
    for ch, d in sorted(by.items(), key=lambda x: -x[1]["sale"]):
        if d["sale"] > 0:
            rate = d["fee"] / d["sale"]
            print(
                f"{ch:18s}  {int(d['sale']):>14,}  {int(d['fee']):>12,}  "
                f"{rate * 100:>6.2f}%  {int(d['orders']):>7d}"
            )
            rows_for_yaml.append((ch, rate))
        else:
            print(f"{ch:18s}  (매출 없음)")
    print()
    if rows_for_yaml:
        print("→ channels.yaml 의 default_fee_rate 값으로 사용할 실효율 (소수점):")
        for ch, rate in rows_for_yaml:
            print(f"   {ch}: {rate:.4f}")
        print()
    return 0


def cmd_ad_spend(id_prefix: str, amount: int | None) -> int:
    """행사별 실제 광고비 입력. 0 또는 음수는 NULL 로 클리어."""
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        val = amount if (amount is not None and amount > 0) else None
        set_ad_spend(conn, evt["dedup_id"], val)
        print(f"✓ {evt['dedup_id'][:6]} 광고비: {val if val else '미입력'}")
    return 0


def cmd_contact_list(channel: str | None) -> int:
    with connect() as conn:
        rows = list_contacts(conn, channel_key=channel)
        if not rows:
            print("(연락처 없음)")
            return 0
        for r in rows:
            line = f"#{r['id']:>3d}  [{r['channel_key']:18s}]  {r['name']}"
            if r["kakao_id"]: line += f"  카톡:{r['kakao_id']}"
            if r["phone"]:    line += f"  {r['phone']}"
            print(line)
            if r["memo"]: print(f"      memo: {r['memo']}")
    return 0


def cmd_contact_add(
    channel_key: str, name: str,
    kakao_id: str | None, phone: str | None, email: str | None, memo: str | None,
) -> int:
    with connect() as conn:
        cid = add_contact(conn, channel_key, name, kakao_id, phone, email, memo)
        print(f"✓ 연락처 #{cid} 추가: [{channel_key}] {name}")
    return 0


def cmd_contact_delete(contact_id: int) -> int:
    with connect() as conn:
        ok = delete_contact(conn, contact_id)
        if ok:
            print(f"✓ 연락처 #{contact_id} 삭제")
            return 0
        print(f"ERROR: #{contact_id} 없음", file=sys.stderr)
        return 1


def cmd_sync_channels(dry: bool) -> int:
    """정산자동화웹 facets → channels_master DB 동기화."""
    from crawler.sync_channels import sync
    return sync(dry)


def cmd_comment_add(id_prefix: str, text: str) -> int:
    """행사에 자유 코멘트 추가."""
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        insert_activity(conn, evt["dedup_id"], "comment", text)
    print(f"✓ {evt['dedup_id'][:6]} 코멘트 추가: {text[:60]}")
    return 0


def cmd_activity_del(activity_id: int) -> int:
    """타임라인 활동 1건 삭제 (오타 등)."""
    with connect() as conn:
        ok = delete_activity(conn, activity_id)
    if ok:
        print(f"✓ 활동 #{activity_id} 삭제")
        return 0
    print(f"ERROR: 활동 #{activity_id} 못 찾음", file=sys.stderr)
    return 1


def cmd_sku_matrix_set(
    settle_name: str,
    sku_id: int,
    status: str | None,
    entry_date: str | None,
    note: str | None,
) -> int:
    """SKU × 채널 입점 상태 set/clear."""
    if status not in (None, "entered", "reviewing", "blocked"):
        print(f"ERROR: status는 entered/reviewing/blocked/(없음) 중 하나", file=sys.stderr)
        return 1
    with connect() as conn:
        ok = set_sku_channel_status(conn, settle_name, sku_id, status, entry_date, note)
    if ok:
        print(f"✓ {settle_name} × SKU#{sku_id} → {status or '(미입점)'}")
        return 0
    print(f"ERROR: 채널 '{settle_name}' 못 찾음", file=sys.stderr)
    return 1


def cmd_channel_meta(
    settle_name: str,
    status: str | None,
    priority: str | None,
    note: str | None,
    url: str | None,
    fee: str | None = None,
) -> int:
    """채널 마스터 운영 메타필드 (status/priority/note/url/default_fee_rate) 업데이트."""
    with connect() as conn:
        ok = update_channel_master_meta(conn, settle_name, status, priority, note, url, fee)
    if ok:
        print(f"✓ 채널 메타 업데이트: {settle_name}")
        return 0
    print(f"ERROR: '{settle_name}' 못 찾음 또는 변경 없음", file=sys.stderr)
    return 1


def cmd_channel_add_manual(
    settle_name: str,
    display_name: str,
    is_sales: bool,
    abbr: str | None,
    default_fee_rate: float | None,
    yaml_key: str | None,
) -> int:
    """수동으로 채널 추가 (정산자동화웹에 없는 채널 — NS홈쇼핑 등)."""
    with connect() as conn:
        upsert_channel_master(
            conn,
            settle_name=settle_name,
            display_name=display_name,
            yaml_key=yaml_key,
            is_sales=is_sales,
            abbr=abbr,
            default_fee_rate=default_fee_rate,
            source="manual",
        )
    print(f"✓ 채널 추가: {settle_name} ({display_name})")
    return 0


def cmd_channel_delete(settle_name: str) -> int:
    """채널 마스터 삭제."""
    with connect() as conn:
        ok = delete_channel_master(conn, settle_name)
    if ok:
        print(f"✓ 채널 삭제: {settle_name}")
        return 0
    print(f"ERROR: '{settle_name}' 못 찾음", file=sys.stderr)
    return 1


def cmd_channel_list() -> int:
    with connect() as conn:
        rows = list_channels_master(conn)
        if not rows:
            print("(채널 마스터 비어있음 — sync-channels 먼저 실행)")
            return 0
        print(f"{'settle_name':20s}  {'abbr':5s}  {'fee':6s}  {'src':6s}  display_name")
        print("-" * 80)
        for r in rows:
            fee = f"{r['default_fee_rate']*100:.2f}%" if r['default_fee_rate'] is not None else "-"
            mark = "💰" if r["is_sales"] else "📰"
            print(f"{r['settle_name']:20s}  {(r['abbr'] or '-'):5s}  {fee:6s}  {r['source']:6s}  {mark} {r['display_name']}")
    return 0


def cmd_template_list() -> int:
    with connect() as conn:
        rows = list_templates(conn)
        if not rows:
            print("(템플릿 없음)")
            return 0
        for r in rows:
            print(f"#{r['id']:>3d}  [{r['channel_key']:18s}]  {r['name']}")
            print(f"      제목: {r['title_pattern']}")
            if r["category"]: print(f"      카테고리: {r['category']}")
            if r["recurrence"]: print(f"      반복: {r['recurrence']}")
            if r["memo"]: print(f"      메모: {r['memo']}")
    return 0


def cmd_template_add(
    name: str, channel_key: str, title_pattern: str,
    category: str | None, recurrence: str | None, memo: str | None,
) -> int:
    with connect() as conn:
        tid = add_template(
            conn, name=name, channel_key=channel_key, title_pattern=title_pattern,
            category=category, recurrence=recurrence, memo=memo,
        )
        print(f"✓ 템플릿 #{tid} 추가: [{channel_key}] {name}")
    return 0


def cmd_template_del(template_id: int) -> int:
    with connect() as conn:
        if delete_template(conn, template_id):
            print(f"✓ 템플릿 #{template_id} 삭제")
            return 0
        print(f"ERROR: #{template_id} 없음", file=sys.stderr)
        return 1


def cmd_update(
    id_prefix: str,
    title: str | None,
    deadline: str | None,
    category: str | None,
    url: str | None,
    event_type: str | None = None,
    discount_rate: float | None = None,
    discount_burden: str | None = None,
    expected_revenue: int | None = None,
    vendor_name: str | None = None,
    vendor_contact: str | None = None,
    md_owner_name: str | None = None,
    channel_key: str | None = None,
) -> int:
    """행사 본문 필드 수정 (제목/마감/카테고리/URL/행사유형/할인/예상매출/업체/담당MD/채널)."""
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        if channel_key is not None and channel_key != "":
            valid = {c["key"] for c in load_channels()}
            if channel_key not in valid:
                print(f"ERROR: 알 수 없는 채널 '{channel_key}'. 가능: {sorted(valid)}", file=sys.stderr)
                return 1
        update_event_fields(
            conn, evt["dedup_id"],
            title=title, deadline=deadline, category=category, url=url,
            event_type=event_type, discount_rate=discount_rate,
            discount_burden=discount_burden, expected_revenue=expected_revenue,
            vendor_name=vendor_name, vendor_contact=vendor_contact,
            md_owner_name=md_owner_name,
            channel_key=channel_key,
        )
        print(f"✓ {evt['dedup_id'][:6]} 수정 완료")
    return 0


def cmd_delete(id_prefix: str, force: bool) -> int:
    """행사 삭제. 기본은 수동등록(source='manual')만. --force 시 강제 삭제 (다음 crawl 재수집됨)."""
    import shutil
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        # 행사 삭제 전 첨부 메타·파일 cascade
        removed = delete_attachments_for_event(conn, evt["dedup_id"])
        ok = delete_event(conn, evt["dedup_id"], manual_only=not force)
        if not ok:
            print(
                f"ERROR: {evt['dedup_id'][:6]} 는 crawl 수집 행사라 삭제 안 됨 "
                f"(--force 주면 강제 삭제, 단 다음 crawl 시 재수집).",
                file=sys.stderr,
            )
            return 1
        if removed:
            att_dir = Path(__file__).resolve().parent.parent / "data" / "attachments" / evt["dedup_id"]
            if att_dir.exists():
                shutil.rmtree(att_dir, ignore_errors=True)
        print(f"✓ {evt['dedup_id'][:6]} 삭제: {evt['title'][:60]}")
    return 0


def cmd_attach_add(
    id_prefix: str,
    filename: str,
    original_name: str | None,
    caption: str | None,
    mime_type: str | None,
    size_bytes: int | None,
) -> int:
    """행사 첨부 메타 DB 등록. 파일 자체는 호출자(Next.js)가 data/attachments/<dedup_id>/<filename> 에 미리 저장.

    성공 시 stdout 에 attachment id (정수 한 줄) 출력 — API route 가 파싱.
    """
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        att_id = add_attachment(
            conn,
            dedup_id=evt["dedup_id"],
            filename=filename,
            original_name=original_name,
            caption=caption,
            mime_type=mime_type,
            size_bytes=size_bytes,
        )
        print(att_id)
    return 0


def cmd_attach_update(attach_id: int, caption: str) -> int:
    """첨부 캡션 수정 (빈 문자열은 NULL)."""
    with connect() as conn:
        ok = update_attachment_caption(conn, attach_id, caption)
        if not ok:
            print(f"ERROR: attachment {attach_id} 없음", file=sys.stderr)
            return 1
        print(f"✓ attachment {attach_id} 캡션 갱신")
    return 0


def cmd_attach_del(attach_id: int) -> int:
    """첨부 삭제. 메타 row 와 파일 둘 다 제거. stdout 에 삭제된 filename 출력."""
    with connect() as conn:
        row = delete_attachment(conn, attach_id)
        if row is None:
            print(f"ERROR: attachment {attach_id} 없음", file=sys.stderr)
            return 1
        att_path = (
            Path(__file__).resolve().parent.parent
            / "data" / "attachments" / row["dedup_id"] / row["filename"]
        )
        if att_path.exists():
            try:
                att_path.unlink()
            except OSError as e:
                print(f"WARN: 파일 삭제 실패 {att_path}: {e}", file=sys.stderr)
        print(row["filename"])
    return 0


def cmd_ops_note(id_prefix: str, kind: str, value: str) -> int:
    """진행중 운영관리 메모. kind = stock | claim."""
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        try:
            set_ops_note(conn, evt["dedup_id"], kind, value)
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        print(f"✓ {evt['dedup_id'][:6]} ops-{kind} 갱신")
    return 0


def cmd_add_event(
    channel_key: str,
    title: str,
    deadline: str | None,
    url: str | None,
    memo: str | None,
    category: str | None,
    sale_start: str | None = None,
    sale_end: str | None = None,
    event_type: str | None = None,
    discount_rate: float | None = None,
    discount_burden: str | None = None,
    expected_revenue: int | None = None,
    vendor_name: str | None = None,
    vendor_contact: str | None = None,
    md_owner_name: str | None = None,
) -> int:
    """MD가 직접 받은 행사를 수동 등록 (RSS/공지에 안 뜨는 케이스)."""
    valid = {c["key"] for c in load_channels()}
    if channel_key not in valid:
        print(f"ERROR: 알 수 없는 채널 '{channel_key}'. 가능: {sorted(valid)}", file=sys.stderr)
        return 1
    with connect() as conn:
        dedup_id = add_manual_event(
            conn,
            channel_key=channel_key,
            title=title,
            deadline=deadline,
            url=url,
            memo=memo,
            category=category,
            event_type=event_type,
            discount_rate=discount_rate,
            discount_burden=discount_burden,
            expected_revenue=expected_revenue,
            vendor_name=vendor_name,
            vendor_contact=vendor_contact,
            md_owner_name=md_owner_name,
        )
        if sale_start and sale_end:
            set_event_period(conn, dedup_id, sale_start, sale_end)
    period_msg = f"  진행기간 {sale_start} ~ {sale_end}\n" if sale_start and sale_end else ""
    print(f"✓ 수동 행사 등록: {dedup_id[:6]} {title}")
    print(period_msg + "  → register/period/status 등 일반 명령 그대로 사용 가능")
    return 0


def cmd_period(id_prefix: str, start: str, end: str) -> int:
    try:
        from datetime import datetime as _dt

        _dt.fromisoformat(start)
        _dt.fromisoformat(end)
    except ValueError:
        print("ERROR: 날짜는 YYYY-MM-DD 형식으로", file=sys.stderr)
        return 1
    with connect() as conn:
        try:
            evt = resolve_event(conn, id_prefix)
        except LookupError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
        set_event_period(conn, evt["dedup_id"], start, end)
        print(f"✓ {evt['dedup_id'][:6]} 진행기간: {start} ~ {end}")
    return 0


def cmd_stats() -> int:
    with connect() as conn:
        s = stats(conn)
        print(f"총 공고: {s['total']}건  (도아적합: {s['doa_fit']}건)")
        print("채널별:")
        for k, v in sorted(s["by_channel"].items(), key=lambda x: -x[1]):
            print(f"  {k:20s} {v:4d}")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(prog="md-crawl", description="도아 MD 에이전트 CLI")
    sp = p.add_subparsers(dest="cmd", required=False)

    pc = sp.add_parser("crawl", help="채널 폴링 + DB 적재")
    pc.add_argument("-c", "--channel", action="append", help="특정 채널 key만 (반복 지정 가능)")
    pc.add_argument("--doa-only", action="store_true", help="로그에서 도아적합만 강조")

    pl = sp.add_parser("list", help="DB의 최근 공고 조회")
    pl.add_argument("-n", "--limit", type=int, default=20)
    pl.add_argument("--doa", action="store_true", help="도아 적합 공고만")
    pl.add_argument("-c", "--channel", default=None)
    pl.add_argument(
        "--upcoming",
        type=int,
        default=None,
        metavar="DAYS",
        help="N일 이내 마감 행사만 (마감일 임박 순으로 정렬)",
    )

    sp.add_parser("stats", help="DB 통계")

    pst = sp.add_parser("status", help="행사 상태 변경")
    pst.add_argument("id_prefix", help="dedup_id 앞 6자 이상 (list로 확인)")
    pst.add_argument("status", choices=STATUS_VALUES, help=f"가능: {', '.join(STATUS_VALUES)}")

    pmm = sp.add_parser("memo", help="행사에 메모 추가/덮어쓰기")
    pmm.add_argument("id_prefix")
    pmm.add_argument("memo", help='메모 (따옴표로 감싸기)')

    psh = sp.add_parser("show", help="행사 상세 조회")
    psh.add_argument("id_prefix")

    preg = sp.add_parser("register", help="행사에 SKU 등록 (행사가/예상수량)")
    preg.add_argument("id_prefix")
    preg.add_argument("sku_id", type=int)
    preg.add_argument("sale_price", type=int)
    preg.add_argument("-q", "--qty", type=int, default=0, help="예상 수량 (기본 0)")

    punr = sp.add_parser("unregister", help="행사에서 SKU 제거")
    punr.add_argument("id_prefix")
    punr.add_argument("sku_id", type=int)

    pper = sp.add_parser("period", help="행사 진행기간 설정 (YYYY-MM-DD)")
    pper.add_argument("id_prefix")
    pper.add_argument("start")
    pper.add_argument("end")

    psa = sp.add_parser("sales-all", help="active 행사(applied/selected/running) 매출 일괄 새로고침")

    psl = sp.add_parser("sales", help="행사 등록 SKU+기간으로 정산자동화웹 매출 매칭")
    psl.add_argument("id_prefix")
    psl.add_argument(
        "-c", "--channel",
        action="append",
        default=None,
        help="채널 강제 지정 (정산자동화웹 채널명, 반복 가능). 미지정 시 events.channel_key 기반 자동 매핑.",
    )
    psl.add_argument(
        "--all-channels",
        action="store_true",
        help="채널 필터 끄고 전 채널 합산 (디버깅/탐색용)",
    )

    pdj = sp.add_parser("dump-json", help="events 전체를 JSON으로 dump (Next.js 화면용)")
    pdj.add_argument("-o", "--out", default=None, help="출력 경로 (기본: data/events.json)")

    prs = sp.add_parser("reset", help="행사의 상태/메모/SKU/기간/매출캐시 초기화 (행사 자체는 유지)")
    prs.add_argument("id_prefix")

    pdl = sp.add_parser("delete", help="행사 삭제 (기본은 수동등록만)")
    pdl.add_argument("id_prefix")
    pdl.add_argument("--force", action="store_true", help="crawl 수집 행사도 강제 삭제 (다음 crawl 재수집)")

    pfr = sp.add_parser("fee-rates", help="정산자동화웹 데이터로 채널별 실효 수수료율 계산")
    pfr.add_argument("--days", type=int, default=90, help="분석 기간 (기본 90일)")

    pad_spend = sp.add_parser("ad-spend", help="행사별 실제 광고비 입력")
    pad_spend.add_argument("id_prefix")
    pad_spend.add_argument("amount", type=int, help="원 단위. 0 또는 음수면 클리어")

    pcl = sp.add_parser("contact-list", help="MD 연락처 목록")
    pcl.add_argument("-c", "--channel", default=None)

    pca = sp.add_parser("contact-add", help="MD 연락처 추가")
    pca.add_argument("channel_key")
    pca.add_argument("name")
    pca.add_argument("--kakao", default=None)
    pca.add_argument("--phone", default=None)
    pca.add_argument("--email", default=None)
    pca.add_argument("--memo", default=None)

    pcd = sp.add_parser("contact-del", help="MD 연락처 삭제")
    pcd.add_argument("contact_id", type=int)

    psc = sp.add_parser("sync-channels", help="정산자동화웹 facets → channels_master DB 동기화")
    psc.add_argument("--dry", action="store_true")

    pchl = sp.add_parser("channel-list", help="채널 마스터 목록")

    pchm = sp.add_parser("channel-meta", help="채널 메타 업데이트 (status/priority/note/url/fee)")
    pchm.add_argument("settle_name")
    pchm.add_argument("--status", default=None, help="활성/검토중/보류/제외 등")
    pchm.add_argument("--priority", default=None, help="높음/보통/낮음")
    pchm.add_argument("--note", default=None)
    pchm.add_argument("--url", default=None, help="입점/관리 URL")
    pchm.add_argument("--fee", default=None, help="기본 수수료율 (0.0~1.0). 빈 문자열은 NULL.")

    pcham = sp.add_parser("channel-add-manual", help="수동 채널 추가 (정산자동화웹에 없는 채널)")
    pcham.add_argument("settle_name")
    pcham.add_argument("display_name")
    pcham.add_argument("--info", action="store_true", help="설정하면 정보 채널 (기본=판매)")
    pcham.add_argument("--abbr", default=None)
    pcham.add_argument("--fee", type=float, default=None, help="기본 수수료율 (예: 0.15)")
    pcham.add_argument("--yaml-key", default=None)

    pchd = sp.add_parser("channel-del", help="채널 마스터 삭제")
    pchd.add_argument("settle_name")

    pca = sp.add_parser("comment-add", help="행사에 자유 코멘트 추가")
    pca.add_argument("id_prefix")
    pca.add_argument("text")

    pad = sp.add_parser("activity-del", help="타임라인 활동 1건 삭제")
    pad.add_argument("activity_id", type=int)

    psm = sp.add_parser("sku-matrix-set", help="SKU × 채널 입점 상태 set/clear")
    psm.add_argument("settle_name")
    psm.add_argument("sku_id", type=int)
    psm.add_argument("--status", default=None, choices=["entered", "reviewing", "blocked", "none"],
                     help="entered/reviewing/blocked (none = 미입점, 키 삭제)")
    psm.add_argument("--entry-date", default=None, help="입점일 YYYY-MM-DD")
    psm.add_argument("--note", default=None)

    ptl = sp.add_parser("template-list", help="반복 행사 템플릿 목록")

    pta = sp.add_parser("template-add", help="반복 행사 템플릿 추가")
    pta.add_argument("name", help="템플릿 이름 (예: 네이버 오늘끝딜 주간)")
    pta.add_argument("channel_key")
    pta.add_argument("title_pattern", help="제목 패턴 (예: [오늘끝딜] {주차} 6/15일주차)")
    pta.add_argument("--category", default=None)
    pta.add_argument("--recurrence", default=None, help="weekly/monthly/biweekly 등 자유 텍스트")
    pta.add_argument("--memo", default=None)

    ptd = sp.add_parser("template-del", help="템플릿 삭제")
    ptd.add_argument("template_id", type=int)

    pup = sp.add_parser("update", help="행사 본문 수정 (제목/마감/카테고리/URL/행사유형/할인/예상매출/업체)")
    pup.add_argument("id_prefix")
    pup.add_argument("--title", default=None)
    pup.add_argument("--deadline", default=None, help="YYYY-MM-DD (빈 문자열은 클리어)")
    pup.add_argument("--category", default=None)
    pup.add_argument("--url", default=None)
    pup.add_argument("--event-type", default=None)
    pup.add_argument("--discount", type=float, default=None, help="할인율 (0.0 ~ 1.0)")
    pup.add_argument("--burden", default=None)
    pup.add_argument("--expected", type=int, default=None)
    pup.add_argument("--vendor", default=None)
    pup.add_argument("--owner", default=None, help="담당 MD 이름")
    pup.add_argument("--channel", default=None, help="채널 변경 (channels.yaml 의 key)")
    pup.add_argument("--vendor-contact", default=None)

    paa = sp.add_parser("attach-add", help="행사 첨부(구좌 캡쳐) 메타 등록 — 파일은 미리 저장돼 있어야 함")
    paa.add_argument("id_prefix")
    paa.add_argument("filename", help="data/attachments/<dedup_id>/<filename> 에 저장된 파일명")
    paa.add_argument("--original", default=None, help="업로드 원본 파일명")
    paa.add_argument("--caption", default=None, help='한 줄 캡션 (예: "메인 배너 1번 슬롯")')
    paa.add_argument("--mime", default=None, help="MIME 타입 (image/png 등)")
    paa.add_argument("--size", type=int, default=None, help="파일 크기 (bytes)")

    pau = sp.add_parser("attach-update", help="첨부 캡션 수정")
    pau.add_argument("attach_id", type=int)
    pau.add_argument("caption", help="빈 문자열은 NULL")

    pad_att = sp.add_parser("attach-del", help="첨부 삭제 (DB + 파일)")
    pad_att.add_argument("attach_id", type=int)

    pon = sp.add_parser("ops-note", help="운영관리 메모 (재고/클레임/회고)")
    pon.add_argument("id_prefix")
    pon.add_argument("kind", choices=["stock", "claim", "retro"])
    pon.add_argument("value", help="빈 문자열은 NULL")

    pie = sp.add_parser("infer-event-type", help="event_type 비어있는 행사 일괄 자동 추론 (제목/카테고리 prefix 기반)")
    pie.add_argument("--all", action="store_true", help="이미 채워진 event_type 도 덮어쓰기 (기본은 NULL 인 것만)")

    sp.add_parser("infer-md-owner", help="md_owner_name 비어있는 행사에 채널별 contacts 1:1 매핑 기준 자동 매핑")

    pcs = sp.add_parser("import-cs", help="이지데스크 .xls (HTML 포맷) → cs_messages 테이블 import (같은 날짜 데이터 자동 교체)")
    pcs.add_argument("file_path", help=".xls 파일 경로")
    pcs.add_argument("--clear", action="store_true", help="import 전 cs_messages 전체 삭제")

    sp.add_parser("cs-clear", help="cs_messages 전체 삭제 (재업로드 전 초기화)")

    pcsr = sp.add_parser("cs-similar-replies", help="과거 비슷한 인입에 대한 실제 발신 답변 N개 (JSON 출력)")
    pcsr.add_argument("customer_message", help="새 인입 메시지")
    pcsr.add_argument("--limit", type=int, default=5)

    pcsa = sp.add_parser("cs-analyze", help="인입 메시지 종합 분석 (intent+sentiment+추출+과거답변) JSON")
    pcsa.add_argument("customer_message")

    pac = sp.add_parser("add-comment", help="광고/SNS 댓글 수동 등록 + 키워드 분류 (JSON)")
    pac.add_argument("platform", choices=["instagram", "youtube", "kakao", "facebook", "tiktok", "sns_own"])
    pac.add_argument("comment_text")
    pac.add_argument("--url", default=None)
    pac.add_argument("--label", default=None)
    pac.add_argument("--author", default=None)
    pac.add_argument("--notes", default=None)

    pch = sp.add_parser("comment-handled", help="댓글 처리완료 토글")
    pch.add_argument("comment_id", type=int)
    pch.add_argument("--undo", action="store_true")

    pcf = sp.add_parser("comment-flag", help="댓글 플래그 토글")
    pcf.add_argument("comment_id", type=int)
    pcf.add_argument("--undo", action="store_true")

    pcd = sp.add_parser("comment-delete", help="댓글 삭제")
    pcd.add_argument("comment_id", type=int)

    pbkb = sp.add_parser("build-product-kb", help="조선팔도떡집 11종 상품 지식 베이스 빌드")
    pbkb.add_argument("--force", action="store_true", help="11종 전체 재빌드")
    pbkb.add_argument("--smart", action="store_true", help="답변수 10%%+ 변화 또는 7일+ 된 상품만 재빌드 (incremental)")

    psim = sp.add_parser("save-simulation", help="마진 시뮬레이터 입력값을 행사 simulation_json 에 스냅샷 저장")
    psim.add_argument("id_prefix")
    psim.add_argument("--price", type=int, required=True, help="정상가 (원)")
    psim.add_argument("--cost", type=int, required=True, help="단가 원가")
    psim.add_argument("--ship", type=int, required=True, help="택배비")
    psim.add_argument("--commission", type=float, required=True, help="수수료율 %% (예: 10.6)")
    psim.add_argument("--discount", type=float, required=True, help="할인율 %% (예: 10)")
    psim.add_argument("--extra", type=int, default=0, help="기타 비용 (전단지 등)")

    patt = sp.add_parser("attach-channel-totals", help="행사 기간 채널 전체 매출을 sales_json 에 attach (SKU 매칭 생략)")
    patt.add_argument("id_prefix")
    patt.add_argument("--channel", required=True, help="정산자동화웹 채널명 (예: 쇼핑엔티)")
    patt.add_argument("--brand", required=True, help="브랜드 (예: 조선팔도떡집)")
    patt.add_argument("--close", action="store_true", help="저장 후 status=closed 처리")

    pad = sp.add_parser("add-event", help="수동 행사 등록 (MD 직접 연락 등 RSS에 안 뜨는 케이스)")
    pad.add_argument("channel_key", help="channels.yaml 의 key (예: coupang_wing)")
    pad.add_argument("title")
    pad.add_argument("-d", "--deadline", help="신청 마감일 (YYYY-MM-DD)")
    pad.add_argument("-u", "--url", help="관련 URL (없으면 manual:// placeholder)")
    pad.add_argument("-m", "--memo", help="메모 (MD 이름, 통화 내용 등)")
    pad.add_argument("--category", help="카테고리 (예: 신선, 푸드)")
    pad.add_argument("--start", help="진행기간 시작일 (YYYY-MM-DD)")
    pad.add_argument("--end", help="진행기간 종료일 (YYYY-MM-DD)")
    pad.add_argument("--event-type", default=None, help="행사유형 (기획전/타임특가/오늘끝딜 등)")
    pad.add_argument("--discount", type=float, default=None, help="할인율 (0.0 ~ 1.0)")
    pad.add_argument("--burden", default=None, help="할인부담주체 (도아/채널/분담)")
    pad.add_argument("--expected", type=int, default=None, help="예상 매출 (원)")
    pad.add_argument("--vendor", default=None, help="업체명 (벤더사)")
    pad.add_argument("--vendor-contact", default=None, help="업체 연락처")
    pad.add_argument("--owner", default=None, help="담당 MD 이름")

    args = p.parse_args()
    if args.cmd is None or args.cmd == "crawl":
        sys.exit(cmd_crawl(getattr(args, "channel", None), getattr(args, "doa_only", False)))
    elif args.cmd == "list":
        sys.exit(cmd_list(args.limit, args.doa, args.channel, args.upcoming))
    elif args.cmd == "stats":
        sys.exit(cmd_stats())
    elif args.cmd == "status":
        sys.exit(cmd_status(args.id_prefix, args.status))
    elif args.cmd == "memo":
        sys.exit(cmd_memo(args.id_prefix, args.memo))
    elif args.cmd == "show":
        sys.exit(cmd_show(args.id_prefix))
    elif args.cmd == "register":
        sys.exit(cmd_register(args.id_prefix, args.sku_id, args.sale_price, args.qty))
    elif args.cmd == "unregister":
        sys.exit(cmd_unregister(args.id_prefix, args.sku_id))
    elif args.cmd == "period":
        sys.exit(cmd_period(args.id_prefix, args.start, args.end))
    elif args.cmd == "sales":
        sys.exit(cmd_sales(args.id_prefix, args.channel, args.all_channels))
    elif args.cmd == "sales-all":
        sys.exit(cmd_sales_all())
    elif args.cmd == "attach-channel-totals":
        sys.exit(cmd_attach_channel_totals(args.id_prefix, args.channel, args.brand, args.close))
    elif args.cmd == "infer-md-owner":
        sys.exit(cmd_infer_md_owner())
    elif args.cmd == "import-cs":
        sys.exit(cmd_import_cs(args.file_path, args.clear))
    elif args.cmd == "cs-clear":
        sys.exit(cmd_cs_clear())
    elif args.cmd == "cs-similar-replies":
        sys.exit(cmd_cs_similar_replies(args.customer_message, args.limit))
    elif args.cmd == "cs-analyze":
        sys.exit(cmd_cs_analyze(args.customer_message))
    elif args.cmd == "add-comment":
        sys.exit(cmd_add_comment(args.platform, args.comment_text, args.url, args.label, args.author, args.notes))
    elif args.cmd == "comment-handled":
        sys.exit(cmd_comment_handled(args.comment_id, 0 if args.undo else 1))
    elif args.cmd == "comment-flag":
        sys.exit(cmd_comment_flag(args.comment_id, 0 if args.undo else 1))
    elif args.cmd == "comment-delete":
        sys.exit(cmd_comment_delete(args.comment_id))
    elif args.cmd == "build-product-kb":
        sys.exit(cmd_build_product_kb(args.force, args.smart))
    elif args.cmd == "save-simulation":
        sys.exit(cmd_save_simulation(
            args.id_prefix, args.price, args.cost, args.ship,
            args.commission, args.discount, args.extra,
        ))
    elif args.cmd == "add-event":
        sys.exit(cmd_add_event(
            args.channel_key, args.title, args.deadline, args.url, args.memo, args.category,
            sale_start=args.start, sale_end=args.end,
            event_type=args.event_type, discount_rate=args.discount,
            discount_burden=args.burden, expected_revenue=args.expected,
            vendor_name=args.vendor, vendor_contact=args.vendor_contact,
            md_owner_name=args.owner,
        ))
    elif args.cmd == "dump-json":
        sys.exit(cmd_dump_json(args.out))
    elif args.cmd == "reset":
        sys.exit(cmd_reset(args.id_prefix))
    elif args.cmd == "delete":
        sys.exit(cmd_delete(args.id_prefix, args.force))
    elif args.cmd == "update":
        sys.exit(cmd_update(
            args.id_prefix, args.title, args.deadline, args.category, args.url,
            event_type=args.event_type, discount_rate=args.discount,
            discount_burden=args.burden, expected_revenue=args.expected,
            vendor_name=args.vendor, vendor_contact=args.vendor_contact,
            md_owner_name=args.owner,
            channel_key=args.channel,
        ))
    elif args.cmd == "fee-rates":
        sys.exit(cmd_fee_rates(args.days))
    elif args.cmd == "ad-spend":
        sys.exit(cmd_ad_spend(args.id_prefix, args.amount))
    elif args.cmd == "contact-list":
        sys.exit(cmd_contact_list(args.channel))
    elif args.cmd == "contact-add":
        sys.exit(cmd_contact_add(args.channel_key, args.name, args.kakao, args.phone, args.email, args.memo))
    elif args.cmd == "contact-del":
        sys.exit(cmd_contact_delete(args.contact_id))
    elif args.cmd == "sync-channels":
        sys.exit(cmd_sync_channels(args.dry))
    elif args.cmd == "channel-list":
        sys.exit(cmd_channel_list())
    elif args.cmd == "channel-meta":
        sys.exit(cmd_channel_meta(args.settle_name, args.status, args.priority, args.note, args.url, args.fee))
    elif args.cmd == "channel-add-manual":
        sys.exit(cmd_channel_add_manual(
            args.settle_name, args.display_name, not args.info,
            args.abbr, args.fee, args.yaml_key,
        ))
    elif args.cmd == "channel-del":
        sys.exit(cmd_channel_delete(args.settle_name))
    elif args.cmd == "sku-matrix-set":
        status = None if args.status in (None, "none") else args.status
        sys.exit(cmd_sku_matrix_set(args.settle_name, args.sku_id, status, args.entry_date, args.note))
    elif args.cmd == "comment-add":
        sys.exit(cmd_comment_add(args.id_prefix, args.text))
    elif args.cmd == "activity-del":
        sys.exit(cmd_activity_del(args.activity_id))
    elif args.cmd == "template-list":
        sys.exit(cmd_template_list())
    elif args.cmd == "template-add":
        sys.exit(cmd_template_add(args.name, args.channel_key, args.title_pattern, args.category, args.recurrence, args.memo))
    elif args.cmd == "template-del":
        sys.exit(cmd_template_del(args.template_id))
    elif args.cmd == "attach-add":
        sys.exit(cmd_attach_add(
            args.id_prefix, args.filename, args.original, args.caption,
            args.mime, args.size,
        ))
    elif args.cmd == "attach-update":
        sys.exit(cmd_attach_update(args.attach_id, args.caption))
    elif args.cmd == "attach-del":
        sys.exit(cmd_attach_del(args.attach_id))
    elif args.cmd == "ops-note":
        sys.exit(cmd_ops_note(args.id_prefix, args.kind, args.value))
    elif args.cmd == "infer-event-type":
        with connect() as conn:
            n_check, n_updated = infer_event_types(conn, only_null=not args.all)
        print(f"✓ {n_check}건 검사 · {n_updated}건 event_type 자동 갱신")
        sys.exit(0)


if __name__ == "__main__":
    main()
