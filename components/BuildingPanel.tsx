"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toManwon } from "@/lib/calc";
import { complexRule, essSpace, extraChips } from "@/lib/chips";
import { CONSTANTS as C, REVIEW_BADGE } from "@/lib/constants";
import { enrich, gridOf, type Building, type Dataset } from "@/lib/data";
import { defaultScenario, encodeScenario, PRICE_RANGE, type Scenario } from "@/lib/url";
import { useStore } from "./Store";
import type { Price } from "@/lib/price";
import { summarySentence, WEIGHTS, type PartKey } from "@/lib/score";
import { TIER_COLOR } from "./MapView";

const n = (v: number, d = 0) => v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const NA = <span className="text-slate-400">정보 없음</span>;
const ESS_USES = ["피크 저감(기본요금)", "경부하 충전·최대부하 방전", "정전 대비"];
const eok = (won: number) => n(won / 1e8, 1);
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
  /** 링크(?s=)로 들어온 이 건물 조건 */
  initial?: Scenario | null;
}

function Adjust({ id, label, value, min, max, step, show, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs">
      <span className="flex justify-between"><span>{label}</span><span className="num font-semibold">{show}</span></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </label>
  );
}

export default function BuildingPanel({ b: b0, ds, price, onRefreshPrice, onClose, initial = null }: Props) {
  const { compare, toggleCompare } = useStore();
  const [copied, setCopied] = useState<string | null>(null);
  const [essUse, setEssUse] = useState(ESS_USES[0]);
  // PNL-07: 이 건물만 조건을 바꿔 다시 계산한다. null이면 기본 조건
  const [adj, setAdj] = useState<Scenario | null>(initial);
  const base = useMemo(() => defaultScenario(price.unitCost), [price.unitCost]);
  const b = useMemo(() => (adj ? { ...enrich(b0, ds.meta.built.replaceAll("-", ""), adj.price, adj), stability: null } : b0), [adj, b0, ds.meta.built]);
  const cur = adj ?? base;
  const change = (patch: Partial<Scenario>) => setAdj({ ...cur, ...patch });
  const inCompare = compare.includes(b0.bld_id);
  const { calc: c, score: s, roof } = b;
  const excluded = s.tier === "제외";
  const lines = gridOf(ds.grid, b.addr);
  const space = essSpace(b);
  const saleNote = complexRule(b.complex_nm).solar_biz_allowed === true ? null : "이 산단은 판매 사업 허용 여부 확인 필요";
  const payback = c.payback_base === null || c.payback_low === null ? "–" : `${n(c.payback_base, 1)}~${n(c.payback_low, 1)}`;
  const title = b.companies[0]?.company ?? b.name ?? b.addr ?? `건물 ${b.bld_id}`;
  const gisSrc = `${ds.meta.source} ${ds.meta.base_date}${b.reg_match ? ` · ${ds.meta.register_source}` : ""}`;
  const input = { target: b.target, calc: c, struct: b.struct, aprYmd: b.apr_ymd, industry: b.industry };

  const copyLink = async () => {
    const url = `${location.origin}/?b=${b.bld_id}${adj ? `&s=${encodeScenario(adj)}` : ""}`;
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
        {ds.labels?.labels[String(b.bld_id)] === "설치" && (
          <p id="BDG-INST" className="rounded-lg border border-[#12b5d4] bg-[#e8fafd] px-3 py-2 text-[13px]">
            {ds.labels.meta.basis === "ai" ? "위성영상 AI 판독 초안에서 이 지붕에 태양광 패널이 이미 있는 것으로 보입니다(사람 확인 전)" : "위성영상에서 이 지붕에 태양광 패널이 이미 보입니다"}{ds.labels.meta.image_year ? ` (영상 ${ds.labels.meta.image_year}년)` : ""}. 아래 용량은 지붕 전체 기준이라 추가로 설치할 수 있는 양과 다릅니다.
          </p>
        )}
        <p id="TXT-02" className="rounded-lg bg-ink px-3 py-2 text-[13px] leading-snug text-white">{summarySentence(input, s)}</p>

        {!excluded && c.pv_kw !== null && (
          <details id="PNL-07" open={adj !== null} className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-[13px] font-semibold">이 건물 조건 바꾸기{adj && <span className="ml-2 rounded bg-cell/10 px-1.5 py-0.5 text-[11px] font-medium text-cell">조건 변경됨</span>}</summary>
            <div className="mt-2 space-y-2">
              <Adjust id="SLD-B1" label="지붕 이용률" value={Math.round(cur.util * 100)} min={30} max={70} step={5} show={`${Math.round(cur.util * 100)}%`} onChange={(v) => change({ util: v / 100 })} />
              <Adjust id="SLD-B2" label="kW당 설치 면적" value={cur.m2PerKw} min={7} max={12} step={0.5} show={`${cur.m2PerKw}㎡`} onChange={(v) => change({ m2PerKw: v })} />
              <Adjust id="SLD-B3" label="ESS 저장 시간" value={cur.essHours} min={1} max={4} step={0.5} show={`${cur.essHours}시간`} onChange={(v) => change({ essHours: v })} />
              <Adjust id="SLD-B4" label="기준 단가" value={cur.price} min={PRICE_RANGE[0]} max={PRICE_RANGE[1]} step={1} show={`${cur.price}원/kWh`} onChange={(v) => change({ price: v })} />
              {adj && b0.calc.pv_kw !== null && (
                <p className="num rounded bg-slate-100 px-2 py-1 text-xs">
                  기본 조건 대비 설치 용량 {c.pv_kw - b0.calc.pv_kw >= 0 ? "+" : "−"}{n(Math.abs(c.pv_kw - b0.calc.pv_kw), 1)}kW · 연 절감(기준) {(c.save_base ?? 0) - (b0.calc.save_base ?? 0) >= 0 ? "+" : "−"}{n(Math.abs(toManwon((c.save_base ?? 0) - (b0.calc.save_base ?? 0))))}만 원
                </p>
              )}
              <button type="button" onClick={() => setAdj(null)} disabled={!adj} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-40">기본값으로</button>
            </div>
          </details>
        )}

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

            <Card id="CRD-03" tour="card-ess" title="재사용 배터리 ESS (선택)" source={`${C.ESS_UNITS.source} · ${C.SOC_MAX.source} · 법정 성능등급 기준은 2027.5 시행 전 미정`}>
              {c.small ? (
                <p className="text-[13px]">소규모 — ESS 산정 안 함 (30kW 미만)</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-slate-600">태양광과 따로 정하는 선택 설비입니다. 기본은 재사용 ESS 1단위 시범(1MWh 이하)입니다.</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Big label="ESS 시범 용량" value={n(c.ess_kwh!)} unit="kWh" />
                    <Big label="재사용 팩" value={n(c.packs!)} unit="개" />
                    <Big label="분산 단위" value={n(c.ess_units!)} unit="개" />
                  </div>
                  <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-slate-500">쓰임새</span>
                    <select id="SEL-ESS" value={essUse} onChange={(e) => setEssUse(e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5">
                      {ESS_USES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                  <dl className="mt-1">
                    <Row k="팩당 사용 가능">{n(c.kwh_per_pack, 2)}kWh (정격 {C.PACK_KWH.value}kWh)</Row>
                    <Row k="운전 충전율">옥외 10~90% · 옥내 10~80%</Row>
                    <Row k="단위당 용량">1MWh 이하</Row>
                    <Row k="필지 공지(대지 − 건물)">{space ? `${n(space.open_m2)}㎡ · ${n(space.units)}단위 놓을 수 있음` : NA}</Row>
                  </dl>
                  <p className="mt-1 text-[11px]"><span className="rounded bg-slate-200 px-1.5 py-0.5">피크 저감 kW는 계약전력 확인 필요</span></p>
                </>
              )}
            </Card>

            <Card id="CRD-04" tour="card-money" title="절감액·투자비·탄소" source={`한국전력공사 전력데이터 개방포털(청주 산업용 평균판매단가) · ${C.EMISSION.source} · 설치비 ${C.CAPEX_PER_KW.source} · ${C.SMP.source}`}>
              <div className="grid grid-cols-2 gap-2">
                <Big label="태양광 연 절감 (하한~기준)" value={`${n(toManwon(c.save_low!))}~${n(toManwon(c.save_base!))}`} unit="만 원" />
                <Big label="온실가스 감축" value={n(c.co2_t!, 1)} unit="tCO2" />
                <Big label="태양광 투자비" value={eok(c.capex!)} unit="억 원" />
                <Big label="단순 회수기간" value={payback} unit="년" />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                하한 {C.PRICE_LOW.value}원 ~ 기준 <span className="num font-medium">{c.unit_cost}원/kWh</span> {adj && adj.price !== price.unitCost ? "(직접 입력)" : `(${price.month})`}
                {price.fallback && <span className="badge-review ml-1">기준값 {C.PRICE_FALLBACK.value}원({C.PRICE_FALLBACK.asOf.replace("-", ".")})으로 계산</span>}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">평균판매단가에는 기본요금이 들어 있어 실제 절감은 하한에 가까울 수 있습니다. 기후환경요금·연료비조정액은 넣지 않았습니다.</p>
              <table id="TBL-PAY" className="mt-2 w-full text-xs">
                <caption className="mb-1 text-left text-[11px] text-slate-500">
                  설치 방식 비교 <span className="rounded bg-slate-200 px-1 py-0.5">참고값</span> · 설치비 kW당 {n(C.CAPEX_PER_KW.value / 10000)}만 원, 보조금 미반영
                </caption>
                <tbody>
                  <tr className="border-t border-slate-200"><th scope="row" className="py-1 text-left font-medium">자가소비</th><td className="num py-1 text-right">투자 {eok(c.capex!)}억 원 · 회수 {payback}년</td></tr>
                  <tr className="border-t border-slate-200"><th scope="row" className="py-1 text-left font-medium">지붕 임대</th><td className="py-1 text-right text-slate-500">임대료 자료 확보 전 — 계산하지 않음</td></tr>
                  <tr className="border-t border-slate-200"><th scope="row" className="py-1 text-left font-medium">전력 판매</th><td className="num py-1 text-right">연 {n(toManwon(c.pv_kwh! * C.SMP.value))}만 원 · 회수 {c.pv_kwh! > 0 ? n(c.capex! / (c.pv_kwh! * C.SMP.value), 1) : "–"}년<span className="block text-[10px] font-normal text-slate-500">SMP {C.SMP.value}원/kWh만 반영, REC 수익 제외{saleNote ? ` · ${saleNote}` : ""}</span></td></tr>
                </tbody>
              </table>
              {c.ess_save !== null && (
                <p id="TXT-ESS" className="mt-2 rounded bg-slate-100 px-2 py-1.5 text-xs">
                  ESS 시간대 차익 <span className="num font-semibold">약 {n(toManwon(c.ess_save))}만 원/년</span> <span className="rounded bg-slate-200 px-1 py-0.5 text-[11px]">요금표 기준 추정</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">태양광 절감과 따로 봅니다. 경부하에 충전해 최대부하에 방전한다고 가정한 값이며, 기본요금(피크) 절감과 ESS 투자비는 넣지 않았습니다.</span>
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="badge-review">{REVIEW_BADGE}</span>
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
              <span id="BDG-02" className="mt-1 inline-block badge-review">{REVIEW_BADGE}</span>
              <ul className="mt-2 space-y-1">
                {(Object.entries(s.parts) as [PartKey, number][]).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-slate-500">{PART_LABEL[k]}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200"><i className="block h-full bg-slate-700" style={{ width: `${(v / WEIGHTS[k]) * 100}%` }} /></span>
                    <span className="num w-10 text-right">{v}/{WEIGHTS[k]}</span>
                  </li>
                ))}
              </ul>
              {b.stability !== null && (
                <p className="mt-2 text-xs text-slate-600" title="가중치 4개를 각각 ±20% 범위에서 무작위로 바꿔 1,000번 다시 순위를 매겼을 때, 이 건물이 상위 10%에 든 횟수의 비율입니다">
                  순위 안정도 <span className="num font-semibold text-ink">{Math.round(b.stability * 100)}%</span>
                  <span className="text-slate-500"> · 가중치를 ±20% 바꾼 1,000회 중 상위 10%({ds.stability.topCount}동)에 든 비율</span>
                </p>
              )}
              {lines && c.pv_kw !== null && (
                <div id="GRD-01" className="mt-2 rounded bg-slate-100 px-2 py-1.5 text-xs">
                  <p className="font-medium">이 지역 배전선로 여유 (참고)</p>
                  <p className="num text-slate-700">
                    선로 {lines.length}개 · {n(Math.min(...lines.map((l) => l.margin_kw)))}~{n(Math.max(...lines.map((l) => l.margin_kw)))}kW
                    {" · "}설치 용량 {n(c.pv_kw, 1)}kW 이상 여유가 있는 선로 {lines.filter((l) => l.margin_kw >= c.pv_kw!).length}개
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    {ds.grid!.meta.source} {ds.grid!.meta.fetched} 조회 · 리 단위 자료라 이 건물이 어느 선로에 연결되는지는 한전 확인이 필요합니다. 점수에는 넣지 않았습니다.
                  </p>
                </div>
              )}
              <ul id="BDG-01" className="mt-2 flex flex-wrap gap-1">
                {b.flags.includes("USE_NULL") && <li className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">용도 미확인</li>}
                {[...s.chips, ...extraChips(b)].map((chip) => (
                  <li key={chip} className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">{chip}</li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 text-sm">
        {!excluded && c.pv_kw !== null && (
          <Link id="BTN-04" href={`/opinion/${b.bld_id}`} className="rounded-md bg-ink px-2.5 py-1 text-white">검토의견서 만들기</Link>
        )}
        {!excluded && c.pv_kw !== null && (
          <button id="BTN-03" type="button" aria-pressed={inCompare} onClick={() => !toggleCompare(b0.bld_id) && setCopied("비교는 4동까지 담을 수 있어요")} className={`rounded-md border px-2.5 py-1 ${inCompare ? "border-cell bg-cell/10 text-cell" : "border-slate-300 hover:bg-slate-100"}`}>
            {inCompare ? "비교에서 빼기" : "비교 담기"}
          </button>
        )}
        <button id="BTN-05" type="button" onClick={copyLink} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100">링크 복사</button>
        <Link id="LNK-01" href="/method#pv" className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100">계산 근거</Link>
        {copied && <span role="status" className="truncate text-xs text-slate-600">{copied}</span>}
      </footer>
    </aside>
  );
}
