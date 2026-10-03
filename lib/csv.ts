// OUT-01 후보 목록 CSV(UTF-8 BOM, 열 18개). 대표자·전화 등 개인정보 열은 없다.
import type { Building } from "./data";
import type { Price } from "./price";

export const CSV_HEADER = ["순위", "회사", "산단", "주소", "설치용량(kW)", "연발전량(kWh)", "ESS(kWh)", "재사용팩(개)", "분산단위(개)", "절감하한(원)", "절감기준(원)", "단가조회월", "감축(tCO2)", "게이트", "사유", "점수", "단계", "출처"];

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(rows: Building[], price: Price, source: string): string {
  const lines = rows.map((b, i) => [
    i + 1, b.companies.map((c) => c.company).join(" / "), b.complex_nm, b.addr, b.calc.pv_kw, b.calc.pv_kwh, b.calc.ess_kwh, b.calc.packs, b.calc.ess_units,
    b.calc.save_low, b.calc.save_base, `${price.month}${price.fallback ? "(기준값)" : ""}`, b.calc.co2_t, b.score.gate, b.score.chips.join("; "),
    b.score.score === null ? "" : `${b.score.score}/${b.score.max}`, b.score.tier, source,
  ].map(cell).join(","));
  return "﻿" + [CSV_HEADER.join(","), ...lines].join("\r\n");
}
