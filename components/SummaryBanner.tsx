"use client";

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

export default function SummaryBanner({ summary: s, scope, baseDate, unitCost, priceLabel, hasTop, onTop }: Props) {
  const items: { label: string; value: string; unit: string; source: string }[] = [
    { label: "대상 공장", value: n(s.buildings), unit: "동", source: `GIS건물통합정보 ${baseDate} · 30kW 이상 대상` },
    { label: "설치 가능", value: n(s.mw, 1), unit: "MW", source: `이용률 ${CONSTANTS.UTIL.value * 100}% · ${CONSTANTS.M2_PER_KW.value}㎡/kW 가정` },
    { label: "연 발전", value: n(s.gwh, 1), unit: "GWh", source: `${CONSTANTS.PVOUT.source} ${n(CONSTANTS.PVOUT.value)}kWh/kWp` },
    { label: "재사용 팩", value: n(s.packs), unit: "개", source: `정격 ${CONSTANTS.PACK_KWH.value}kWh · 충전율 10~90% 가정` },
    { label: "연 절감", value: `${eok(s.save_low)}~${eok(s.save_base)}`, unit: "억 원", source: `하한 ${CONSTANTS.PRICE_LOW.value}원 ~ ${priceLabel} ${unitCost}원/kWh` },
    { label: "감축", value: n(s.co2_t), unit: "tCO2", source: `${CONSTANTS.EMISSION.source}` },
  ];
  return (
    <section id="CRD-00" data-tour="summary" className="rounded-xl bg-white/92 px-4 py-3 shadow-sm ring-1 ring-slate-900/10 backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{scope} 합계</h2>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{REVIEW_BADGE}</span>
        <span className="text-[11px] text-slate-500">그 외 {n(s.others)}동(30kW 미만·대상 아님)은 합계에 넣지 않았습니다</span>
      </div>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 md:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} title={it.source}>
            <dt className="text-[11px] text-slate-500">{it.label}</dt>
            <dd className="num text-lg font-semibold leading-tight">
              {it.value}
              <span className="ml-0.5 text-xs font-normal text-slate-500">{it.unit}</span>
            </dd>
            <p className="hidden truncate text-[10px] text-slate-400 md:block">{it.source}</p>
          </div>
        ))}
      </dl>
      {hasTop && (
        <button id="BTN-01" data-tour="top1" type="button" onClick={onTop} className="mt-3 rounded-lg bg-tier-go px-3 py-1.5 text-sm font-medium text-white hover:brightness-110">
          적합도 1순위 건물 보기
        </button>
      )}
    </section>
  );
}
