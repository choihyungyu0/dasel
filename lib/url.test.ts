import { describe, expect, it } from "vitest";
import { decodeScenario, defaultScenario, encodeScenario } from "./url";

describe("SIM-01 조건 문자열", () => {
  it("기본값 = u50.a10.p192.h2.k60.sa70.sx90", () => {
    expect(encodeScenario(defaultScenario(192))).toBe("u50.a10.p192.h2.k60.sa70.sx90");
  });
  it("링크로 같은 조건 복원", () => {
    const s = { ...defaultScenario(192), util: 0.4, m2PerKw: 8, price: 170, essHours: 3, packKwh: 75, aRatio: 0.4, socMax: 0.8 };
    expect(decodeScenario(encodeScenario(s), 192)).toEqual({ scenario: s, adjusted: false });
  });
  it("범위 밖 값은 기본값으로 대체하고 알림", () => {
    const r = decodeScenario("u90.a10.p192.h2.k60.sa70.sx95.zz1", 192);
    expect(r.adjusted).toBe(true);
    expect(r.scenario).toEqual(defaultScenario(192));
  });
  it("없으면 기본값", () => expect(decodeScenario(null, 192.4)).toEqual({ scenario: defaultScenario(192.4), adjusted: false }));
});
