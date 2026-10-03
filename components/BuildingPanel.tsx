"use client";

import { useState } from "react";
import { toManwon } from "@/lib/calc";
import { CONSTANTS as C, REVIEW_BADGE } from "@/lib/constants";
import type { Building, Dataset } from "@/lib/data";
import type { Price } from "@/lib/price";
import { summarySentence, WEIGHTS, type PartKey } from "@/lib/score";
import { TIER_COLOR } from "./MapView";

const n = (v: number, d = 0) => v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const NA = <span className="text-slate-400">정보 없음</span>;
const PART_LABEL: Record<PartKey, string> = { scale: "규모", struct: "구조", age: "사용 연수", industry: "전력수요 업종", hazmat: "안전 이격", grid: "배전 여유" };

function Card({ id, tour, title, source, children }: { id: string; tour?: string; title: string; source: string; children: React.ReactNode }) {
  return (
    <section id={id} data-tour={tour} className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-[13px] font-semibold">{title}</h3>
      {children}
      <p className="mt-2 text-[10px] leading-snug text-slate-400">출처 {source}</p>
    </section>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[13px]">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="num text-right">{children}</dd>
    </div>
  );
}

function Big({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="num text-xl font-semibold leading-tight">
        {value}
        <span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

interface Props {
  b: Building;
  ds: Dataset;
  price: Price;
  onRefreshPrice: () => void;
  onClose: () => void;
}

export default function BuildingPanel({ b, ds, price, onRefreshPrice, onClose }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const { calc: c, score: s, roof } = b;
  const excluded = s.tier === "제외";
  const title = b.companies[0]?.company ?? b.name ?? b.addr ?? `건물 ${b.bld_id}`;
  const gisSrc = `${ds.meta.source} ${ds.meta.base_date}${b.reg_match ? ` · ${ds.meta.register_source}` : ""}`;
  const input = { target: b.target, calc: c, struct: b.struct, aprYmd: b.apr_ymd, industry: b.industry };

  const copyLink = async () => {
    const url = `${location.origin}/?b=${b.bld_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("링크를 복사했어요");
    } catch {
      setCopied(url);
    }
  };

  return (
    <aside id="WF2" className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-xl ring-1 ring-slate-900/10 md:rounded-2xl">
      <header className="flex items-start gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          <p className="truncate text-xs text-slate-500">{b.addr ?? "주소 정보 없음"} · {b.complex_nm}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="패널 닫기" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <p id="TXT-02" className="rounded-lg bg-slate-900 px-3 py-2 text-[13px] leading-snug text-white">{summarySentence(input, s)}</p>

        <Card id="CRD-01" title="건물·회사" source={`${gisSrc}${b.companies.length ? ` · ${ds.meta.factory_source}` : ""}`}>
          {b.companies.length === 0 ? (
            <p className="mb-1 text-[13px] text-slate-500">등록공장 정보 연결 안 됨</p>
          ) : (
            <ul className="mb-1 space-y-1">
              {b.companies.map((co, i) => (
                <li key={i} className="text-[13px]">
                  <span className="font-medium">{co.company}</span>
                  {co.group && <span className="ml-1 rounded bg-emerald-50 px-1 text-[11px] text-emerald-800">{co.group}</span>}
                  {co.match === "PNU" && <span className="ml-1 text-[11px] text-slate-400">같은 필지(동 구분 불가)</span>}
                  <p className="text-xs text-slate-500">{co.product ?? "생산품 정보 없음"}</p>
                </li>
              ))}
            </ul>
          )}
          <dl>
            <Row k="주용도">{b.use ?? <span className="text-amber-700">용도 미확인</span>}</Row>
            <Row k="구조">{b.struct ?? NA}</Row>
            <Row k="건축면적">{b.arch_area ? `${n(b.arch_area, 1)}㎡` : NA}</Row>
            <Row k="연면적">{b.tot_area ? `${n(b.tot_area, 1)}㎡` : NA}</Row>
            <Row k="지상층수 · 높이">{b.fl_up ? `${n(b.fl_up)}층` : NA} · {b.h ? `${n(b.h, 1)}m` : NA}</Row>
            <Row k="사용승인">{b.apr_ymd ? `${b.apr_ymd.slice(0, 4)}.${b.apr_ymd.slice(4, 6)} (${s.ageYears}년)` : NA}</Row>
            <Row k="가까운 119안전센터">{b.dist_119_m != null ? `${n(b.dist_119_m / 1000, 1)}km (직선)` : NA}</Row>
          </dl>
        </Card>

        {excluded ? (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-[13px]">산업용 대상 건물이 아니에요</p>
        ) : c.pv_kw === null ? (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-[13px]">면적 정보가 없어 계산하지 않았어요</p>
        ) : (
          <>
            <Card id="CRD-02" tour="card-pv" title="지붕 태양광" source={`지붕면적 ${gisSrc} · ${C.PVOUT.source}`}>
              <div className="grid grid-cols-2 gap-2">
                <Big label="설치 용량" value={n(c.pv_kw, 1)} unit="kW" />
                <Big label="연 발전량" value={n(c.pv_kwh!)} unit="kWh" />
              </div>
              <p className="num mt-2 rounded bg-slate-100 px-2 py-1 text-xs">
                {n(c.roof_m2!, 1)}㎡ × {C.UTIL.value} ÷ {C.M2_PER_KW.value} = {n(c.pv_kw, 1)}kW · × {n(C.PVOUT.value)} = {n(c.pv_kwh!)}kWh
              </p>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                {roof.source === "GEOM" && <span className="rounded bg-slate-100 px-1.5 py-0.5">GIS 도형 면적</span>}
                {roof.flags.includes("AREA_MISMATCH") && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">면적 자료 불일치 — 작은 값 사용</span>}
                {b.roof_type && <span className="rounded bg-slate-100 px-1.5 py-0.5">지붕 {b.roof_type}</span>}
              </div>
            </Card>

            <Card id="CRD-03" tour="card-ess" title="재사용 배터리 ESS" source={`${C.PACK_KWH.source} · 법정 성능등급 기준은 2027.5 시행 전 미정`}>
              {c.small ? (
                <p className="text-[13px]">소규모 — ESS 산정 안 함 (30kW 미만)</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Big label="ESS 목표" value={n(c.ess_kwh!)} unit="kWh" />
                    <Big label="재사용 팩" value={n(c.packs!)} unit="개" />
                    <Big label="분산 단위" value={n(c.ess_units!)} unit="개" />
                  </div>
                  <dl className="mt-2">
                    <Row k="팩당 사용 가능">{n(c.kwh_per_pack, 2)}kWh (정격 {C.PACK_KWH.value}kWh)</Row>
                    <Row k="운전 충전율">10~90% 고정</Row>
                    <Row k="단위당 용량">1MWh 이하</Row>
                  </dl>
                </>
              )}
            </Card>

            <Card id="CRD-04" tour="card-money" title="절감액·탄소" source={`한국전력공사 전력데이터 개방포털(청주 산업용 평균판매단가) · ${C.EMISSION.source}`}>
              <div className="grid grid-cols-2 gap-2">
                <Big label="연 절감 (하한~기준)" value={`${n(toManwon(c.save_low!))}~${n(toManwon(c.save_base!))}`} unit="만 원" />
                <Big label="온실가스 감축" value={n(c.co2_t!, 1)} unit="tCO2" />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                하한 {C.PRICE_LOW.value}원 ~ 기준 <span className="num font-medium">{price.unitCost}원/kWh</span> ({price.month})
                {price.fallback && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">기준값 {C.PRICE_FALLBACK.value}원({C.PRICE_FALLBACK.asOf.replace("-", ".")})으로 계산</span>}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">평균판매단가에는 기본요금이 들어 있어 실제 절감은 하한에 가까울 수 있습니다. 기후환경요금·연료비조정액은 넣지 않았습니다.</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{REVIEW_BADGE}</span>
                <button id="BTN-02" type="button" onClick={onRefreshPrice} disabled={price.loading} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">
                  {price.loading ? "불러오는 중" : "최신 단가 다시 불러오기"}
                </button>
              </div>
            </Card>

            <Card id="CRD-05" tour="card-gate" title="설치 조건·적합도" source="본 서비스 산출(산정 기준 참고) · 거리 기준은 초기값이며 법정 이격이 아닙니다">
              <div className="flex items-center gap-2">
                <span className="rounded-md px-2 py-1 text-sm font-semibold text-white" style={{ background: TIER_COLOR[s.tier] }}>{s.tier}</span>
                <span id="SCR-01" className="num text-lg font-semibold">{s.score}<span className="text-xs font-normal text-slate-500">/{s.max}</span></span>
                <span className="text-xs text-slate-500">안전 게이트 {s.gate}</span>
              </div>
              <span id="BDG-02" className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{REVIEW_BADGE}</span>
              <ul className="mt-2 space-y-1">
                {(Object.entries(s.parts) as [PartKey, number][]).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-slate-500">{PART_LABEL[k]}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200"><i className="block h-full bg-slate-700" style={{ width: `${(v / WEIGHTS[k]) * 100}%` }} /></span>
                    <span className="num w-10 text-right">{v}/{WEIGHTS[k]}</span>
                  </li>
                ))}
              </ul>
              <ul id="BDG-01" className="mt-2 flex flex-wrap gap-1">
                {b.flags.includes("USE_NULL") && <li className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">용도 미확인</li>}
                {s.chips.map((chip) => (
                  <li key={chip} className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">{chip}</li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 text-sm">
        <button id="BTN-05" type="button" onClick={copyLink} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100">링크 복사</button>
        {copied && <span role="status" className="truncate text-xs text-slate-600">{copied}</span>}
      </footer>
    </aside>
  );
}
