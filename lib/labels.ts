// VAL-01 기존 태양광 설치 라벨: data/labels/*.csv (bld_id,label,labeler,image_year)
export const LABELS = ["설치", "미설치", "불명"] as const;
export type Label = (typeof LABELS)[number];

export interface LabelRow {
  bld_id: number;
  label: Label;
  labeler: string;
  image_year: string;
}

export const LABEL_HEADER = "bld_id,label,labeler,image_year";

const clean = (v: string) => v.replace(/[",\r\n]/g, " ").trim();

export function toLabelCsv(rows: LabelRow[]): string {
  const lines = [...rows].sort((a, b) => a.bld_id - b.bld_id).map((r) => [r.bld_id, r.label, clean(r.labeler), clean(r.image_year)].join(","));
  return "﻿" + [LABEL_HEADER, ...lines].join("\r\n") + "\r\n";
}

/** 형식이 맞지 않는 줄은 버리고 그 수를 알려 준다. */
export function parseLabelCsv(text: string): { rows: LabelRow[]; skipped: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const rows: LabelRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(lines[0]?.startsWith("bld_id") ? 1 : 0)) {
    const [id, label, labeler = "", year = ""] = line.split(",").map((c) => c.trim());
    if (/^\d+$/.test(id) && (LABELS as readonly string[]).includes(label)) rows.push({ bld_id: Number(id), label: label as Label, labeler, image_year: year });
    else skipped += 1;
  }
  return { rows, skipped };
}
