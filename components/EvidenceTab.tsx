"use client";

import { useEffect, useState } from "react";

interface Ev {
  ai: string | null;
  pass1: string | null;
  pass2: string | null;
  review: string | null;
  blind: string | null;
  human: string | null;
  roof: { a: number; b: number; mean: number } | null;
  permit: { rows: number; kw: number; years: string[]; status: Record<string, number> } | null;
}

let cache: Promise<Record<string, Ev> | null> | null = null;
const load = () => (cache ??= fetch("/data/evidence.json").then((r) => (r.ok ? r.json() : null)).then((j) => j?.evidence ?? null).catch(() => null));

export const EVIDENCE_FOOT = "AI 판독은 1차 참고 · 사람 표본 20동 대조 일치 14/16(κ 0.75)";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[13px]">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function method(e: Ev): string {
  const two = e.pass1 && e.pass2 ? (e.pass1 === e.pass2 ? `1차·2차 일치(${e.pass1})` : `1차 ${e.pass1} · 2차 ${e.pass2} 엇갈림`) : "1차·2차 기록 없음";
  const rv = e.review ? ` · 재판독 ${e.review}` : "";
  const bl = e.blind ? ` · 눈가림 재판독 ${e.blind}${e.ai && e.blind === e.ai ? "(일치)" : "(불일치)"}` : "";
  return two + rv + bl;
}

export default function EvidenceTab({ bldId }: { bldId: number }) {
  const [ev, setEv] = useState<Record<string, Ev> | null | undefined>(undefined);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    let on = true;
    load().then((d) => on && setEv(d));
    return () => {
      on = false;
    };
  }, []);
  if (ev === undefined) return <p className="p-2 text-[13px] text-slate-500">판독 기록 불러오는 중</p>;
  const e = ev?.[String(bldId)];
  return (
    <section id="TAB-AI" className="space-y-2">
      {!e ? (
        <p className="rounded-lg border border-slate-200 bg-white p-3 text-[13px] text-slate-600">{ev === null ? "판독 기록을 불러오지 못함 · 다시 열어 주세요" : "판독 대상 아님(30kW 미만 등)"}</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          {imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/label_tiles/${bldId}.webp`} alt="판독에 쓴 항공영상(건물 외곽선 표시)" width={800} className="mb-2 w-full rounded" onError={() => setImgOk(false)} />
          ) : (
            <p className="mb-2 text-[12px] text-slate-500">판독 이미지 정보 없음</p>
          )}
          <dl>
            <Row k="AI 판정"><b>{e.ai ?? "정보 없음"}</b></Row>
            <Row k="판독 방식">{method(e)}</Row>
            <Row k="사람 검수">{e.human ? `사람 표본 판독: ${e.human}` : "사람 검수 전"}</Row>
            {e.roof && <Row k="AI 지붕 이용률">{`A ${e.roof.a.toFixed(2)} · B ${e.roof.b.toFixed(2)} · 평균 ${e.roof.mean.toFixed(2)}(참고)`}</Row>}
            {e.permit && <Row k="발전사업 허가 대조">{`같은 필지 허가 ${e.permit.rows}건 · ${e.permit.kw.toLocaleString("ko-KR")}kW${e.permit.years.length ? ` · ${e.permit.years.join("·")}년` : ""}`}</Row>}
          </dl>
          <p className="mt-2 text-[10px] leading-snug text-slate-400">출처 브이월드 항공영상(국토지리정보원 정사영상) · 발전사업 허가: 충청북도 태양광발전사업 허가현황(15138440)</p>
        </div>
      )}
      <p id="TXT-AI-FOOT" className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">{EVIDENCE_FOOT}</p>
    </section>
  );
}
