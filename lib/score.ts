// AI-01 설치 적합도(BR-S1~S8), 안전 게이트(BR-G1~G4), AI-04 근거 문장.
import { HAZMAT_CHIP_P0 } from "./constants";
import type { Calc } from "./calc";

export type Tier = "설치 우선" | "검토" | "보류" | "제외";
export type Gate = "통과" | "조건부" | "제외";
/** BR-S4 판정 결과: 다소비 업종 / 그 밖의 제조업 / 미매칭 */
export type Industry = "HIGH" | "MFG" | null;
export type PartKey = "scale" | "struct" | "age" | "industry" | "hazmat" | "grid";

export const WEIGHTS: Record<PartKey, number> = { scale: 30, struct: 20, age: 15, industry: 15, hazmat: 10, grid: 10 };

/** 전 건물에 데이터가 없는 항목은 만점에서 뺀다(BR-S8). 현재: 위험물 미반영, 배전 여유 반영 → 90점. */
export interface Availability {
  hazmat: boolean;
  grid: boolean;
}
export const P0_AVAILABILITY: Availability = { hazmat: false, grid: true };

export const maxAvailable = (av: Availability = P0_AVAILABILITY) =>
  100 - (av.hazmat ? 0 : WEIGHTS.hazmat) - (av.grid ? 0 : WEIGHTS.grid);

export interface ScoreInput {
  target: boolean;
  calc: Calc;
  struct: string | null;
  /** 사용승인일 YYYYMMDD */
  aprYmd: string | null;
  industry: Industry;
  distHazmatM?: number | null;
  /** 그 리(里) 배전선로 여유의 최솟값·최댓값(kW). 어느 선로에 물릴지 몰라 둘 다 본다 */
  gridMinKw?: number | null;
  gridMaxKw?: number | null;
}

export interface Score {
  score: number | null;
  max: number;
  parts: Partial<Record<PartKey, number>>;
  tier: Tier;
  gate: Gate;
  chips: string[];
  flags: string[];
  ageYears: number | null;
}

const STEEL = /철골|강파이프|강구조/;

export function structPoints(struct: string | null): number {
  if (!struct) return 0;
  if (/철근콘크리트|철골콘크리트|프리[케캐]스트콘크리트/.test(struct)) return 20;
  if (STEEL.test(struct)) return 12;
  return 5;
}

/** 기준일까지 만 연수. 형식이 맞지 않으면 null. */
export function ageYears(aprYmd: string | null, baseYmd: string): number | null {
  if (!aprYmd || !/^\d{8}$/.test(aprYmd)) return null;
  const years = Number(baseYmd.slice(0, 4)) - Number(aprYmd.slice(0, 4)) - (baseYmd.slice(4) < aprYmd.slice(4) ? 1 : 0);
  return years < 0 ? null : years;
}

const scalePoints = (kw: number | null) => (kw === null || kw < 30 ? 0 : kw < 100 ? 8 : kw < 200 ? 15 : kw < 500 ? 22 : 30);
const agePoints = (y: number | null) => (y === null || y >= 30 ? 0 : y < 10 ? 15 : y < 20 ? 12 : 6);
const industryPoints = (i: Industry) => (i === "HIGH" ? 15 : i === "MFG" ? 8 : 0);
const hazmatPoints = (m: number | null) => (m === null || m < 50 ? 0 : m < 100 ? 5 : 10);
/** 보수적으로: 모든 선로에 여유가 있으면 10, 여유 있는 선로가 하나라도 있으면 5, 없으면 0 */
const gridPoints = (min: number | null, max: number | null, kw: number | null) =>
  max === null || kw === null || max <= 0 || max < kw ? 0 : (min ?? 0) >= kw ? 10 : 5;

export function score(input: ScoreInput, baseYmd: string, av: Availability = P0_AVAILABILITY): Score {
  const max = maxAvailable(av);
  const years = ageYears(input.aprYmd, baseYmd);
  const flags: string[] = [];
  const chips: string[] = [];

  if (!input.target) {
    return { score: null, max, parts: {}, tier: "제외", gate: "제외", chips: [], flags, ageYears: years };
  }

  let conditional = false;
  if (!input.struct) {
    flags.push("STRUCT_NULL");
    chips.push("구조 정보 없음 — 구조검토 필수");
    conditional = true;
  }
  if (years !== null && years >= 30) {
    flags.push("OLD30");
    chips.push(`사용승인 ${years}년 — 구조검토 필수`);
    conditional = true;
  }
  if (input.struct && structPoints(input.struct) === 12) chips.push("경량 지붕 하중 확인 필요");
  if (av.hazmat) {
    const d = input.distHazmatM ?? null;
    if (d === null) {
      flags.push("HAZ_NULL");
      chips.push("위험물 거리 확인 필요");
      conditional = true;
    } else if (d < 50) {
      chips.push(`위험물시설 ${Math.round(d)}m — ESS 별도 동·옥외 설치 검토`);
      conditional = true;
    }
  } else {
    chips.push(HAZMAT_CHIP_P0);
  }
  const gate: Gate = conditional ? "조건부" : "통과";

  const kw = input.calc.pv_kw;
  const parts: Partial<Record<PartKey, number>> = {
    scale: scalePoints(kw),
    struct: structPoints(input.struct),
    age: agePoints(years),
    industry: industryPoints(input.industry),
  };
  if (av.hazmat) parts.hazmat = hazmatPoints(input.distHazmatM ?? null);
  if (av.grid) {
    parts.grid = gridPoints(input.gridMinKw ?? null, input.gridMaxKw ?? null, kw);
    if ((input.gridMaxKw ?? null) === null) flags.push("GRID_NULL");
  }
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const ratio = total / max;

  let tier: Tier;
  if (kw === null || input.calc.small) tier = "보류";
  else if (ratio < 0.5) tier = "보류";
  else if (ratio >= 0.7 && gate === "통과") tier = "설치 우선";
  else tier = "검토";

  return { score: total, max, parts, tier, gate, chips, flags, ageYears: years };
}

const n = (v: number) => v.toLocaleString("ko-KR");

/** AI-04: 점수 구성요소로 만드는 결론 문장. 결측 항목은 문장에서 뺀다. */
export function summarySentence(input: ScoreInput, s: Score): string {
  const c = input.calc;
  if (s.tier === "제외") return "산업용 대상 건물이 아니에요.";
  if (c.pv_kw === null) return "면적 정보가 없어 계산하지 않았어요.";
  const basis = [
    `지붕면적 ${n(Math.round(c.roof_m2 ?? 0))}㎡`,
    input.struct,
    s.ageYears === null ? null : `사용승인 ${s.ageYears}년`,
  ].filter(Boolean);
  const result = [`${n(c.pv_kw)}kW`, c.packs === null ? "소규모 — ESS 산정 안 함" : `재사용 팩 ${n(c.packs)}개`, s.tier];
  return `${basis.join("·")} → ${result.join(", ")}`;
}
