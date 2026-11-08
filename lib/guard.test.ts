import { describe, expect, it } from "vitest";
import { makeCache, makeLimiter } from "./guard";

describe("사용량 제한·캐시", () => {
  it("IP당 분당 30회", () => {
    const lim = makeLimiter(30, 120);
    const r = Array.from({ length: 31 }, () => lim("a", 1000));
    expect(r.filter(Boolean).length).toBe(1);
    expect(lim("a", 62_000)).toBe(false); // 1분 지나면 풀림
  });
  it("전체 분당 120회", () => {
    const lim = makeLimiter(30, 120);
    let blocked = 0;
    for (let i = 0; i < 130; i++) if (lim(`ip${i % 10}`, 1000)) blocked++;
    expect(blocked).toBe(10);
  });
  it("24시간 캐시", () => {
    const c = makeCache<number>(24 * 3600_000);
    c.set("q", 1, 0);
    expect(c.get("q", 3600_000)).toBe(1);
    expect(c.get("q", 25 * 3600_000)).toBeUndefined();
  });
});
