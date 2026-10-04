"use client";

import { useState } from "react";
import { toManwon, type Summary } from "@/lib/calc";
import { CONSTANTS, REVIEW_BADGE } from "@/lib/constants";

const n = (v: number, digits = 0) => v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const eok = (won: number) => n(toManwon(won) / 10000, 1);

interface Props {
  summary: Summary;
  scope: string;
  baseDate: string;
  unitCost: number;
  priceLabel: string;
  hasTop: boolean;
  onTop: () => void;
}

/** 화면 아래에 깔리는 계량 띠. 지도를 가리지 않도록 한 줄로 읽힌다. 좁은 화면에서는 핵심 셋만 보이고 누르면 펼쳐진다. */
export default function SummaryBanner({ summary: s, scope, baseDate, unitCost, priceLabel, hasTop, onTop }: Props) {
  const items: { label: string; value: string; unit: string; source: string }[] = [
    { label: "대상 공장", value: n(s.buildings), unit: "동", source: `GIS건물통합정보 ${baseDate} · 30kW 이상 대상` },
    { label: "설치 가능", value: n(s.mw, 1), unit: "MW", source: `이용률 ${CONSTANTS.UTIL.value * 100}% · ${CONSTANTS.M2_PER_KW.value}㎡/kW 가정` },
    { label: "연 발전", value: n(s.gwh, 1), unit: "GWh", source: `${CONSTANTS.PVOUT.source} ${n(CONSTANTS.PVOUT.value)}kWh/kWp` },
    { label: "재사용 팩", value: n(s.packs), unit: "개", source: `정격 ${CONSTANTS.PACK_KWH.value}kWh · 충전율 10~90% 가정` },
    { label: "연 절감", value: `${eok(s.save_low)}~${eok(s.save_base)}`, unit: "억 원", source: `하한 ${CONSTANTS.PRICE_LOW.value}원 ~ ${priceLabel} ${unitCost}원/kWh` },
    { label: "감축", value: n(s.co2_t), unit: "tCO2", source: `${CONSTANTS.EMISSION.source}` },
  ];
  const [open, setOpen] = useState(false);
  return (
    <section id="CRD-00" data-tour="summary" className="surface @container overflow-hidden">
      {/* 좁은 화면: 한 줄 요약 */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 md:hidden">
        <button type="button" aria-expanded={open} aria-controls="CRD-00-body" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] text-ink/55">{scope} 합계 · {REVIEW_BADGE}</span>
            <span className="readout block truncate !text-[16px]">
              {n(s.buildings)}<span className="unit">동</span> · {n(s.mw, 1)}<span className="unit">MW</span> · 연 {n(s.save_low / 1e8)}~{n(s.save_base / 1e8)}<span className="unit">억</span>
            </span>
          </span>
          <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border border-ink/15 text-[10px] text-ink/60 transition-transform ${open ? "rotate-180" : ""}`}>▲</span>
          <span className="sr-only">{open ? "합계 접기" : "합계 펼치기"}</span>
        </button>
        {hasTop && (
          <button type="button" onClick={onTop} className="shrink-0 rounded-md bg-tier-go px-3 py-2 text-[13px] font-semibold text-white">1순위 보기</button>
        )}
      </div>
      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink/10 px-3 py-1.5 md:flex md:px-4">
        <h2 className="text-[13px] font-semibold">{scope} 합계</h2>
        <span className="badge-review">{REVIEW_BADGE}</span>
        <span className="text-[11px] text-ink/55">그 외 {n(s.others)}동(30kW 미만·대상 아님)은 합계에 넣지 않았습니다</span>
      </div>
      <div id="CRD-00-body" className={`flex-col @4xl:flex-row @4xl:items-stretch md:flex ${open ? "flex border-t border-ink/10" : "hidden"}`}>
        <dl className="grid flex-1 grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-6 @4xl:divide-x @4xl:divide-ink/10">
          {items.map((it) => (
            <div key={it.label} title={it.source} className="min-w-0 px-3 py-1.5 @4xl:py-2">
              <dt className="text-[11px] text-ink/55">{it.label}</dt>
              <dd className="readout whitespace-nowrap">
                {it.value}
                <span className="unit">{it.unit}</span>
              </dd>
              <p className="hidden truncate text-[10px] text-ink/40 @5xl:block">{it.source}</p>
            </div>
          ))}
        </dl>
        {hasTop && (
          <button id="BTN-01" data-tour="top1" type="button" onClick={onTop} className="m-2 hidden shrink-0 rounded-md bg-tier-go px-4 py-2 text-sm font-semibold text-white hover:brightness-110 md:block @4xl:my-2 @4xl:mr-3">
            적합도 1순위 건물 보기
          </button>
        )}
        <p className="px-3 pb-2 text-[11px] text-ink/55 md:hidden">그 외 {n(s.others)}동(30kW 미만·대상 아님)은 합계에 넣지 않았습니다</p>
      </div>
    </section>
  );
}
