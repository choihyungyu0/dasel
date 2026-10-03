"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/Store";
import { REVIEW_BADGE } from "@/lib/constants";
import { buildFacts, templateOpinion, type Facts } from "@/lib/opinion";

const Thumb = dynamic(() => import("@/components/Thumb"), { ssr: false });

type Opinion = { status: "loading" } | { status: "done"; text: string; source: "llm" | "template"; createdAt: string };

const ROWS: [keyof Facts, string][] = [["설치용량", "설치 용량"], ["연발전량", "연 발전량"], ["ESS", "ESS 목표"], ["재사용팩", "재사용 팩"], ["분산단위", "분산 단위"], ["연절감", "연 절감(하한~기준)"], ["감축", "온실가스 감축"], ["점수", "적합도"]];

export default function OpinionPage() {
  const id = Number(useParams<{ id: string }>().id);
  const { status, ds, price } = useStore();
  const [opinion, setOpinion] = useState<Opinion>({ status: "loading" });

  const b = ds?.byId.get(id) ?? null;
  const feature = useMemo(() => ds?.geo.features.find((f) => Number(f.properties?.bld_id) === id) ?? null, [ds, id]);
  const facts = useMemo(() => {
    if (!ds || !b) return null;
    const sources = [`${ds.meta.source} ${ds.meta.base_date}`, b.reg_match ? ds.meta.register_source : null, b.companies.length ? ds.meta.factory_source : null, "한국전력공사 전력데이터 개방포털", "Global Solar Atlas"].filter((x): x is string => Boolean(x));
    return buildFacts(b, price, sources);
  }, [ds, b, price]);

  const generate = useCallback(() => {
    if (!facts || price.loading) return;
    setOpinion({ status: "loading" });
    const fallback = () => setOpinion({ status: "done", text: templateOpinion(facts), source: "template", createdAt: new Date().toISOString() });
    fetch("/api/opinion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bld_id: id, unitCost: price.unitCost, month: price.month, fallback: price.fallback }),
      signal: AbortSignal.timeout(12_000),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((o: { text: string; source: "llm" | "template"; createdAt: string }) => setOpinion({ status: "done", text: o.text, source: o.source, createdAt: o.createdAt }))
      .catch(fallback);
  }, [facts, id, price]);
  useEffect(generate, [generate]);

  if (status === "loading") return <main className="p-6 text-sm text-slate-500">공장 건물 불러오는 중</main>;
  if (!b || !facts) {
    return (
      <main className="p-6 text-sm">
        <p className="mb-2">{b ? "면적 정보가 없거나 대상이 아닌 건물이라 검토의견서를 만들 수 없어요" : "건물을 찾지 못했어요"}</p>
        <Link href="/" className="underline">지도로 돌아가기</Link>
      </main>
    );
  }

  const created = opinion.status === "done" ? opinion.createdAt.slice(0, 10) : "";
  return (
    <main className="mx-auto max-w-[210mm] p-3 print:p-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm print:hidden">
        <Link href={`/?b=${id}`} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-100">지도로 돌아가기</Link>
        <button id="BTN-08" type="button" onClick={() => print()} disabled={opinion.status !== "done"} className="rounded-md bg-slate-900 px-2.5 py-1 text-white disabled:opacity-40">인쇄 / PDF 저장</button>
        {opinion.status === "done" && <button type="button" onClick={generate} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-100">다시 만들기</button>}
      </div>

      <article id="WF7" className="space-y-3 rounded-xl bg-white p-5 text-[13px] leading-relaxed shadow-sm ring-1 ring-slate-900/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-3 border-b border-slate-300 pb-2">
          <div>
            <p className="text-xs text-slate-500">지붕 태양광·재사용 배터리 ESS 설치 검토의견서</p>
            <h1 className="text-lg font-bold">{facts.건물}</h1>
            <p className="text-xs text-slate-600">{facts.주소 ?? "주소 정보 없음"} · {facts.산단} · {facts.주용도 ?? "용도 미확인"} · {facts.구조 ?? "구조 정보 없음"}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{REVIEW_BADGE}</span>
            <p className="mt-1 text-sm font-semibold">{facts.단계}</p>
          </div>
        </header>

        {feature && <Thumb feature={feature} />}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4 print:grid-cols-4">
          {ROWS.map(([k, label]) => (
            <div key={k}>
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className="num font-semibold">{(facts[k] as string | null) ?? "산정 안 함"}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-slate-500">단가 {facts.단가} · 지붕면적 {facts.지붕면적}{facts.사용승인 ? ` · 사용승인 ${facts.사용승인}` : ""}</p>

        <section id="TXT-01" aria-live="polite" className="border-t border-slate-200 pt-3">
          {opinion.status === "loading" ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">의견서 쓰는 중</p>
              {[90, 100, 75, 95, 60].map((w, i) => <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${w}%` }} />)}
            </div>
          ) : (
            <>
              <p className="mb-2 print:hidden">
                {opinion.source === "llm"
                  ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">숫자 확인 완료</span>
                  : <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium">기본 양식으로 작성</span>}
              </p>
              <div className="whitespace-pre-wrap">{opinion.text}</div>
            </>
          )}
        </section>

        <footer className="border-t border-slate-200 pt-2 text-[11px] text-slate-500">
          {created && <>작성일 {created} · </>}이 문서는 공개 데이터로 계산한 {REVIEW_BADGE} 결과입니다. 실제 설치 여부와 용량은 현장 조사, 구조검토, 전기·소방 협의를 거쳐 정해집니다. · 다셀
        </footer>
      </article>
    </main>
  );
}
