import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarize } from "./calc";
import { enrich, type RawBuilding } from "./data";

const file = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const all = file.buildings.map((b) => enrich(b, file.meta.built.replaceAll("-", "")));
const codes = [...new Set(all.map((b) => b.complex_cd))];

describe("실데이터 합계 (MAP-06·CAL-07)", () => {
  it("산단별 합 = 전체 합", () => {
    const total = summarize(all);
    const parts = codes.map((cd) => summarize(all.filter((b) => b.complex_cd === cd)));
    for (const key of ["buildings", "packs", "ess_units", "save_low", "save_base", "others"] as const) {
      expect(parts.reduce((a, p) => a + p[key], 0)).toBe(total[key]);
    }
    console.log("banner", JSON.stringify(total));
    console.log("tiers", JSON.stringify(Object.fromEntries(["설치 우선", "검토", "보류", "제외"].map((t) => [t, all.filter((b) => b.score.tier === t).length]))));
  });
  it("모든 건물에서 점수 = 구성요소 합, 대상 아님은 점수 없음", () => {
    for (const b of all) {
      if (b.score.tier === "제외") expect(b.score.score).toBeNull();
      else expect(Object.values(b.score.parts).reduce((a, v) => a + v, 0)).toBe(b.score.score);
    }
  });
});
