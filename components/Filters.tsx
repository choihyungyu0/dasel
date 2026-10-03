"use client";

import { DEFAULT_FILTERS, ESS_OPTIONS, GATE_OPTIONS, INDUSTRY_OPTIONS, isDefault, KW_OPTIONS, STRUCT_OPTIONS, TIER_OPTIONS, type Filters as F } from "@/lib/filters";
import { useStore } from "./Store";

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="w-10 text-[11px] text-slate-500">{label}</span>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-ink bg-ink text-white" : "border-slate-300 bg-white hover:bg-slate-100"}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Steps({ label, unit, options, value, onChange }: { label: string; unit: string; options: number[]; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-10 text-[11px] text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1 py-0.5">
        {options.map((o) => (
          <option key={o} value={o}>{o === 0 ? "전체" : `${o.toLocaleString("ko-KR")}${unit} 이상`}</option>
        ))}
      </select>
    </label>
  );
}

/** FLT-01(지도)·FLT-02(목록) 공용. 상태는 Store에 있어 두 화면이 같은 조건을 본다. */
export default function Filters({ id, tour }: { id: string; tour: string }) {
  const { filters: f, setFilters, filtered } = useStore();
  const set = (patch: Partial<F>) => setFilters({ ...f, ...patch });
  return (
    <div id={id} data-tour={tour} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="num rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-white">{filtered.length.toLocaleString("ko-KR")}동</span>
        {!isDefault(f) && (
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs text-slate-600 underline">필터 해제</button>
        )}
      </div>
      <Chips label="단계" options={TIER_OPTIONS} value={f.tiers} onChange={(tiers) => set({ tiers })} />
      <Chips label="게이트" options={GATE_OPTIONS} value={f.gates} onChange={(gates) => set({ gates })} />
      <Chips label="업종" options={INDUSTRY_OPTIONS} value={f.industries} onChange={(industries) => set({ industries })} />
      <Chips label="구조" options={STRUCT_OPTIONS} value={f.structs} onChange={(structs) => set({ structs })} />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Steps label="용량" unit="kW" options={KW_OPTIONS} value={f.minKw} onChange={(minKw) => set({ minKw })} />
        <Steps label="ESS" unit="kWh" options={ESS_OPTIONS} value={f.minEss} onChange={(minEss) => set({ minEss })} />
      </div>
    </div>
  );
}
