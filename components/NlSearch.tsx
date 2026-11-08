"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FILTERS, isDefault } from "@/lib/filters";
import { chipsOf, NL_EXAMPLES, NL_MAX_CHARS, type NlResult } from "@/lib/nl";
import { useStore } from "./Store";

/** 말로 찾기: 문장 → 필터 칩. 필터는 지도·목록이 함께 쓰는 Store 상태에 그대로 넣는다 */
export default function NlSearch({ compact = false }: { compact?: boolean }) {
  const { ds, filters, setFilters, complexCd, setComplexCd } = useStore();
  const complexNm = ds?.complexes.find((c) => c.complex_cd === complexCd)?.complex_nm ?? null;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [ex, setEx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setEx((i) => (i + 1) % NL_EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/nl-filter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q }), signal: AbortSignal.timeout(10_000) });
      const j = (await res.json().catch(() => ({}))) as Partial<NlResult> & { error?: string };
      if (!res.ok || !j.filters) throw new Error(j.error ?? "다시 입력해 주세요");
      setFilters(j.filters);
      const cd = j.complex?.length === 1 ? (ds?.complexes.find((c) => c.complex_nm === j.complex![0])?.complex_cd ?? null) : null;
      setComplexCd(cd);
      setIgnored(j.ignored ?? []);
      if (isDefault(j.filters) && !cd) setMsg("조건으로 바꿀 표현을 찾지 못함 · 다시 입력해 주세요");
    } catch (err) {
      setMsg(err instanceof Error && err.message !== "signal timed out" && !err.message.includes("abort") ? err.message : "AI 변환을 지금 쓸 수 없음 · 예시 조건으로 직접 거르기(필터 버튼) 가능");
    } finally {
      setBusy(false);
    }
  };

  const chips = chipsOf(filters);
  return (
    <div className={compact ? "relative w-full md:w-80" : "w-full"}>
      <form onSubmit={submit} className="flex gap-1" data-tour="nl-search">
        <input
          id="INP-NL" type="search" value={text} maxLength={NL_MAX_CHARS} onChange={(e) => setText(e.target.value)}
          placeholder={`말로 찾기 · ${NL_EXAMPLES[ex]}`} aria-label="말로 찾기"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-cell"
        />
        <button id="BTN-NL" type="submit" disabled={busy || !text.trim()} className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">{busy ? "변환 중" : "찾기"}</button>
      </form>
      {(chips.length > 0 || (complexNm && ignored.length + chips.length > 0) || ignored.length > 0 || msg) && (
        <div id="NL-CHIPS" className={`${compact ? "absolute left-0 right-0 top-full z-20 mt-1 rounded-lg bg-white p-2 shadow-lg ring-1 ring-slate-900/10" : "mt-2"} flex flex-wrap items-center gap-1 text-xs`}>
          {complexNm && chips.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-white">
              {complexNm}
              <button type="button" aria-label={`${complexNm} 해제`} onClick={() => setComplexCd(null)} className="text-white/70 hover:text-white">✕</button>
            </span>
          )}
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-white">
              {c.label}
              <button type="button" aria-label={`${c.label} 해제`} onClick={() => setFilters(c.clear(filters))} className="text-white/70 hover:text-white">✕</button>
            </span>
          ))}
          {chips.length > 1 && <button type="button" onClick={() => { setFilters(DEFAULT_FILTERS); setIgnored([]); }} className="text-slate-600 underline">모두 해제</button>}
          {ignored.length > 0 && <span className="text-slate-500">해석하지 못한 표현: {ignored.join(", ")}</span>}
          {msg && <span role="status" className="text-amber-800">{msg}</span>}
        </div>
      )}
    </div>
  );
}
