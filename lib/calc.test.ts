import { describe, expect, it } from "vitest";
import { calc, normalize, roofArea, summarize, toManwon } from "./calc";
import { CONSTANTS, TARIFF, peakSpread, unsourcedConstants } from "./constants";

describe("5,000㎡ 예시 (CAL-01~04·06)", () => {
  const low = calc(5000, 150);
  const base = calc(5000, 192);

  it("250kW / 356,750kWh", () => {
    expect(base.pv_kw).toBe(250);
    expect(base.pv_kwh).toBe(356750);
  });
  it("절감 5,351만(150원) ~ 6,850만(192원)", () => {
    expect(toManwon(base.save_low!)).toBe(5351);
    expect(toManwon(low.save_base!)).toBe(5351);
    expect(toManwon(base.save_base!)).toBe(6850);
    expect(base.save_low!).toBeLessThanOrEqual(base.save_base!);
  });
  it("148.9t", () => expect(base.co2_t).toBe(148.9));
  it("ESS 500kWh / 1단위 / 팩당 36.96kWh / 팩 14개(A비율 0.7)", () => {
    expect(base.ess_kwh).toBe(500);
    expect(base.ess_units).toBe(1);
    expect(base.kwh_per_pack).toBe(36.96);
    expect(base.packs).toBe(14);
  });
  it("투자비 3.5억, 회수 5.1(192원)~6.5년(150원) — CAL-08", () => {
    expect(base.capex).toBe(350_000_000);
    expect([base.payback_base, base.payback_low]).toEqual([5.1, 6.5]);
  });
  it("단가를 주지 않으면 폴백 192원", () => expect(calc(5000).save_base).toBe(base.save_base));
});

describe("BR-C1 지붕면적", () => {
  it("min(건축면적, 도형 면적)", () => {
    expect(roofArea(5000, 5200)).toEqual({ roof_m2: 5000, source: "ARCH", flags: [] });
    expect(roofArea(5000, 4000)).toEqual({ roof_m2: 4000, source: "GEOM", flags: [] });
  });
  it("도형이 건축면적의 2/3 미만이면 AREA_MISMATCH", () => {
    expect(roofArea(6000, 3000)).toEqual({ roof_m2: 3000, source: "GEOM", flags: ["AREA_MISMATCH"] });
  });
  it("건축면적 결측이면 도형 면적 + AREA_GEOM", () => {
    expect(roofArea(null, 800)).toEqual({ roof_m2: 800, source: "GEOM", flags: ["AREA_GEOM"] });
    expect(roofArea(0, 800).flags).toEqual(["AREA_GEOM"]);
  });
  it("둘 다 없으면 null(0 아님)", () => {
    expect(roofArea(null, null).roof_m2).toBeNull();
    const c = calc(null);
    expect([c.pv_kw, c.pv_kwh, c.packs, c.save_low, c.co2_t]).toEqual([null, null, null, null, null]);
  });
});

describe("BR-C3·G2 소규모", () => {
  it("pv_kw < 30이면 ESS 미산정", () => {
    const c = calc(500);
    expect(c.pv_kw).toBe(25);
    expect(c.small).toBe(true);
    expect([c.ess_kwh, c.ess_units, c.packs]).toEqual([null, null, null]);
    expect(c.pv_kwh).toBe(35675);
  });
  it("600㎡ = 30kW는 산정", () => expect(calc(600).ess_kwh).toBe(60));
});

describe("분산 단위·조건 범위", () => {
  it("BR-C3 ESS는 기본 1단위 시범: 657kW → 1,314kWh가 아니라 1,000kWh 1단위", () => {
    const c = calc(13140);
    expect(c.pv_kw).toBe(657);
    expect([c.ess_kwh, c.ess_units]).toEqual([1000, 1]);
    expect(c.packs).toBe(Math.ceil(1000 / 36.96));
  });
  it("단위 수를 늘리면 단위당 1MWh 이하로 분산: 1,200kW·3단위 → 2,400kWh 3단위", () => {
    const c = calc(24000, 192, { essUnits: 3 });
    expect([c.ess_kwh, c.ess_units]).toEqual([2400, 3]);
    expect(c.ess_kwh! / c.ess_units!).toBeLessThanOrEqual(1000);
  });
  it("BR-L1 충전율 상한: 옥외 0.90, 옥내 0.80", () => {
    expect(normalize({ socMax: 0.95 }).socMax).toBe(0.9);
    expect(normalize({ socMax: 0.5 }).socMax).toBe(0.8);
    expect(normalize({ socMax: 0.9, indoor: 1 }).socMax).toBe(0.8);
    expect(calc(5000, 192, { indoor: 1 }).packs).toBeGreaterThan(14);
  });
  it("pv_kw ≤ 지붕면적 ÷ 7", () => {
    const c = calc(5000, 192, { util: 0.7, m2PerKw: 3 });
    expect(c.pv_kw!).toBeLessThanOrEqual(5000 / 7);
  });
  it("SOH A비율 40%·충전율 80% → 팩 수 증가", () => {
    expect(calc(5000, 192, { aRatio: 0.4, socMax: 0.8 }).packs).toBeGreaterThan(14);
  });
});

describe("CAL-07 합계", () => {
  it("pv_kw ≥ 30 대상만 합산, 나머지는 건수만", () => {
    const s = summarize([
      { target: true, calc: calc(5000) },
      { target: true, calc: calc(5000) },
      { target: true, calc: calc(500) },
      { target: false, calc: calc(5000) },
      { target: true, calc: calc(null) },
    ]);
    expect(s.buildings).toBe(2);
    expect(s.others).toBe(3);
    expect(s.mw).toBe(0.5);
    expect(s.packs).toBe(28);
    expect(s.co2_t).toBe(297.8);
    expect(s.capex).toBe(700_000_000);
  });
});

describe("BR-O1 출처 없는 상수 금지", () => {
  it("모든 상수에 출처·기준일", () => {
    expect(unsourcedConstants()).toEqual([]);
    expect(Object.keys(CONSTANTS).length).toBeGreaterThan(0);
  });
});

describe("BR-C6 요금표 상수", () => {
  it("계절별 최대−경부하 단가차 113.0·34.9·81.6 → 가중 평균 70.0", () => {
    const diff = (r: readonly number[]) => Math.round((r[2] - r[0]) * 10) / 10;
    const e = TARIFF.energy;
    expect([diff(e.summer.rates), diff(e.springFall.rates), diff(e.winter.rates)]).toEqual([113.0, 34.9, 81.6]);
    expect(peakSpread()).toBe(70.0);
  });
  it("12개월을 빠짐없이 덮는다", () => {
    const months = Object.values(TARIFF.energy).flatMap((s) => [...s.months]).sort((a, b) => a - b);
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(TARIFF.basicWonPerKw).toBe(8320);
  });
});
