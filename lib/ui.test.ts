import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CSV_HEADER, toCsv } from "./csv";
import { enrich, type RawBuilding } from "./data";
import { DEFAULT_FILTERS, passes } from "./filters";
import { FALLBACK_PRICE } from "./price";
import { buildIndex, chosung, search } from "./search";

const file = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const all = file.buildings.map((b) => enrich(b, file.meta.built.replaceAll("-", "")));

describe("MAP-04 필터", () => {
  it("기본 필터 = 대상 건물 전체, 일반 건물은 제외", () => {
    const n = all.filter((b) => passes(b, DEFAULT_FILTERS, null)).length;
    expect(n).toBe(all.filter((b) => b.target).length);
  });
  it("게이트 통과 · ESS 500kWh 이상 (SC-03)", () => {
    const hit = all.filter((b) => passes(b, { ...DEFAULT_FILTERS, gates: ["통과"], minEss: 500 }, null));
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((b) => b.score.gate === "통과" && b.calc.ess_kwh! >= 500)).toBe(true);
  });
  it("산단 합 = 전체", () => {
    const codes = [...new Set(all.map((b) => b.complex_cd))];
    const sum = codes.reduce((a, cd) => a + all.filter((b) => passes(b, DEFAULT_FILTERS, cd)).length, 0);
    expect(sum).toBe(all.filter((b) => passes(b, DEFAULT_FILTERS, null)).length);
  });
});

describe("MAP-05 검색", () => {
  const index = buildIndex([
    { title: "(주)에코프로비엠", sub: "오창과학 · 양청리", extra: "2차전지용양극활물질", bldId: 1, kind: "회사" },
    { title: "(주)유한양행", sub: "오창과학 · 양청리 807-1", extra: "의약품", bldId: 2, kind: "회사" },
    { title: "미연결공장", sub: "산단 외", bldId: null, kind: "회사" },
  ]);
  it("회사명 부분일치·초성·생산품·주소", () => {
    expect(search(index, "에코").hits[0].bldId).toBe(1);
    expect(chosung("유한양행")).toBe("ㅇㅎㅇㅎ");
    expect(search(index, "ㅇㅎㅇㅎ").hits[0].bldId).toBe(2);
    expect(search(index, "양극").hits[0].bldId).toBe(1);
    expect(search(index, "807-1").hits[0].bldId).toBe(2);
  });
  it("일치 없으면 유사 후보 최대 3개, 공백은 결과 없음", () => {
    const r = search(index, "유한양회");
    expect(r.hits).toEqual([]);
    expect(r.similar[0].bldId).toBe(2);
    expect(search(index, "   ")).toEqual({ hits: [], similar: [] });
  });
});

describe("OUT-01 CSV", () => {
  const rows = all.filter((b) => b.score.tier === "설치 우선");
  const csv = toCsv(rows, FALLBACK_PRICE, "출처");
  it("UTF-8 BOM, 열 18개, 행 수 = 목록 수", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(CSV_HEADER.length).toBe(18);
    expect(csv.split("\r\n").length).toBe(rows.length + 1);
  });
  it("개인정보 열 없음", () => expect(CSV_HEADER.join()).not.toMatch(/대표|전화|연락처/));
});
