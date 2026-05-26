"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

interface UploadResult {
  csv_orders?: number;
  orders_updated?: number;
  not_matched_count?: number;
  not_matched_sample?: string[];
  parse_errors?: number;
  error?: string;
  raw?: string;
  detail?: string;
}

export default function TossUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

  async function handleUpload() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      alert("csv 파일을 먼저 선택하세요.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(apiUrl("/api/toss-upload"), { method: "POST", body: fd });
      const data = (await r.json()) as UploadResult;
      setResult(data);
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💰 토스 정산 업로드</h1>
            <p className="text-sm text-slate-500 mt-1">
              토스 판매자센터에서 받은 <b>건별 정산 내역 csv</b>를 올리면 정산자동화웹의 토스 매출 수수료가 자동으로 정확하게 갱신됩니다.
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 캘린더
          </Link>
        </header>

        {/* 사용법 */}
        <div className="bg-amber-50 border border-amber-200 rounded p-4 mb-4 text-sm space-y-1">
          <div className="font-bold text-amber-900 mb-1">📝 이렇게 하세요</div>
          <div className="text-amber-900">1. <a href="https://partner.tossshopping.com" target="_blank" rel="noopener" className="underline font-medium">토스 판매자센터</a> → 정산 → 건별 정산 내역</div>
          <div className="text-amber-900">2. 지급일 범위 선택 (예: 전월 1일 ~ 말일)</div>
          <div className="text-amber-900">3. csv 다운로드</div>
          <div className="text-amber-900">4. 아래 ↓ 파일 선택 후 업로드 버튼</div>
        </div>

        {/* 업로드 카드 */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <label className="block">
            <span className="text-base font-semibold text-slate-800 mb-2 block">정산 csv 파일</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="block w-full text-base text-slate-700
                         file:mr-3 file:py-3 file:px-5
                         file:rounded file:border-0
                         file:bg-blue-100 file:text-blue-800
                         file:font-medium hover:file:bg-blue-200
                         file:cursor-pointer cursor-pointer"
            />
          </label>
          {fileName && (
            <div className="mt-2 text-sm text-slate-600">
              선택됨: <b>{fileName}</b>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={busy}
            className="mt-4 w-full px-4 py-3 bg-emerald-600 text-white text-base font-bold rounded
                       hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {busy ? "⏳ 업로드 중..." : "📤 업로드"}
          </button>
        </div>

        {/* 결과 */}
        {result && (
          <div className="mt-4 bg-white border rounded-lg p-4">
            <div className="font-bold text-base mb-2">📊 결과</div>
            {result.error || result.detail ? (
              <div className="bg-rose-50 border border-rose-200 rounded p-3 text-sm text-rose-900">
                ❌ <b>실패</b>: {result.error || result.detail}
                {result.raw && <pre className="mt-2 text-xs overflow-auto">{result.raw}</pre>}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                  ✅ <b>성공</b>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded p-2">
                    <div className="text-xs text-slate-500">csv 주문 건수</div>
                    <div className="text-lg font-bold">{result.csv_orders ?? 0}</div>
                  </div>
                  <div className="bg-emerald-50 rounded p-2">
                    <div className="text-xs text-emerald-700">DB 업데이트</div>
                    <div className="text-lg font-bold text-emerald-800">{result.orders_updated ?? 0}건</div>
                  </div>
                  <div className="bg-amber-50 rounded p-2">
                    <div className="text-xs text-amber-700">매칭 실패</div>
                    <div className="text-lg font-bold text-amber-800">{result.not_matched_count ?? 0}건</div>
                  </div>
                  <div className="bg-slate-50 rounded p-2">
                    <div className="text-xs text-slate-500">파싱 오류</div>
                    <div className="text-lg font-bold">{result.parse_errors ?? 0}건</div>
                  </div>
                </div>
                {result.not_matched_sample && result.not_matched_sample.length > 0 && (
                  <div className="text-xs text-amber-700 mt-2">
                    <div className="font-semibold mb-1">매칭 실패 주문번호 sample:</div>
                    <div className="font-mono">{result.not_matched_sample.join(", ")}</div>
                    <div className="text-slate-500 mt-1">
                      ↑ 이지어드민에 아직 이 주문이 안 들어왔거나, 주문번호 형식이 다를 수 있어요.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
