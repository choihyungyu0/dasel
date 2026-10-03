// PNL-05 사유 칩 가운데 점수와 무관한 것(지붕 재료, 업종, 산단 규정)
import rules from "@/config/complex_rules.json";
import { CONSTANTS as C } from "./constants";
import type { Building } from "./data";

interface Rule {
  solar_biz_allowed: boolean | null;
  source: string | null;
  checked: string | null;
}

export function complexRule(name: string): Rule {
  const r = (rules as unknown as Record<string, Rule | undefined>)[name];
  return r && typeof r === "object" ? r : { solar_biz_allowed: null, source: null, checked: null };
}

/** DAT-14: 태양광 발전사업(판매·임대) 허용 여부 문구 */
export function solarBizChip(name: string): string | null {
  const allowed = complexRule(name).solar_biz_allowed;
  if (allowed === true) return null;
  return allowed === false ? "자가소비만 가능(판매·임대 사업은 관리기본계획 변경 필요)" : "판매·임대 사업 허용 여부 확인 필요(산단 관리기본계획)";
}

const LIGHT_ROOF = /경량|샌드위치|패널|판넬|슬레이트|기타지붕/;
const GMP = /의약|바이오|식품|식료|음료|건강기능/;

export function extraChips(b: Building): string[] {
  const chips: string[] = [];
  if (b.roof_type && LIGHT_ROOF.test(b.roof_type)) chips.push(`지붕 ${b.roof_type} — 하중·방수 확인 필요`);
  if (b.companies.some((c) => GMP.test(`${c.group ?? ""} ${c.product ?? ""}`))) chips.push("의약·식품 업종 — 옥상 설비·청정구역 확인 필요");
  const fit = essSpace(b);
  if (fit && fit.units < (b.calc.ess_units ?? 0)) chips.push("ESS 공간 부족 — 옥상·별동 검토");
  const biz = solarBizChip(b.complex_nm);
  if (biz) chips.push(biz);
  return chips;
}

/** CAL-09: 필지 공지에 ESS 단위(단위당 40㎡ 가정)를 몇 개 놓을 수 있는지. 대지면적을 모르면 null */
export function essSpace(b: Building): { open_m2: number; units: number } | null {
  if (b.lot_open_m2 === null || b.lot_open_m2 === undefined) return null;
  const open = Math.max(0, b.lot_open_m2);
  return { open_m2: open, units: Math.floor(open / C.ESS_UNIT_AREA.value) };
}
