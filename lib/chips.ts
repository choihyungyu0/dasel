// PNL-05 사유 칩 가운데 점수와 무관한 것(지붕 재료, 업종, 산단 규정)
import rules from "@/config/complex_rules.json";
import { CONSTANTS as C } from "./constants";
import type { Building } from "./data";

interface Rule {
  solar_biz_allowed: boolean | null;
  note?: string | null;
  source: string | null;
  checked: string | null;
}

export function complexRule(name: string): Rule {
  const r = (rules as unknown as Record<string, Rule | undefined>)[name];
  return r && typeof r === "object" ? r : { solar_biz_allowed: null, source: null, checked: null };
}

export const SOLAR_BIZ_CHECK = "판매·지붕 임대형은 입주업종 확인 필요 · 자가소비 기준으로 계산했습니다";

/** DAT-14: 판매·임대형 입주업종 확인 칩(건물 단위 판정 solar_biz 기준). 점수에는 넣지 않는다. */
export function solarBizChip(b: Building): string | null {
  if (!b.solar_biz) return null;
  return b.solar_biz === "확인됨" ? `유치업종에 발전업 포함(${b.solar_biz_src ?? "출처 확인 중"})` : SOLAR_BIZ_CHECK;
}

/** 설치 방식 비교 표의 판매·임대 행에 붙이는 짧은 문구 */
export function solarBizNote(b: Building): string | null {
  return b.solar_biz === "확인됨" ? null : "입주업종 확인 필요";
}

const LIGHT_ROOF = /경량|샌드위치|패널|판넬|슬레이트|기타지붕/;
const GMP = /의약|바이오|식품|식료|음료|건강기능/;

export function extraChips(b: Building): string[] {
  const chips: string[] = [];
  if (b.roof_type && LIGHT_ROOF.test(b.roof_type)) chips.push(`지붕 ${b.roof_type} · 하중·방수 확인 필요`);
  if (b.companies.some((c) => GMP.test(`${c.group ?? ""} ${c.product ?? ""}`))) chips.push("의약·식품 업종 · 옥상 설비·청정구역 확인 필요");
  const fit = essSpace(b);
  if (fit && fit.units < (b.calc.ess_units ?? 0)) chips.push("ESS 공간 부족 · 옥상·별동 검토");
  const biz = solarBizChip(b);
  if (biz) chips.push(biz);
  return chips;
}

/** CAL-09: 필지 공지에 ESS 단위(단위당 40㎡ 가정)를 몇 개 놓을 수 있는지. 대지면적을 모르면 null */
export function essSpace(b: Building): { open_m2: number; units: number } | null {
  if (b.lot_open_m2 === null || b.lot_open_m2 === undefined) return null;
  const open = Math.max(0, b.lot_open_m2);
  return { open_m2: open, units: Math.floor(open / C.ESS_UNIT_AREA.value) };
}
