import Link from "next/link";
import type { EventItem } from "@/lib/data";
import type { SessionIssue, TokenStatus } from "@/lib/health";

interface Props {
  token: TokenStatus;
  sessions: SessionIssue[];
  events: EventItem[];
}

function retroPendingIds(events: EventItem[]): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const out: string[] = [];
  for (const e of events) {
    if (e.status !== "closed") continue;
    if (!e.sale_end) continue;
    const end = new Date(e.sale_end);
    if (isNaN(end.getTime())) continue;
    end.setHours(0, 0, 0, 0);
    if (end > today || end < cutoff) continue;
    if (e.ops_retro_note && e.ops_retro_note.trim()) continue;
    out.push(e.dedup_id);
  }
  return out;
}

const SESSION_NAMES: Record<string, string> = {
  naver_smartstore: "네이버",
  kakao_talkstore: "카카오 톡스토어",
  coupang_wing: "쿠팡",
  "11st_soffice": "11번가",
  toss_shopping: "토스",
  esmplus: "G마켓/옥션",
  ns_homeshopping: "NS홈쇼핑",
  shoppingnT: "쇼핑엔티",
  onmd_mdlounge: "ONMD",
};

export default function SystemHealthCard({ token, sessions, events }: Props) {
  const retroIds = retroPendingIds(events);
  const items: { kind: "token" | "session" | "retro"; severity: "ok" | "warn" | "danger"; icon: string; text: React.ReactNode; href?: string }[] = [];

  // 토큰
  if (token.status === "missing") {
    items.push({ kind: "token", severity: "danger", icon: "❌", text: <>정산자동화웹 토큰 없음 — <code>.env</code> 확인</> });
  } else if (token.status === "expired") {
    items.push({ kind: "token", severity: "danger", icon: "❌", text: <>정산자동화웹 토큰 만료 — auto_login 점검</> });
  } else if (token.status === "expiring") {
    items.push({ kind: "token", severity: "warn", icon: "⏰", text: <>토큰 만료까지 {token.hoursLeft?.toFixed(1)}시간 — 곧 갱신 필요</> });
  }

  // 세션
  for (const s of sessions) {
    const name = SESSION_NAMES[s.key] || s.key;
    if (s.status === "missing") {
      items.push({ kind: "session", severity: "danger", icon: "🔐", text: <><b>{name}</b> 세션 파일 없음 — 수동 로그인 필요</> });
    } else {
      items.push({ kind: "session", severity: "warn", icon: "🔐", text: <><b>{name}</b> 세션 {s.ageDays}일 경과 — 재로그인 권장</> });
    }
  }

  // 회고
  if (retroIds.length > 0) {
    items.push({
      kind: "retro",
      severity: "warn",
      icon: "📝",
      text: <>회고 미작성 <b>{retroIds.length}건</b> — 종료 14일 이내</>,
      href: "/events",
    });
  }

  if (items.length === 0) return null;

  const danger = items.some((i) => i.severity === "danger");
  return (
    <div className={`mb-4 rounded p-3 border-2 ${
      danger
        ? "bg-rose-50 border-rose-400"
        : "bg-amber-50 border-amber-300"
    }`}>
      <div className={`text-sm font-bold mb-1.5 ${danger ? "text-rose-900" : "text-amber-900"}`}>
        ⚠️ 시스템 점검 ({items.length}건)
      </div>
      <ul className="space-y-1 text-xs">
        {items.map((it, i) => {
          const colorCls = it.severity === "danger" ? "text-rose-800" : "text-amber-800";
          const content = (
            <span className={colorCls}>
              <span className="mr-1">{it.icon}</span>
              {it.text}
            </span>
          );
          return (
            <li key={i}>
              {it.href ? (
                <Link href={it.href} className="hover:underline">{content}</Link>
              ) : content}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
