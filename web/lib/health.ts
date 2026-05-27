/**
 * 시스템 헬스 체크 — notify.py 의 슬랙 알림 로직을 화면에도 노출.
 * SSR(server component) 전용 — .env, fs 접근.
 */
import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_DIR = join(process.cwd(), "..");
// 셀러센터 세션은 보통 30일 유지 — 25일 넘으면 갱신 권장 (notify.py 와 동일)
const SESSION_WARN_DAYS = 25;
const TOKEN_WARN_HOURS = 2;

export interface TokenStatus {
  status: "ok" | "missing" | "expired" | "expiring";
  hoursLeft?: number;
}

export interface SessionIssue {
  key: string;
  status: "missing" | "stale";
  ageDays?: number;
}

export function checkSettleToken(): TokenStatus {
  let token = "";
  try {
    const envPath = join(PROJECT_DIR, ".env");
    const text = readFileSync(envPath, "utf-8");
    const m = text.match(/^SETTLE_API_TOKEN=(.+)$/m);
    if (m) token = m[1].trim();
  } catch {
    // ignore
  }
  if (!token) return { status: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { status: "missing" };
  try {
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const payloadJson = Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp || typeof payload.exp !== "number") return { status: "ok" };
    const nowSec = Date.now() / 1000;
    if (payload.exp <= nowSec) return { status: "expired", hoursLeft: 0 };
    const hoursLeft = (payload.exp - nowSec) / 3600;
    if (hoursLeft < TOKEN_WARN_HOURS) return { status: "expiring", hoursLeft };
    return { status: "ok", hoursLeft };
  } catch {
    return { status: "missing" };
  }
}

export function checkSessions(): SessionIssue[] {
  const storageDir = join(PROJECT_DIR, "crawler", "storage");
  if (!existsSync(storageDir)) return [];
  let files: string[] = [];
  try {
    files = readdirSync(storageDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const issues: SessionIssue[] = [];
  const now = Date.now();
  for (const f of files) {
    const key = f.replace(/\.json$/, "");
    try {
      const stat = statSync(join(storageDir, f));
      const ageDays = Math.floor((now - stat.mtimeMs) / (1000 * 60 * 60 * 24));
      if (ageDays >= SESSION_WARN_DAYS) {
        issues.push({ key, status: "stale", ageDays });
      }
    } catch {
      issues.push({ key, status: "missing" });
    }
  }
  return issues;
}
