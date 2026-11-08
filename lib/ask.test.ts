// 질의응답 답 검사: 목록 개수(첫 줄·항목·마지막 줄) 일치
import { describe, expect, it } from "vitest";
import { checkAnswer, countMismatch } from "./ask";

const BAD = "오창2 검토 단계 건물 5곳 목록(점수순 기준).\n- (주)원익피앤이 오창2 · 101.8kW · 59점\n- (주)셀트리온 제약 오창2 · 32.8kW · 53점\n- (주)원익피앤이 오창2 · 91.5kW · 52점\n오창2 산단 검토 단계 건물은 3곳임.";
const GOOD = "오창2 검토 건물 3곳\n- (주)원익피앤이 오창2 · 101.8kW · 59점\n- (주)셀트리온 제약 오창2 · 32.8kW · 53점\n- (주)원익피앤이 오창2 · 91.5kW · 52점";

describe("질의응답 목록 개수", () => {
  it("첫 줄 5곳·마지막 줄 3곳이면 불일치", () => expect(countMismatch(BAD)).not.toBeNull());
  it("첫 줄 5곳·항목 3개만이어도 불일치", () => expect(countMismatch(BAD.split("\n").slice(0, 4).join("\n"))).not.toBeNull());
  it("첫 줄 3곳·항목 3개는 통과", () => expect(countMismatch(GOOD)).toBeNull());
  it("목록이 아닌 답(점수 항목)은 검사하지 않음", () => expect(countMismatch("유한양행 1동 설치 우선 사유\n- 점수 76/90점\n- 규모 30점")).toBeNull());
  it("checkAnswer가 개수 불일치를 잡는다", () => {
    const ctx = "101.8kW 59 32.8kW 53 91.5kW 52 3 5";
    expect(checkAnswer(BAD, ctx).some((r) => r.startsWith("개수 불일치"))).toBe(true);
    expect(checkAnswer(GOOD, ctx)).toEqual([]);
  });
});
