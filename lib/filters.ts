// MAP-04 필터. 지도와 후보 목록이 같은 상태를 쓴다.
import type { Building } from "./data";
import type { Gate, Industry, Tier } from "./score";
import { structPoints } from "./score";

export type StructClass = "콘크리트" | "철골" | "기타" | "정보 없음";
export type IndustryClass = "다소비 업종" | "그 밖의 제조" | "미연결";

export interface Filters {
  tiers: Tier[];
  gates: Gate[];
  minKw: number;
  minEss: number;
  industries: IndustryClass[];
  structs: StructClass[];
}

export const DEFAULT_FILTERS: Filters = { tiers: [], gates: [], minKw: 0, minEss: 0, industries: [], structs: [] };
export const TIER_OPTIONS: Tier[] = ["설치 우선", "검토", "보류", "이미 설치됨"];
export const GATE_OPTIONS: Gate[] = ["통과", "조건부"];
export const KW_OPTIONS = [0, 30, 100, 200, 500];
export const ESS_OPTIONS = [0, 100, 500, 1000];
export const INDUSTRY_OPTIONS: IndustryClass[] = ["다소비 업종", "그 밖의 제조", "미연결"];
export const STRUCT_OPTIONS: StructClass[] = ["콘크리트", "철골", "기타", "정보 없음"];

export const structClass = (struct: string | null): StructClass => {
  const p = structPoints(struct);
  return p === 20 ? "콘크리트" : p === 12 ? "철골" : p === 5 ? "기타" : "정보 없음";
};
export const industryClass = (i: Industry): IndustryClass => (i === "HIGH" ? "다소비 업종" : i === "MFG" ? "그 밖의 제조" : "미연결");

export const isDefault = (f: Filters) => JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);

/** 대상 건물이 필터를 통과하는지. 빈 선택은 '전체'로 본다. */
export function passes(b: Building, f: Filters, complexCd: string | null): boolean {
  if (b.score.tier === "제외") return false;
  if (complexCd && b.complex_cd !== complexCd) return false;
  if (f.tiers.length && !f.tiers.includes(b.score.tier)) return false;
  if (f.gates.length && !f.gates.includes(b.score.gate)) return false;
  if (f.minKw > 0 && (b.calc.pv_kw ?? 0) < f.minKw) return false;
  if (f.minEss > 0 && (b.calc.ess_kwh ?? 0) < f.minEss) return false;
  if (f.industries.length && !f.industries.includes(industryClass(b.industry))) return false;
  if (f.structs.length && !f.structs.includes(structClass(b.struct))) return false;
  return true;
}
