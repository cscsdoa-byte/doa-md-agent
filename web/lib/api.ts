/**
 * fetch URL 에 basePath 자동 prefix.
 *
 * Next.js 의 <Link> 와 router.push 는 basePath 자동 처리하지만
 * 일반 fetch() 는 자동 적용 안 됨. 그래서 모든 API 호출은 이 헬퍼로.
 *
 * dev: NEXT_PUBLIC_BASE_PATH 비어있음 → /api/...
 * prod: NEXT_PUBLIC_BASE_PATH = "/md" → /md/api/...
 */
export const API_BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
