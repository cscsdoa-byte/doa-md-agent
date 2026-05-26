"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelMaster, EventItem } from "@/lib/data";
import { apiUrl } from "@/lib/api";
import { themeOf } from "@/lib/channelTheme";

interface Props {
  channels: ChannelMaster[];
  settleChannels: string[];   // 정산자동화웹 facets.channels (raw 이름 그대로)
  yamlChannels: { key: string; name: string; is_sales: boolean }[]; // channels.yaml
  events: EventItem[];
}

const STATUS_OPTIONS = ["", "활성", "검토중", "보류", "제외"];
const PRIORITY_OPTIONS = ["", "높음", "보통", "낮음"];

export default function VendorsTable({ channels, settleChannels, yamlChannels, events }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // events 채널별 카운트 (yaml_key 기준)
  const eventCountByYaml = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) {
      m[e.channel_key] = (m[e.channel_key] || 0) + 1;
    }
    return m;
  }, [events]);

  // 누락 분석
  const settleSet = new Set(settleChannels);
  const yamlByKey = new Map(yamlChannels.map((c) => [c.key, c]));
  const masterByName = new Map(channels.map((c) => [c.settle_name, c]));

  // settle 에 있지만 master 에 없는 채널 (sync 필요)
  const missingFromMaster = settleChannels.filter((s) => !masterByName.has(s));
  // master 에 있지만 settle 에 없는 채널 (수동 추가 / 또는 정산자동화웹에서 사라짐)
  const onlyInMaster = channels.filter((c) => c.source !== "settle" || !settleSet.has(c.settle_name));
  // yaml 에 있지만 master 에 없는 채널
  const masterYamlKeys = new Set(channels.map((c) => c.yaml_key).filter(Boolean));
  const yamlMissingFromMaster = yamlChannels.filter((y) => !masterYamlKeys.has(y.key));

  async function updateMeta(name: string, patch: Record<string, string>) {
    setBusy(name);
    try {
      const r = await fetch(apiUrl(`/api/channels?name=${encodeURIComponent(name)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`실패: ${j?.error || r.statusText}`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function deleteChannel(name: string) {
    if (!confirm(`'${name}' 채널을 삭제할까요?\n(정산 매출/행사 데이터는 그대로 유지됩니다)`)) return;
    setBusy(name);
    try {
      const r = await fetch(apiUrl(`/api/channels?name=${encodeURIComponent(name)}`), { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`실패: ${j?.error || r.statusText}`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* 진단 카드 */}
      {(missingFromMaster.length > 0 || yamlMissingFromMaster.length > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm">
          <div className="font-bold text-amber-900 mb-2">⚠️ 동기화 필요 채널</div>
          {missingFromMaster.length > 0 && (
            <div className="text-amber-900">
              <b>정산자동화웹에 있지만 마스터에 없음 ({missingFromMaster.length}개)</b>:{" "}
              {missingFromMaster.join(", ")}
              <div className="text-xs text-amber-700 mt-1">
                → 서버에서 <code className="bg-white px-1 rounded">uv run python -m crawler.run sync-channels</code> 실행
              </div>
            </div>
          )}
          {yamlMissingFromMaster.length > 0 && (
            <div className="text-amber-900 mt-2">
              <b>yaml(어댑터)에 있지만 마스터에 없음 ({yamlMissingFromMaster.length}개)</b>:{" "}
              {yamlMissingFromMaster.map((y) => y.name).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* 채널 마스터 표 */}
      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs text-slate-700">
            <tr>
              <th className="px-2 py-2 text-left">채널</th>
              <th className="px-2 py-2 text-left">출처</th>
              <th className="px-2 py-2 text-left">판매/정보</th>
              <th className="px-2 py-2 text-left">수수료</th>
              <th className="px-2 py-2 text-left">상태</th>
              <th className="px-2 py-2 text-left">우선순위</th>
              <th className="px-2 py-2 text-left">행사</th>
              <th className="px-2 py-2 text-left">메모</th>
              <th className="px-2 py-2 text-left">URL</th>
              <th className="px-2 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-slate-400 py-6">
                  채널 마스터가 비어있어요. 서버에서 <code className="bg-slate-100 px-1 rounded">sync-channels</code> 명령으로 정산자동화웹에서 가져오세요.
                </td>
              </tr>
            )}
            {channels.map((c) => {
              const th = c.yaml_key ? themeOf(c.yaml_key) : null;
              const eventCount = c.yaml_key ? (eventCountByYaml[c.yaml_key] || 0) : 0;
              const inSettle = settleSet.has(c.settle_name);
              return (
                <tr key={c.settle_name} className="border-b hover:bg-slate-50 align-top">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {th && <span className={`font-mono font-extrabold text-xs ${th.bold}`}>{th.abbr}</span>}
                      <span className="font-medium">{c.display_name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">{c.settle_name}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      c.source === "settle" ? "bg-emerald-100 text-emerald-800" :
                      c.source === "yaml" ? "bg-blue-100 text-blue-800" :
                      "bg-amber-100 text-amber-800"
                    }`}>
                      {c.source}
                    </span>
                    {c.source === "settle" && !inSettle && (
                      <div className="text-[10px] text-rose-600 mt-0.5">정산웹 사라짐</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {c.is_sales ? "💰 판매" : "📰 정보"}
                  </td>
                  <td className="px-2 py-2 text-xs whitespace-nowrap">
                    {c.default_fee_rate !== null ? `${(c.default_fee_rate * 100).toFixed(1)}%` : "-"}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      defaultValue={c.status ?? ""}
                      disabled={busy === c.settle_name}
                      onChange={(e) => updateMeta(c.settle_name, { status: e.target.value })}
                      className="text-xs border rounded px-1 py-0.5 bg-white"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s || "(없음)"}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      defaultValue={c.priority ?? ""}
                      disabled={busy === c.settle_name}
                      onChange={(e) => updateMeta(c.settle_name, { priority: e.target.value })}
                      className="text-xs border rounded px-1 py-0.5 bg-white"
                    >
                      {PRIORITY_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s || "(없음)"}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-xs text-center">
                    {eventCount > 0 ? <b className="text-blue-700">{eventCount}건</b> : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <input
                      type="text"
                      defaultValue={c.note ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (c.note ?? "")) {
                          updateMeta(c.settle_name, { note: e.target.value });
                        }
                      }}
                      placeholder="-"
                      disabled={busy === c.settle_name}
                      className="text-xs border-0 bg-transparent w-32 hover:bg-yellow-50 px-1 rounded"
                    />
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                        링크
                      </a>
                    ) : (
                      <input
                        type="text"
                        placeholder="https://..."
                        onBlur={(e) => {
                          if (e.target.value) updateMeta(c.settle_name, { url: e.target.value });
                        }}
                        disabled={busy === c.settle_name}
                        className="text-xs border-0 bg-transparent w-28 hover:bg-yellow-50 px-1 rounded"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => deleteChannel(c.settle_name)}
                      disabled={busy === c.settle_name}
                      className="text-[10px] text-rose-600 hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 채널 추가 */}
      <div className="bg-white border rounded p-3">
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            + 채널 추가 (예: NS홈쇼핑)
          </button>
        ) : (
          <AddChannelForm
            yamlChannels={yamlChannels}
            onCancel={() => setShowAdd(false)}
            onAdded={() => { setShowAdd(false); router.refresh(); }}
          />
        )}
      </div>
    </div>
  );
}

function AddChannelForm({
  yamlChannels,
  onCancel,
  onAdded,
}: {
  yamlChannels: { key: string; name: string; is_sales: boolean }[];
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [settleName, setSettleName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [yamlKey, setYamlKey] = useState("");
  const [abbr, setAbbr] = useState("");
  const [fee, setFee] = useState("");
  const [isInfo, setIsInfo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!settleName || !displayName) {
      alert("정산자동화웹 채널명 + 표시 이름은 필수");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        settle_name: settleName,
        display_name: displayName,
        is_sales: !isInfo,
      };
      if (yamlKey) body.yaml_key = yamlKey;
      if (abbr) body.abbr = abbr;
      if (fee) body.default_fee_rate = parseFloat(fee) / 100;
      const r = await fetch(apiUrl("/api/channels"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        alert(`실패: ${j?.error || r.statusText}`);
        return;
      }
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-bold mb-1">새 채널 추가</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600 block mb-0.5">정산자동화웹 채널명 (PK)</label>
          <input value={settleName} onChange={(e) => setSettleName(e.target.value)}
                 placeholder="예: NS홈쇼핑" className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-0.5">표시 이름</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                 placeholder="예: NS홈쇼핑" className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-0.5">어댑터 yaml key (선택)</label>
          <select value={yamlKey} onChange={(e) => setYamlKey(e.target.value)}
                  className="w-full border rounded px-2 py-1">
            <option value="">(없음)</option>
            {yamlChannels.map((y) => (
              <option key={y.key} value={y.key}>{y.name} ({y.key})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-0.5">약어 (예: NS)</label>
          <input value={abbr} onChange={(e) => setAbbr(e.target.value)}
                 className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-0.5">기본 수수료율 % (예: 15)</label>
          <input value={fee} onChange={(e) => setFee(e.target.value)} type="number"
                 className="w-full border rounded px-2 py-1" />
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-1 text-xs text-slate-700 mt-4">
            <input type="checkbox" checked={isInfo} onChange={(e) => setIsInfo(e.target.checked)} />
            정보 채널 (체크 해제 = 판매)
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 border rounded hover:bg-slate-50">
          취소
        </button>
        <button onClick={submit} disabled={busy}
                className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-slate-400">
          {busy ? "추가 중..." : "추가"}
        </button>
      </div>
    </div>
  );
}
