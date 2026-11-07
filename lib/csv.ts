// OUT-01 후보 목록 CSV(UTF-8 BOM, 열 23개). 순위는 이미 설치됨·제외를 뺀 건물에만 매긴다. 대표자·전화 등 개인정보 열은 없다.
import type { Building } from "./data";
import type { Price } from "./price";
import { INSTALLED_RANK, rankMap } from "./rank";

export const CSV_HEADER = ["순위", "이미 설치됨(AI 판독)", "회사", "산단", "주소", "설치용량(kW)", "연발전량(kWh)", "ESS(kWh)", "재사용팩(개)", "분산단위(개)", "절감하한(원)", "절감기준(원)", "단가조회월", "감축(tCO2)", "게이트", "사유", "점수", "단계", "복수 입주", "내진설계", "토지 소유 구분", "최근 5년 증축·대수선 허가", "출처"];

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(rows: Building[], price: Price, source: string): string {
  const rank = rankMap(rows);
  const lines = rows.map((b) => [
    rank.get(b.bld_id) ?? (b.score.tier === "이미 설치됨" ? INSTALLED_RANK : ""), b.score.tier === "이미 설치됨" ? "예" : "아니오", b.companies.map((c) => c.company).join(" / "), b.complex_nm, b.addr, b.calc.pv_kw, b.calc.pv_kwh, b.calc.ess_kwh, b.calc.packs, b.calc.ess_units,
    b.calc.save_low, b.calc.save_base, `${price.month}${price.fallback ? "(기준값)" : ""}`, b.calc.co2_t, b.score.gate, b.score.chips.join("; "),
    b.score.score === null ? "" : `${b.score.score}/${b.score.max}`, b.score.tier,
    b.extra ? (b.extra.multi ? "예" : "아니오") : "정보 없음", b.extra?.seismic ?? "정보 없음", b.extra?.land ?? "정보 없음", b.extra?.permit_years ? (b.extra.permit_years.join("·") || "없음") : "정보 없음", source,
  ].map(cell).join(","));
  return "﻿" + [CSV_HEADER.join(","), ...lines].join("\r\n");
}
