import { describe, expect, it } from "vitest";
import type { Building } from "./data";
import { rankMap, rankOrder } from "./rank";

const b = (id: number, tier: string) => ({ bld_id: id, score: { tier } }) as unknown as Building;

describe("후보 목록 순위", () => {
  const list = [b(1, "설치 우선"), b(2, "이미 설치됨"), b(3, "검토"), b(4, "이미 설치됨"), b(5, "보류")];
  it("이미 설치됨은 맨 아래, 나머지 순서는 그대로", () => expect(rankOrder(list).map((x) => x.bld_id)).toEqual([1, 3, 5, 2, 4]));
  it("순위 번호는 이미 설치됨을 건너뛴다", () => {
    const m = rankMap(rankOrder(list));
    expect([m.get(1), m.get(3), m.get(5), m.get(2), m.get(4)]).toEqual([1, 2, 3, undefined, undefined]);
  });
});
