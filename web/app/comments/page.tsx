import Link from "next/link";
import CommentsPanel from "@/components/CommentsPanel";
import { loadEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

interface AdComment {
  id: number; platform: string; post_url?: string | null; post_label?: string | null;
  comment_text: string; author?: string | null; posted_at?: string | null;
  sentiment?: string | null; severity?: number; keywords?: string | null;
  flagged?: number; handled?: number; notes?: string | null; imported_at: string;
}

export default async function CommentsPage() {
  const payload = await loadEvents().catch(() => null);
  const comments: AdComment[] = (payload as { ad_comments?: AdComment[] })?.ad_comments ?? [];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💬 광고·SNS 댓글 모니터링</h1>
            <p className="text-sm text-slate-500 mt-1">
              인스타·유튜브·카카오·페북·틱톡 광고 댓글 등록 + 자동 부정 감지 (키워드 기반)
              · 향후 플랫폼 API 자동 수집 가능
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 메인
          </Link>
        </header>
        <CommentsPanel comments={comments} />
      </div>
    </main>
  );
}
