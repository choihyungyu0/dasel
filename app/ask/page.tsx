"use client";

import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useStore } from "@/components/Store";
import { ASK_EXAMPLES, ASK_FOOT, ASK_MAX_CHARS } from "@/lib/ask";

interface Msg {
  role: "user" | "assistant";
  content: string;
  source?: string;
  verified?: boolean;
  at: string;
}

const KEY = "dasel_ask_v1";
const FAIL = "지금은 답변을 만들 수 없음 · 왼쪽 예시 질문은 즉시 답변 가능";
const time = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

export default function AskPage() {
  const { price, ds } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setMsgs(saved.slice(-30));
    } catch {
      // 저장소를 못 쓰면 이번 화면 동안만
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      // 무시
    }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    const history = msgs.slice(-6).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: q, at: time() }]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, unitCost: price.unitCost, history }), signal: AbortSignal.timeout(12_000) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.answer) throw new Error(j.error ?? FAIL);
      setMsgs((m) => [...m, { role: "assistant", content: j.answer, source: j.source, verified: j.verified, at: time() }]);
    } catch (e) {
      setText((t) => t || q); // 입력값 유지
      setMsgs((m) => [...m, { role: "assistant", content: e instanceof Error && !/abort|timed out|fetch/i.test(e.message) ? e.message : FAIL, verified: false, at: time() }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex h-dvh flex-col gap-2 bg-slate-100 p-2 md:p-3">
      <AppHeader complexSelect={false} />
      <div className="flex min-h-0 flex-1 gap-3">
        {/* 왼쪽: 업무 안내·예시 질문 */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 md:flex">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">다셀 질의응답</p>
            <h1 className="mt-1 text-lg font-bold">산단 태양광 1차 검토 문의</h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">다셀이 계산한 건물별 결과와 산단 합계만 근거로 답변 · 근거에 없는 숫자가 나오면 답변하지 않음</p>
          </div>
          <dl className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5"><dt className="text-slate-500">기준 자료</dt><dd>{ds ? `${ds.meta.base_date}` : "불러오는 중"}</dd></div>
            <div className="flex justify-between py-0.5"><dt className="text-slate-500">전기요금 단가</dt><dd className="num">{price.unitCost}원/kWh</dd></div>
            <div className="flex justify-between py-0.5"><dt className="text-slate-500">답변 모델</dt><dd>OpenAI gpt-4.1</dd></div>
          </dl>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">예시 질문</p>
            <ul className="space-y-1">
              {ASK_EXAMPLES.map((q) => (
                <li key={q}>
                  <button type="button" disabled={busy} onClick={() => ask(q)} className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-xs hover:border-ink hover:bg-slate-50 disabled:opacity-50">{q}</button>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-auto rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">{ASK_FOOT} · 최종 판단은 현장 구조검토·한전 계통 협의</p>
        </aside>

        {/* 오른쪽: 문답 */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-semibold">문의 내역</p>
            {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} className="text-xs text-slate-500 underline">내역 지우기</button>}
          </header>
          <div id="ASK-THREAD" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.length === 0 && (
              <div className="mx-auto max-w-md pt-10 text-center text-sm text-slate-500">
                <p className="font-medium text-slate-700">질문을 입력해 주세요</p>
                <p className="mt-1 text-xs">예: {ASK_EXAMPLES[2]}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1 md:hidden">
                  {ASK_EXAMPLES.slice(0, 3).map((q) => (
                    <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs">{q}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed ${m.role === "user" ? "bg-ink text-white" : "border border-slate-200 bg-slate-50"}`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className={`mt-1.5 text-[10px] ${m.role === "user" ? "text-white/60" : "text-slate-400"}`}>
                    {m.at}
                    {m.role === "assistant" && m.verified && " · 숫자 근거 확인됨"}
                    {m.source && ` · 출처 ${m.source}`}
                  </p>
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-slate-500">답변 작성 중</p>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex gap-2 border-t border-slate-200 p-3">
            <input id="INP-ASK" value={text} onChange={(e) => setText(e.target.value)} maxLength={ASK_MAX_CHARS} placeholder="예: 오창과학 설치 우선 건물 중 내진설계 적용된 곳은?" aria-label="질문 입력" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cell" />
            <button id="BTN-ASK" type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40">질문</button>
          </form>
        </section>
      </div>
    </main>
  );
}
