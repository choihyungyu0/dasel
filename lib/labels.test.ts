import { describe, expect, it } from "vitest";
import { LABEL_HEADER, parseLabelCsv, toLabelCsv } from "./labels";

describe("VAL-01 라벨 CSV", () => {
  const rows = [
    { bld_id: 20, label: "미설치" as const, labeler: "kim", image_year: "2025" },
    { bld_id: 3, label: "설치" as const, labeler: "kim", image_year: "2025" },
  ];
  it("머리글은 bld_id,label,labeler,image_year, 건물 번호 순", () => {
    const lines = toLabelCsv(rows).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toEqual([LABEL_HEADER, "3,설치,kim,2025", "20,미설치,kim,2025"]);
  });
  it("내려받은 파일을 다시 불러오면 같은 내용", () => {
    const back = parseLabelCsv(toLabelCsv(rows));
    expect(back.skipped).toBe(0);
    expect(back.rows.map((r) => [r.bld_id, r.label])).toEqual([[3, "설치"], [20, "미설치"]]);
  });
  it("형식이 맞지 않는 줄은 건너뛴다", () => {
    const r = parseLabelCsv("bld_id,label,labeler,image_year\n5,있음,kim,2025\nabc,설치,kim,2025\n7,불명,lee,");
    expect([r.rows.length, r.skipped, r.rows[0].label]).toEqual([1, 2, "불명"]);
  });
});
