import { describe, expect, it } from "vitest";
import { calc } from "./calc";
import { HAZMAT_CHIP_P0 } from "./constants";
import { ageYears, maxAvailable, score, structPoints, summarySentence, type ScoreInput } from "./score";

const BASE = "20261003";
const make = (o: Partial<ScoreInput> & { roof?: number | null } = {}): ScoreInput => ({
  target: true,
  calc: calc(o.roof === undefined ? 5000 : o.roof),
  struct: "철근콘크리트구조",
  aprYmd: "20140601",
  industry: "HIGH",
  ...o,
});
const sum = (p: object) => Object.values(p as Record<string, number>).reduce((a, b) => a + b, 0);

describe("BR-S8 반영 만점", () => {
  it("P0 = 80, 위험물만 반영 90, 전부 반영 100", () => {
    expect(maxAvailable()).toBe(80);
    expect(maxAvailable({ hazmat: true, grid: false })).toBe(90);
    expect(maxAvailable({ hazmat: true, grid: true })).toBe(100);
  });
});

describe("점수 = 구성요소 합", () => {
  const cases: ScoreInput[] = [
    make(),
    make({ roof: 12000, struct: "일반철골구조", aprYmd: "20001231", industry: "MFG" }),
    make({ roof: 700, struct: null, aprYmd: null, industry: null }),
    make({ roof: 2500, struct: "벽돌구조", aprYmd: "19900101" }),
  ];
  it.each(cases.map((c, i) => [i, c] as const))("사례 %i", (_, c) => {
    const s = score(c, BASE);
    expect(sum(s.parts)).toBe(s.score);
    expect(s.score!).toBeLessThanOrEqual(s.max);
    expect(Object.keys(s.parts).sort()).toEqual(["age", "industry", "scale", "struct"]);
  });
  it("배전·위험물 반영 시에도 합 = 점수", () => {
    const s = score(make({ distHazmatM: 120, gridMarginKw: 300 }), BASE, { hazmat: true, grid: true });
    expect(s.parts).toEqual({ scale: 22, struct: 20, age: 12, industry: 15, hazmat: 10, grid: 10 });
    expect(s.score).toBe(89);
    expect(s.max).toBe(100);
  });
});

describe("구성요소 구간", () => {
  it("BR-S1 규모", () => {
    const pts = (roof: number) => score(make({ roof }), BASE).parts.scale;
    expect([500, 600, 2000, 4000, 10000].map(pts)).toEqual([0, 8, 15, 22, 30]);
  });
  it("BR-S2 구조", () => {
    expect(["철근콘크리트구조", "철골철근콘크리트구조", "철골콘크리트구조", "프리케스트콘크리트구조", "프리캐스트콘크리트구조"].map(structPoints))
      .toEqual([20, 20, 20, 20, 20]);
    expect(["일반철골구조", "경량철골구조", "강파이프구조", "기타강구조"].map(structPoints)).toEqual([12, 12, 12, 12]);
    expect(["벽돌구조", "블록구조", "일반목구조", null].map(structPoints)).toEqual([5, 5, 5, 0]);
  });
  it("철골 계열은 하중 확인 칩", () => {
    expect(score(make({ struct: "일반철골구조" }), BASE).chips).toContain("경량 지붕 하중 확인 필요");
    expect(score(make(), BASE).chips).not.toContain("경량 지붕 하중 확인 필요");
  });
  it("BR-S3 노후", () => {
    const pts = (ymd: string | null) => score(make({ aprYmd: ymd }), BASE).parts.age;
    expect(["20200101", "20100101", "20000101", "19900101", null].map(pts)).toEqual([15, 12, 6, 0, 0]);
    expect(ageYears("19961004", BASE)).toBe(29);
    expect(ageYears("19961003", BASE)).toBe(30);
  });
  it("BR-S4 업종", () => {
    expect((["HIGH", "MFG", null] as const).map((i) => score(make({ industry: i }), BASE).parts.industry)).toEqual([15, 8, 0]);
  });
});

describe("BR-S7 단계 (P0 컷 56·40)", () => {
  it("69점 통과 → 설치 우선", () => {
    const s = score(make(), BASE);
    expect([s.score, s.max, s.gate, s.tier]).toEqual([69, 80, "통과", "설치 우선"]);
  });
  it("56점 → 설치 우선, 55점 → 검토", () => {
    const s56 = score(make({ roof: 10000, struct: "일반철골구조", aprYmd: "20000101", industry: "MFG" }), BASE);
    expect([s56.score, s56.tier]).toEqual([56, "설치 우선"]);
    const s55 = score(make({ roof: 1000, aprYmd: "20100101", industry: "HIGH" }), BASE);
    expect([s55.score, s55.tier]).toEqual([55, "검토"]);
  });
  it("40점 → 검토, 40점 미만 → 보류", () => {
    const s40 = score(make({ roof: 600, aprYmd: "20100101", industry: null }), BASE);
    expect([s40.score, s40.tier]).toEqual([40, "검토"]);
    const s35 = score(make({ roof: 600, struct: "일반철골구조", aprYmd: "20200101", industry: null }), BASE);
    expect([s35.score, s35.tier]).toEqual([35, "보류"]);
  });
  it("BR-G2 소규모는 점수와 무관하게 보류, 게이트는 그대로", () => {
    const s = score(make({ roof: 500 }), BASE);
    expect([s.tier, s.gate]).toEqual(["보류", "통과"]);
  });
});

describe("안전 게이트", () => {
  it("BR-G1 대상 아님 → 제외, 점수 미표시", () => {
    const s = score(make({ target: false }), BASE);
    expect([s.gate, s.tier, s.score]).toEqual(["제외", "제외", null]);
  });
  it("BR-G4 구조 결측·30년 이상 → 조건부, 단계 상한 검토", () => {
    const old = score(make({ roof: 10000, aprYmd: "19900101" }), BASE);
    expect(old.flags).toContain("OLD30");
    expect([old.score, old.gate, old.tier]).toEqual([65, "조건부", "검토"]);
    const noStruct = score(make({ struct: null }), BASE);
    expect(noStruct.flags).toContain("STRUCT_NULL");
    expect(noStruct.gate).toBe("조건부");
  });
  it("BR-G3 P0: 위험물은 게이트에 쓰지 않고 고정 칩", () => {
    const s = score(make({ distHazmatM: 10 }), BASE);
    expect(s.gate).toBe("통과");
    expect(s.chips).toContain(HAZMAT_CHIP_P0);
    expect(s.parts.hazmat).toBeUndefined();
  });
  it("BR-G3 위험물 확보 후: 50m 미만·미확인 → 조건부", () => {
    const av = { hazmat: true, grid: false };
    expect(score(make({ distHazmatM: 32 }), BASE, av).gate).toBe("조건부");
    const unknown = score(make({ distHazmatM: null }), BASE, av);
    expect([unknown.gate, unknown.flags.includes("HAZ_NULL")]).toEqual(["조건부", true]);
    expect(score(make({ distHazmatM: 120 }), BASE, av).gate).toBe("통과");
  });
});

describe("AI-04 근거 문장", () => {
  it("문장 숫자 = 계산 숫자", () => {
    const i = make();
    expect(summarySentence(i, score(i, BASE))).toBe("지붕면적 5,000㎡·철근콘크리트구조·사용승인 12년 → 250kW, 재사용 팩 14개, 설치 우선");
  });
  it("결측 항목은 문장에서 제외", () => {
    const i = make({ struct: null, aprYmd: null });
    expect(summarySentence(i, score(i, BASE))).toBe("지붕면적 5,000㎡ → 250kW, 재사용 팩 14개, 보류");
  });
  it("금지 표현 없음", () => {
    const i = make();
    expect(summarySentence(i, score(i, BASE))).not.toMatch(/안전 보장|확정|위험 없음|AI가 판단/);
  });
});
