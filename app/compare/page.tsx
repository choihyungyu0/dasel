"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { TIER_COLOR } from "@/components/MapView";
import { COMPARE_MAX, useStore } from "@/components/Store";
import { toManwon } from "@/lib/calc";
import { REVIEW_BADGE } from "@/lib/constants";
import type { Building } from "@/lib/data";

const n = (v: number | null, d = 0) => (v === null ? "–" : v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** 값이 클수록 좋은 항목은 best를 주어 가장 큰 값을 굵게 표시한다. */
const ROWS: { label: string; text: (b: Building) => string; best?: (b: Building) => number | null; low?: boolean }[] = [
  { label: "설치 용량", text: (b) => `${n(b.calc.pv_kw, 1)}kW`, best: (b) => b.calc.pv_kw },
  { label: "연 발전량", text: (b) => `${n(b.calc.pv_kwh)}kWh`, best: (b) => b.calc.pv_kwh },
  { label: "재사용 ESS(선택)", text: (b) => (b.calc.ess_kwh === null ? "산정 안 함" : `${n(b.calc.ess_kwh)}kWh`) },
  { label: "재사용 팩", text: (b) => (b.calc.packs === null ? "–" : `${n(b.calc.packs)}개`) },
  { label: "분산 단위", text: (b) => (b.calc.ess_units === null ? "–" : `${n(b.calc.ess_units)}단위`) },
  { label: "연 절감(하한~기준)", text: (b) => (b.calc.save_low === null ? "–" : `${n(toManwon(b.calc.save_low))}만~${n(toManwon(b.calc.save_base!))}만 원`), best: (b) => b.calc.save_base },
  { label: "태양광 투자비", text: (b) => (b.calc.capex === null ? "–" : `${n(b.calc.capex / 1e8, 1)}억 원`) },
  { label: "단순 회수기간", text: (b) => (b.calc.payback_base === null ? "–" : `${n(b.calc.payback_base, 1)}~${n(b.calc.payback_low, 1)}년`), best: (b) => b.calc.payback_base, low: true },
  { label: "안전 게이트", text: (b) => b.score.gate },
  { label: "적합도 점수", text: (b) => `${b.score.score}/${b.score.max}`, best: (b) => b.score.score },
  { label: "구조", text: (b) => b.struct ?? "정보 없음" },
  { label: "사용승인 경과", text: (b) => (b.score.ageYears === null ? "정보 없음" : `${b.score.ageYears}년`) },
];

export default function ComparePage() {
  const { status, ds, price, compare, toggleCompare } = useStore();
  const items = compare.map((id) => ds?.byId.get(id)).filter((b): b is Building => Boolean(b));

  return (
    <main className="flex min-h-dvh flex-col gap-2 p-2 md:p-3">
      <AppHeader complexSelect={false} />
      <section className="surface bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold">건물 비교</h2>
          <span className="badge-review">{REVIEW_BADGE}</span>
          <span className="text-xs text-slate-500">최대 {COMPARE_MAX}동 · 굵은 값이 가장 유리한 값입니다</span>
        </div>
        {status === "loading" && <p className="text-sm text-slate-500">공장 건물 불러오는 중</p>}
        {status === "ready" && items.length === 0 && (
          <p className="text-sm">
            담은 건물이 없어요. <Link href="/" className="underline">지도</Link>에서 건물을 누르고 '비교 담기'를 눌러 주세요.
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table id="TBL-03" className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="align-bottom">
                  <th scope="col" className="w-36 px-2 py-2 text-left text-xs font-medium text-slate-500">항목</th>
                  {items.map((b) => (
                    <th key={b.bld_id} scope="col" className="px-2 py-2 text-left">
                      <Link href={`/?b=${b.bld_id}`} className="block max-w-[220px] truncate font-semibold underline-offset-2 hover:underline">{b.companies[0]?.company ?? b.name ?? b.addr ?? `건물 ${b.bld_id}`}</Link>
                      <span className="block max-w-[220px] truncate text-xs font-normal text-slate-500">{b.complex_nm} · {b.addr?.split(" ").slice(-2).join(" ")}</span>
                      <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: TIER_COLOR[b.score.tier] }}>{b.score.tier}</span>
                      <button type="button" onClick={() => toggleCompare(b.bld_id)} className="ml-2 text-xs font-normal text-slate-500 underline">빼기</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const vals = r.best ? items.map(r.best).filter((v): v is number => v !== null) : [];
                  const top = vals.length > 1 ? (r.low ? Math.min(...vals) : Math.max(...vals)) : null;
                  return (
                    <tr key={r.label} className="border-t border-slate-100">
                      <th scope="row" className="px-2 py-1.5 text-left text-xs font-medium text-slate-500">{r.label}</th>
                      {items.map((b) => (
                        <td key={b.bld_id} className={`num px-2 py-1.5 ${top !== null && r.best?.(b) === top ? "font-bold" : ""}`}>{r.text(b)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {ds && items.length > 0 && <p className="mt-3 text-[11px] text-slate-500">{ds.meta.source} {ds.meta.base_date} · 단가 {price.unitCost}원/kWh({price.month}{price.fallback ? ", 기준값" : ""}) · 투자비는 태양광만(참고값)</p>}
      </section>
    </main>
  );
}
