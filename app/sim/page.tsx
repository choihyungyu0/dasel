"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useStore } from "@/components/Store";
import { summarize, toManwon, type Summary } from "@/lib/calc";
import { BATTERY_OUTLOOK, CONSTANTS as C, REVIEW_BADGE, SUBSIDY_BADGE } from "@/lib/constants";
import { enrich, type Dataset } from "@/lib/data";
import { startMiniTour } from "@/lib/tour";
import { decodeScenario, defaultScenario, encodeScenario, PRICE_RANGE, type Scenario } from "@/lib/url";

const n = (v: number, d = 0) => v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const eok = (won: number) => n(toManwon(won) / 10000, 1);

function byComplex(ds: Dataset, s: Scenario): { cd: string; name: string; sum: Summary }[] {
  const baseYmd = ds.meta.built.replaceAll("-", "");
  const all = ds.buildings.map((b) => enrich(b, baseYmd, s.price, s));
  const open = ds.complexes.filter((c) => c.status === "운영");
  return [
    ...open.map((c) => ({ cd: c.complex_cd, name: c.complex_nm, sum: summarize(all.filter((b) => b.complex_cd === c.complex_cd)) })),
    { cd: "all", name: "합계", sum: summarize(all.filter((b) => open.some((c) => c.complex_cd === b.complex_cd))) },
  ];
}

function Delta({ now, base, digits = 0 }: { now: number; base: number; digits?: number }) {
  const d = now - base;
  if (Math.abs(d) < 10 ** -digits / 2) return null;
  return <span className={`num ml-1 text-[11px] ${d > 0 ? "text-emerald-700" : "text-rose-700"}`}>{d > 0 ? "+" : "−"}{n(Math.abs(d), digits)}</span>;
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  note: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

function Slider({ id, label, value, min, max, step, show, note, disabled, onChange }: SliderProps) {
  return (
    <label className="block" title={note}>
      <span className="flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="num font-semibold">{show}</span>
      </span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink disabled:opacity-40" />
      <span className="flex justify-between text-[10px] text-slate-400"><span>{min}</span><span>{note}</span><span>{max}</span></span>
    </label>
  );
}

export default function SimPage() {
  const { status, reload, base, price } = useStore();
  const [s, setS] = useState<Scenario | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [withSub, setWithSub] = useState(false);

  // URL의 s= 조건을 한 번 읽는다(단가는 조회가 끝난 값 기준)
  useEffect(() => {
    if (s || price.loading) return;
    const r = decodeScenario(new URLSearchParams(location.search).get("s"), price.unitCost);
    setS(r.scenario);
    if (r.adjusted) setNote("조건 일부를 기본값으로 바꿨어요");
  }, [s, price]);

  const defaults = useMemo(() => defaultScenario(price.unitCost), [price.unitCost]);
  const code = s ? encodeScenario(s) : "";
  useEffect(() => {
    if (!s) return;
    history.replaceState(null, "", code === encodeScenario(defaults) ? "/sim" : `/sim?s=${code}`);
  }, [s, code, defaults]);

  const rows = useMemo(() => (base && s ? byComplex(base, s) : null), [base, s]);
  const shown = rows !== null;
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => void startMiniTour("sim"), 600);
    return () => clearTimeout(t);
  }, [shown]);
  const baseRows = useMemo(() => (base ? byComplex(base, defaults) : null), [base, defaults]);
  const set = (patch: Partial<Scenario>) => s && setS({ ...s, ...patch });
  const mode = !s ? "기준" : s.price === C.PRICE_LOW.value ? "하한" : s.price === price.unitCost ? "기준" : "직접";

  const copy = async () => {
    const url = `${location.origin}/sim?s=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote("조건 링크를 복사했어요");
    } catch {
      setNote(url);
    }
  };

  const maxMw = Math.max(1, ...(rows ?? []).filter((r) => r.cd !== "all").map((r) => r.sum.mw));
  const maxPacks = Math.max(1, ...(rows ?? []).filter((r) => r.cd !== "all").map((r) => r.sum.packs));

  return (
    <main className="flex min-h-dvh flex-col gap-2 p-2 md:p-3">
      <AppHeader complexSelect={false} />
      {status === "loading" && <p className="rounded-xl bg-white p-6 text-sm text-slate-500">공장 건물 불러오는 중</p>}
      {status === "error" && <p className="rounded-xl bg-white p-6 text-sm">건물 데이터를 불러오지 못했어요 <button type="button" onClick={reload} className="ml-1 underline">다시 시도</button></p>}
      {s && rows && baseRows && (
        <div className="grid gap-2 md:grid-cols-[340px_minmax(0,1fr)]">
          <section className="surface bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">조건</h2>
            <div data-tour="sim-sliders" className="space-y-3">
              <Slider id="SLD-01" label="지붕 이용률" value={Math.round(s.util * 100)} min={30} max={70} step={5} show={`${Math.round(s.util * 100)}%`} note={C.UTIL.source} onChange={(v) => set({ util: v / 100 })} />
              <Slider id="SLD-02" label="kW당 설치 면적" value={s.m2PerKw} min={7} max={12} step={0.5} show={`${s.m2PerKw}㎡`} note={C.M2_PER_KW.source} onChange={(v) => set({ m2PerKw: v })} />
              <div>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span>기준 단가</span>
                  <span className="num font-semibold">{s.price}원/kWh</span>
                </div>
                <div role="group" aria-label="단가 기준" className="mb-1 flex gap-1 text-xs">
                  {([["하한", C.PRICE_LOW.value], ["기준", price.unitCost], ["직접", mode === "직접" ? s.price : 200]] as const).map(([m, v]) => (
                    <button key={m} type="button" aria-pressed={mode === m} onClick={() => set({ price: v })} className={`rounded-md border px-2 py-0.5 ${mode === m ? "border-ink bg-ink text-white" : "border-slate-300 hover:bg-slate-100"}`}>{m}</button>
                  ))}
                </div>
                <Slider id="SLD-03" label="직접 입력" value={s.price} min={PRICE_RANGE[0]} max={PRICE_RANGE[1]} step={1} show="" note={`기준 ${price.unitCost}원(${price.month}${price.fallback ? ", 기준값" : ", 한전"})`} disabled={mode !== "직접"} onChange={(v) => set({ price: v })} />
              </div>
              <Slider id="SLD-04" label="ESS 저장 시간" value={s.essHours} min={1} max={4} step={0.5} show={`${s.essHours}시간`} note={C.ESS_HOURS.source} onChange={(v) => set({ essHours: v })} />
              <Slider id="SLD-05" label="재사용 팩 정격" value={s.packKwh} min={40} max={80} step={5} show={`${s.packKwh}kWh`} note={C.PACK_KWH.source} onChange={(v) => set({ packKwh: v })} />
              <Slider id="SLD-06" label="A등급(잔존 80%) 비율" value={Math.round(s.aRatio * 100)} min={0} max={100} step={5} show={`${Math.round(s.aRatio * 100)}%`} note={C.SOH_A.source} onChange={(v) => set({ aRatio: v / 100 })} />
              <div>
                <div role="group" aria-label="ESS 설치 위치" className="mb-1 flex items-center gap-1 text-xs">
                  <span className="mr-1 text-[13px]">ESS 설치 위치</span>
                  {([["옥외", 0], ["옥내", 1]] as const).map(([label, v]) => (
                    <button key={label} type="button" aria-pressed={s.indoor === v} onClick={() => set({ indoor: v, socMax: v ? Math.min(s.socMax, C.SOC_MAX_INDOOR.value) : s.socMax })} className={`rounded-md border px-2 py-0.5 ${s.indoor === v ? "border-ink bg-ink text-white" : "border-slate-300 hover:bg-slate-100"}`}>{label}</button>
                  ))}
                </div>
                <Slider id="SLD-07" label="충전율 상한" value={Math.round(s.socMax * 100)} min={80} max={s.indoor ? 80 : 90} step={1} show={`${Math.round(s.socMax * 100)}%`} note={s.indoor ? "옥내는 80%까지" : "옥외는 90%까지"} disabled={s.indoor === 1} onChange={(v) => set({ socMax: v / 100 })} />
              </div>
              <Slider id="SLD-08" label="건물당 재사용 ESS 단위" value={s.essUnits} min={C.ESS_UNITS.range[0]} max={C.ESS_UNITS.range[1]} step={1} show={`${s.essUnits}단위`} note="단위당 1MWh 이하" onChange={(v) => set({ essUnits: v })} />
            </div>
            <div id="BTN-06" data-tour="sim-reset" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <button type="button" onClick={() => { setS(defaults); setNote(null); }} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100">기본값으로</button>
              <button type="button" onClick={copy} className="rounded-md bg-ink px-2.5 py-1 text-white">조건 링크 복사</button>
            </div>
            {note && <p role="status" className="mt-2 break-all text-xs text-slate-600">{note}</p>}
          </section>

          <section className="space-y-2">
            <div className="overflow-x-auto surface bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">산단별 결과</h2>
                <span className="badge-review">{REVIEW_BADGE}</span>
                <span className="text-[11px] text-slate-500">작은 숫자는 기본 조건 대비 증감 · 30kW 이상 대상 건물만 합산(이미 설치된 건물 제외) · 투자비는 태양광만(참고값)</span>
                <label id="SUB-02" className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={withSub} onChange={(e) => setWithSub(e.target.checked)} />
                  보조금 반영(2026 단가 기준)
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-900">{SUBSIDY_BADGE}</span>
                </label>
              </div>
              {withSub && <p className="mb-2 text-[11px] text-slate-500">투자비는 지원액을 뺀 순투자입니다. 전 용량에 kW당 {n(C.SUBSIDY_LOW.value)}원을 적용했고, 괄호는 구간 단가(200kW 이하 건물에 {n(C.SUBSIDY_HIGH.value)}원) 적용 시 회수기간입니다. 건물당 {n(C.SUBSIDY_CAP_KW.value)}kW 초과분은 지원 0. {C.SUBSIDY_LOW.source}.</p>}
              <table id="TBL-01" data-tour="sim-result" className="w-full min-w-[860px] border-collapse text-[13px]">
                <thead className="text-left text-xs text-slate-500">
                  <tr>{["산단", "동", "MW", "GWh", "재사용 팩", "분산 단위", "연 절감(억 원)", "투자비(억 원)", "회수(년)", "tCO2"].map((h, i) => <th key={h} scope="col" className={`px-2 py-1 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const b = baseRows[i].sum;
                    return (
                      <tr key={r.cd} className={`border-t border-slate-100 ${r.cd === "all" ? "font-semibold" : ""}`}>
                        <th scope="row" className="px-2 py-1.5 text-left font-medium">{r.name}</th>
                        <td className="num px-2 py-1.5 text-right">{n(r.sum.buildings)}<Delta now={r.sum.buildings} base={b.buildings} /></td>
                        <td className="num px-2 py-1.5 text-right">{n(r.sum.mw, 1)}<Delta now={r.sum.mw} base={b.mw} digits={1} /></td>
                        <td className="num px-2 py-1.5 text-right">{n(r.sum.gwh, 1)}<Delta now={r.sum.gwh} base={b.gwh} digits={1} /></td>
                        <td className="num px-2 py-1.5 text-right">{n(r.sum.packs)}<Delta now={r.sum.packs} base={b.packs} /></td>
                        <td className="num px-2 py-1.5 text-right">{n(r.sum.ess_units)}<Delta now={r.sum.ess_units} base={b.ess_units} /></td>
                        <td className="num px-2 py-1.5 text-right">{eok(r.sum.save_low)}~{eok(r.sum.save_base)}</td>
                        <td className="num px-2 py-1.5 text-right">{n((r.sum.capex - (withSub ? r.sum.subsidy_flat : 0)) / 1e8)}</td>
                        <td className="num px-2 py-1.5 text-right">
                          {r.sum.save_base > 0 ? `${n((r.sum.capex - (withSub ? r.sum.subsidy_flat : 0)) / r.sum.save_base, 1)}~${n((r.sum.capex - (withSub ? r.sum.subsidy_flat : 0)) / r.sum.save_low, 1)}` : "–"}
                          {withSub && r.sum.save_base > 0 && <span className="block text-[10px] font-normal text-slate-500">({n((r.sum.capex - r.sum.subsidy_tiered) / r.sum.save_base, 1)}~{n((r.sum.capex - r.sum.subsidy_tiered) / r.sum.save_low, 1)})</span>}
                        </td>
                        <td className="num px-2 py-1.5 text-right">{n(r.sum.co2_t)}<Delta now={r.sum.co2_t} base={b.co2_t} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div id="CHT-01" className="surface bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold">산단별 설치용량·재사용 팩</h2>
              <ul className="space-y-2">
                {rows.filter((r) => r.cd !== "all").map((r) => (
                  <li key={r.cd} className="grid grid-cols-[72px_1fr] items-center gap-2 text-xs">
                    <span>{r.name}</span>
                    <span className="space-y-1">
                      <span className="flex items-center gap-2"><i className="block h-3 rounded-sm bg-tier-go" style={{ width: `${(r.sum.mw / maxMw) * 85}%`, minWidth: 2 }} /><span className="num">{n(r.sum.mw, 1)}MW</span></span>
                      <span className="flex items-center gap-2"><i className="block h-3 rounded-sm bg-[#3d83cc]" style={{ width: `${(r.sum.packs / maxPacks) * 85}%`, minWidth: 2 }} /><span className="num">{n(r.sum.packs)}팩</span></span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-slate-500">
                팩당 사용 가능 용량 = 정격 × (A비율×{C.SOH_A.value} + B비율×{C.SOH_B.value}) × (충전율 상한 − {C.SOC_MIN.value}) · 배출계수 {C.EMISSION.value}tCO2/MWh({C.EMISSION.source}) · 발전량 {n(C.PVOUT.value)}kWh/kWp({C.PVOUT.source}) · {base!.meta.source} {base!.meta.base_date}
              </p>
            </div>

            <div id="CHT-02" className="surface bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold">재사용 팩 수요와 충북 사용후 배터리 발생 전망 <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-normal">추정</span></h2>
              {(() => {
                const need = rows[rows.length - 1].sum.packs;
                const supply = Math.round(BATTERY_OUTLOOK.nationwide2030 * BATTERY_OUTLOOK.chungbukShare);
                const max = Math.max(need, supply, 1);
                return (
                  <>
                    <ul className="space-y-2 text-xs">
                      <li className="grid grid-cols-[150px_1fr] items-center gap-2"><span>오창 산단 필요 팩</span><span className="flex items-center gap-2"><i className="block h-3 rounded-sm bg-[#3d83cc]" style={{ width: `${(need / max) * 80}%`, minWidth: 2 }} /><span className="num">{n(need)}개</span></span></li>
                      <li className="grid grid-cols-[150px_1fr] items-center gap-2"><span>충북 2030년 발생 전망</span><span className="flex items-center gap-2"><i className="block h-3 rounded-sm bg-slate-400" style={{ width: `${(supply / max) * 80}%`, minWidth: 2 }} /><span className="num">{n(supply)}개</span></span></li>
                    </ul>
                    <p className="mt-3 text-[11px] text-slate-500">
                      충북 전망 = 전국 2030년 {n(BATTERY_OUTLOOK.nationwide2030)}개 × 충북 전기차 등록 비중 {(BATTERY_OUTLOOK.chungbukShare * 100).toFixed(2)}%. {BATTERY_OUTLOOK.nationwideSource} · {BATTERY_OUTLOOK.chungbukSource}. 발생한 배터리가 모두 재사용 등급을 받는 것은 아닙니다.
                    </p>
                  </>
                );
              })()}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
