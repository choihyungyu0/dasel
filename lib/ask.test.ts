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

import { readFileSync } from "node:fs";
import { listAnswer, type AskData } from "./ask";

describe("산단·단계 목록 질문(모델 미사용)", () => {
  const data = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as AskData;
  const labels = JSON.parse(readFileSync("public/data/labels.json", "utf8")).labels;
  const extra = JSON.parse(readFileSync("public/data/extra.json", "utf8")).extra;
  it("오창2 검토 건물 5곳 → 첫 줄 실제 개수와 항목 수가 같다", () => {
    const a = listAnswer(data, labels, extra, 189.7, "오창2 검토 건물 5곳")!;
    const lines = a.split("\n");
    const n = Number(lines[0].match(/(\d+)곳/)![1]);
    expect(lines.slice(1).length).toBe(n);
    expect(n).toBeLessThanOrEqual(5);
    expect(countMismatch(a)).toBeNull();
  });
  it("이유를 묻는 질문은 목록으로 답하지 않는다", () => expect(listAnswer(data, labels, extra, 189.7, "유한양행 건물이 설치 우선인 이유는?")).toBeNull());
});
