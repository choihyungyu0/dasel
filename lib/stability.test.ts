import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enrich, withStability, type RawBuilding } from "./data";
import { rankStability } from "./stability";

const file = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const make = () => file.buildings.map((b) => enrich(b, file.meta.built.replaceAll("-", "")));

describe("AI-01 순위 안정도", () => {
  const all = make();
  const st = withStability(all);
  it("후보는 30kW 이상 대상 건물, 상위 10%는 올림", () => {
    expect(st.population).toBe(all.filter((b) => b.target && b.calc.pv_kw !== null && !b.calc.small).length);
    expect(st.topCount).toBe(Math.ceil(st.population * 0.1));
  });
  it("비율은 0~1, 후보가 아니면 null", () => {
    for (const b of all) {
      if (b.stability === null) expect(b.score.tier === "제외" || b.calc.small || b.calc.pv_kw === null).toBe(true);
      else expect(b.stability >= 0 && b.stability <= 1).toBe(true);
    }
  });
  it("매 회 상위 동 수는 같으므로 비율의 합 = 상위 동 수", () => {
    const sum = all.reduce((a, b) => a + (b.stability ?? 0), 0);
    expect(Math.round(sum * 1000) / 1000).toBe(st.topCount);
  });
  it("씨앗이 같으면 결과가 같다", () => {
    const again = withStability(make());
    expect([again.topMean, again.topStable]).toEqual([st.topMean, st.topStable]);
  });
  it("모든 항목 만점인 건물은 항상 상위", () => {
    const full = { score: 80, max: 80, parts: { scale: 30, struct: 20, age: 15, industry: 15 }, tier: "설치 우선" as const, gate: "통과" as const, chips: [], flags: [], ageYears: 5 };
    const weak = { ...full, score: 13, parts: { scale: 8, struct: 5, age: 0, industry: 0 } };
    const r = rankStability([{ id: 1, score: full, tie: 500 }, ...Array.from({ length: 19 }, (_, i) => ({ id: i + 2, score: weak, tie: 40 }))]);
    expect(r.byId.get(1)).toBe(1);
    expect(r.topCount).toBe(2);
  });
  console.log("stability", JSON.stringify({ population: st.population, top: st.topCount, mean: +(st.topMean * 100).toFixed(1), stable90: st.topStable }));
});
