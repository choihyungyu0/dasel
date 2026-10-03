// CAL-01~04·06·07 (BR-C1~C5·C7, BR-L1). 결측은 0이 아니라 null(BR-D2).
import { CONSTANTS as C } from "./constants";

export interface Assumptions {
  util: number;
  m2PerKw: number;
  essHours: number;
  packKwh: number;
  aRatio: number;
  socMax: number;
}

export const DEFAULTS: Assumptions = {
  util: C.UTIL.value,
  m2PerKw: C.M2_PER_KW.value,
  essHours: C.ESS_HOURS.value,
  packKwh: C.PACK_KWH.value,
  aRatio: C.A_RATIO.value,
  socMax: C.SOC_MAX.value,
};

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

/** 범위 밖 조건은 허용 범위로 되돌린다. 충전율 상한은 0.80~0.90만(BR-L1). */
export function normalize(a: Partial<Assumptions> = {}): Assumptions {
  const m = { ...DEFAULTS, ...a };
  return {
    util: clamp(m.util, C.UTIL.range),
    m2PerKw: clamp(m.m2PerKw, C.M2_PER_KW.range),
    essHours: clamp(m.essHours, C.ESS_HOURS.range),
    packKwh: clamp(m.packKwh, C.PACK_KWH.range),
    aRatio: clamp(m.aRatio, C.A_RATIO.range),
    socMax: clamp(m.socMax, C.SOC_MAX.range),
  };
}

export type RoofSource = "ARCH" | "GEOM";

export interface Roof {
  roof_m2: number | null;
  source: RoofSource | null;
  flags: ("AREA_GEOM" | "AREA_MISMATCH")[];
}

/** BR-C1: min(건축면적, 도형 면적). 건축면적이 없으면 도형 면적. */
export function roofArea(archArea: number | null, geomArea: number | null): Roof {
  const arch = archArea && archArea > 0 ? archArea : null;
  const geom = geomArea && geomArea > 0 ? geomArea : null;
  if (arch === null) return { roof_m2: geom, source: geom === null ? null : "GEOM", flags: geom === null ? [] : ["AREA_GEOM"] };
  if (geom === null) return { roof_m2: arch, source: "ARCH", flags: [] };
  const flags: Roof["flags"] = geom / arch < 2 / 3 ? ["AREA_MISMATCH"] : [];
  return geom < arch ? { roof_m2: geom, source: "GEOM", flags } : { roof_m2: arch, source: "ARCH", flags };
}

export interface Calc {
  roof_m2: number | null;
  pv_kw: number | null;
  pv_kwh: number | null;
  ess_kwh: number | null;
  ess_units: number | null;
  kwh_per_pack: number;
  packs: number | null;
  save_low: number | null;
  save_base: number | null;
  unit_cost: number;
  co2_t: number | null;
  /** pv_kw < 30 (BR-G2) */
  small: boolean;
}

export function kwhPerPack(a: Assumptions): number {
  const soh = C.SOH_A.value * a.aRatio + C.SOH_B.value * (1 - a.aRatio);
  return round(a.packKwh * soh * (a.socMax - C.SOC_MIN.value), 2);
}

export function calc(roofM2: number | null, unitCost: number = C.PRICE_FALLBACK.value, assumptions?: Partial<Assumptions>): Calc {
  const a = normalize(assumptions);
  const perPack = kwhPerPack(a);
  const empty = { ess_kwh: null, ess_units: null, packs: null };
  if (roofM2 === null || !(roofM2 > 0)) {
    return { roof_m2: null, pv_kw: null, pv_kwh: null, ...empty, kwh_per_pack: perPack, save_low: null, save_base: null, unit_cost: unitCost, co2_t: null, small: false };
  }
  const pv_kw = round((roofM2 * a.util) / a.m2PerKw, 1);
  const pv_kwh = Math.round(pv_kw * C.PVOUT.value);
  const small = pv_kw < C.PV_MIN_KW.value;
  const ess_kwh = small ? null : round(pv_kw * a.essHours, 1);
  return {
    roof_m2: roofM2,
    pv_kw,
    pv_kwh,
    ess_kwh,
    ess_units: ess_kwh === null ? null : Math.ceil(ess_kwh / C.ESS_UNIT_MAX.value),
    kwh_per_pack: perPack,
    packs: ess_kwh === null ? null : Math.ceil(round(ess_kwh / perPack, 6)),
    save_low: Math.round(pv_kwh * C.PRICE_LOW.value),
    save_base: Math.round(pv_kwh * unitCost),
    unit_cost: unitCost,
    co2_t: round((pv_kwh / 1000) * C.EMISSION.value, 1),
    small,
  };
}

/** 원 → 만원(반올림). 화면 표시용. */
export const toManwon = (won: number) => Math.round(won / 10000);

export interface Summary {
  buildings: number;
  mw: number;
  gwh: number;
  packs: number;
  ess_units: number;
  save_low: number;
  save_base: number;
  co2_t: number;
  /** 30kW 미만·제외 건물(합계에 넣지 않음) */
  others: number;
}

/** CAL-07: pv_kw ≥ 30인 대상 건물만 합산한다. */
export function summarize(items: { target: boolean; calc: Calc }[]): Summary {
  const s: Summary = { buildings: 0, mw: 0, gwh: 0, packs: 0, ess_units: 0, save_low: 0, save_base: 0, co2_t: 0, others: 0 };
  let kw = 0, kwh = 0, co2 = 0;
  for (const { target, calc: c } of items) {
    if (!target || c.pv_kw === null || c.small) {
      s.others += 1;
      continue;
    }
    s.buildings += 1;
    kw += c.pv_kw;
    kwh += c.pv_kwh ?? 0;
    co2 += c.co2_t ?? 0;
    s.packs += c.packs ?? 0;
    s.ess_units += c.ess_units ?? 0;
    s.save_low += c.save_low ?? 0;
    s.save_base += c.save_base ?? 0;
  }
  s.mw = round(kw / 1000, 2);
  s.gwh = round(kwh / 1e6, 2);
  s.co2_t = round(co2, 1);
  return s;
}
