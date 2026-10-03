import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enrich, type RawBuilding } from "./data";
import { buildFacts, numbersIn, templateOpinion, verify } from "./opinion";

const file = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const all = file.buildings.map((b) => enrich(b, file.meta.built.replaceAll("-", "")));
const price = { unitCost: 192, month: "2026.06", fallback: true };
const SRC = ["국토교통부 GIS건물통합정보(15083092) 20260909"];
const top = all.filter((b) => b.score.tier === "설치 우선").sort((a, b) => b.score.score! - a.score.score!)[0];
const facts = buildFacts(top, price, SRC)!;

describe("BR-A2 숫자 검증", () => {
  it("쉼표를 떼고 숫자를 뽑는다", () => expect(numbersIn("937,539kWh, 391.2t, 10~90%")).toEqual(["937539", "391.2", "10", "90"]));
  it("입력에 없는 숫자가 하나라도 있으면 실패", () => {
    const good = templateOpinion(facts);
    expect(verify(good, facts).ok).toBe(true);
    const bad = good.replace(facts.설치용량, "999kW");
    expect(verify(bad, facts).reasons[0]).toContain("999");
  });
  it("금지 표현·분량·소제목 누락도 실패", () => {
    const good = templateOpinion(facts);
    expect(verify(good.replace("단계입니다", "단계로 설치 가능 확정입니다"), facts).ok).toBe(false);
    expect(verify(good.replace("■ 출처", "가".repeat(600) + "\n■ 출처"), facts).ok).toBe(false);
    expect(verify(good.replace("단계입니다", "단계로 설치 가능성이 확인되었습니다"), facts).ok).toBe(false);
    expect(verify(good.replace(facts.검토수준, "검토"), facts).reasons).toContain("검토수준 문구 없음");
    expect(verify(good.replace("■ 추가 확인", "■ 기타"), facts).ok).toBe(false);
  });
});

describe("기본 양식(AI-04 폴백)", () => {
  it("계산 가능한 모든 대상 건물에서 검증을 통과한다", () => {
    let count = 0;
    for (const b of all) {
      const f = buildFacts(b, price, SRC);
      if (!f) continue;
      count += 1;
      expect(verify(templateOpinion(f), f).reasons).toEqual([]);
    }
    expect(count).toBeGreaterThan(700);
  });
  it("대상이 아닌 건물은 의견서를 만들지 않는다", () => {
    expect(buildFacts(all.find((b) => b.score.tier === "제외")!, price, SRC)).toBeNull();
  });
});
