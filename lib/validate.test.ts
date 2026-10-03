import { describe, expect, it } from "vitest";
import type { LabelRow } from "./labels";
import { consensus, validate } from "./validate";

const row = (bld_id: number, label: LabelRow["label"], labeler: string): LabelRow => ({ bld_id, label, labeler, image_year: "2025" });
// 점수 높은 순 10동
const ranked = Array.from({ length: 10 }, (_, i) => ({ bld_id: i + 1, score: 80 - i * 5 }));

describe("VAL-01 검증 지표", () => {
  it("두 사람이 다르게 표시하면 불일치로 빼고 재검토 목록에 넣는다", () => {
    const rows = [row(1, "설치", "a"), row(1, "설치", "b"), row(2, "설치", "a"), row(2, "미설치", "b"), row(3, "불명", "a")];
    const c = consensus(rows);
    expect([c.get(1), c.get(2), c.get(3)]).toEqual(["설치", "불일치", "불명"]);
    const v = validate(rows, ranked);
    expect(v.conflicts).toEqual([2]);
    expect([v.overlap, v.agreement]).toEqual([2, 0.5]);
    expect(v.counts).toEqual({ 설치: 1, 미설치: 0, 불명: 1, 불일치: 1 });
  });

  it("상위 k% 적중률·기준 비율·재현율", () => {
    // 상위 3동 중 2동 설치, 나머지 7동 중 1동 설치
    const rows = ranked.map((r) => row(r.bld_id, [1, 2, 7].includes(r.bld_id) ? "설치" : "미설치", "a"));
    const v = validate(rows, ranked, [0.3]);
    expect(v.baseRate).toBe(0.3);
    expect(v.topK[0]).toEqual({ k: 0.3, n: 3, judged: 3, installed: 2, precision: 0.667, lift: 2.22, recall: 0.667 });
    expect(v.mean).toEqual({ installed: 68.3, notInstalled: 52.9 });
  });

  it("설치 건물 점수가 모두 더 높으면 AUC 1, 불명은 계산에서 뺀다", () => {
    const rows = [row(1, "설치", "a"), row(2, "설치", "a"), row(3, "불명", "a"), row(4, "미설치", "a"), row(5, "미설치", "a")];
    const v = validate(rows, ranked);
    expect(v.auc).toBe(1);
    expect(v.labeled).toBe(5);
    expect(v.bins.reduce((s, b) => s + b.installed + b.notInstalled, 0)).toBe(4);
  });

  it("라벨이 없으면 지표는 비어 있다", () => {
    const v = validate([], ranked);
    expect([v.labeled, v.baseRate, v.auc, v.agreement, v.topK[0].precision]).toEqual([0, null, null, null, null]);
  });

  it("두 사람이 완전히 같으면 카파 1", () => {
    const rows = ranked.flatMap((r) => [row(r.bld_id, r.bld_id % 2 ? "설치" : "미설치", "a"), row(r.bld_id, r.bld_id % 2 ? "설치" : "미설치", "b")]);
    expect(validate(rows, ranked).kappa).toBe(1);
  });
});
