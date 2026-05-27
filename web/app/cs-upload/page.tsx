"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type React from "react";
import { apiUrl } from "@/lib/api";

interface UploadResult {
  ok?: boolean;
  stdout?: string;
  error?: string;
  stderr?: string;
}

export default function CsUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(f: File) {
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(apiUrl("/api/cs-upload"), { method: "POST", body: fd });
      const data = (await r.json()) as UploadResult;
      setResult(data);
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      alert("파일을 먼저 선택하세요.");
      return;
    }
    await uploadFile(f);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xls")) {
      alert(".xls 파일만 올릴 수 있어요 (이지데스크 export).");
      return;
    }
    setFileName(f.name);
    void uploadFile(f);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💬 CS 데이터 업로드</h1>
            <p className="text-sm text-slate-500 mt-1">
              이지데스크 → 메시지조회 → 엑셀 다운로드 (.xls) 올리면 일별 CS 인입/발신 통계 자동 갱신
            </p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm bg-white border rounded hover:bg-slate-50 text-slate-700">
            ← 캘린더
          </Link>
        </header>

        <div className="bg-amber-50 border border-amber-200 rounded p-4 mb-4 text-sm space-y-1">
          <div className="font-bold text-amber-900 mb-1">📝 사용 방법</div>
          <div className="text-amber-900">1. 이지데스크 → 메시지 조회 (날짜 범위 지정)</div>
          <div className="text-amber-900">2. 엑셀 다운로드 → <code>ezdesk_macro*.xls</code> 받음</div>
          <div className="text-amber-900">3. 아래 ↓ 끌어놓기 또는 파일 선택 → 자동 업로드</div>
          <div className="text-amber-900">※ 같은 날짜 데이터는 자동 교체 (중복 안 쌓임)</div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mb-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "bg-emerald-50 border-emerald-500" : "bg-white border-slate-300"
          }`}
        >
          <div className="text-3xl mb-1">📥</div>
          <div className="text-base font-semibold text-slate-700">.xls 파일을 여기로 끌어다 놓으세요</div>
          <div className="text-xs text-slate-500 mt-1">놓으면 바로 업로드됩니다</div>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <label className="block">
            <span className="text-base font-semibold text-slate-800 mb-2 block">또는 파일 선택</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xls"
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
            <div className="mt-2 text-sm text-slate-600">선택됨: <b>{fileName}</b></div>
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

        {result && (
          <div className="mt-4 bg-white border rounded-lg p-4">
            <div className="font-bold text-base mb-2">📊 결과</div>
            {result.error ? (
              <div className="bg-rose-50 border border-rose-200 rounded p-3 text-sm text-rose-900">
                ❌ <b>실패</b>: {result.error}
                {result.stderr && <pre className="mt-2 text-xs overflow-auto">{result.stderr}</pre>}
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm">
                ✅ <b>성공</b>
                {result.stdout && <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">{result.stdout}</pre>}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
