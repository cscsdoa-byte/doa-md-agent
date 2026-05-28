import Link from "next/link";
import ChannelsBoard from "@/components/ChannelsBoard";
import { loadChannels } from "@/lib/channels";
import { loadEvents } from "@/lib/data";
import { fetchChannelPL } from "@/lib/settle";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const [payload, yamlChannels, channelPL] = await Promise.all([
    loadEvents(),
    loadChannels(),
    fetchChannelPL().catch(() => ({ totals: null, prev_totals: null, range: null, channels: [] })),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📡 채널 종합 운영 보드</h1>
            <p className="text-sm text-slate-500 mt-1">
              각 채널의 이번 달 매출·마진·진행 행사·광고비·CS·댓글 한 화면 ·
              {channelPL.range?.start} ~ {channelPL.range?.end}
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 메인
          </Link>
        </header>

        <ChannelsBoard
          events={payload.events}
          channelPL={channelPL.channels}
          channelsMaster={payload.channels_master ?? []}
          yamlChannels={yamlChannels}
          adComments={payload.ad_comments ?? []}
          adCommentStats={payload.ad_comment_stats}
        />
      </div>
    </main>
  );
}
