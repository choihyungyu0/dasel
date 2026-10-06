// 작업 C: AI 지붕 이용률 판독 2회(data/labels_draft/roof_passA.csv, roof_passB.csv)를 합치고 0.5 가정과 비교한다.
//   npx tsx scripts/analysis/roof_usable.ts
// 출력  data/labels_ai/roof_usable.csv (bld_id,usable,pass1,pass2,note)
//       public/data/roof_usable.json (화면 보조 표시용), data/quality/roof_usable.json (비교 결과)
// 이용률 = 1 − 두 판독 장애 비율의 평균, [0.2, 0.7]로 자름. 두 판독 차이가 20%p를 넘으면 재판독 대상(needs_review).
// 기본 계산(이용률 0.5)은 바꾸지 않는다. 여기 값은 참고용이다.
import { readFileSync, writeFileSync } from "node:fs";
import { CONSTANTS as C } from "../../lib/constants";
import { enrich, type RawBuilding } from "../../lib/data";

const LO = 0.2, HI = 0.7;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function readPass(path: string) {
  const out = new Map<number, { pct: number | null; note: string }>();
  for (const line of readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [id, pct, ...rest] = line.split(",");
    out.set(Number(id), { pct: pct.trim() === "" ? null : Number(pct), note: rest.join(",").replace(/^"|"$/g, "").trim() });
  }
  return out;
}

const A = readPass("data/labels_draft/roof_passA.csv");
const B = readPass("data/labels_draft/roof_passB.csv");
const targets = (JSON.parse(readFileSync("data/labels_draft/roof_targets.json", "utf8")) as { ids: number[] }).ids;

const rows = targets.map((id) => {
  const a = A.get(id)?.pct ?? null, b = B.get(id)?.pct ?? null;
  const ok = a !== null && b !== null;
  const raw = ok ? 1 - (a + b) / 200 : null;
  return { bld_id: id, usable: raw === null ? null : round(Math.min(HI, Math.max(LO, raw))), raw: raw === null ? null : round(raw), pass1: a, pass2: b, needs_review: ok && Math.abs(a - b) > 20, note: (A.get(id)?.note ?? "").replaceAll(",", " ") };
});
writeFileSync("data/labels_ai/roof_usable.csv", "﻿bld_id,usable,pass1,pass2,note\r\n" + rows.map((r) => [r.bld_id, r.usable ?? "", r.pass1 ?? "", r.pass2 ?? "", r.note].join(",")).join("\r\n") + "\r\n");

// ---- 0.5 가정과 비교
const doc = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string; base_date: string }; buildings: RawBuilding[] };
const labels = (JSON.parse(readFileSync("public/data/labels.json", "utf8")) as { labels: Record<string, string> }).labels;
const baseYmd = doc.meta.built.replaceAll("-", "");
const usable = new Map(rows.filter((r) => r.usable !== null).map((r) => [r.bld_id, r.usable!]));
const raws = doc.buildings.map((b) => ({ ...b, installed: labels[String(b.bld_id)] === "설치" || undefined }));
const base = raws.map((b) => enrich(b, baseYmd));
const ai = raws.map((b) => (usable.has(b.bld_id) ? enrich(b, baseYmd, undefined, { util: usable.get(b.bld_id)! }) : enrich(b, baseYmd)));
const cand = (list: typeof base) => list.filter((b) => b.target && b.calc.pv_kw !== null);
const rank = (list: typeof base) => cand(list).filter((b) => !b.calc.small).sort((x, y) => (y.score.score ?? 0) - (x.score.score ?? 0) || (y.calc.pv_kw ?? 0) - (x.calc.pv_kw ?? 0)).map((b) => b.bld_id);
const byId = (list: typeof base) => new Map(list.map((b) => [b.bld_id, b]));
const b0 = byId(base), b1 = byId(ai);
const read = rows.filter((r) => r.usable !== null);
const kw = (m: typeof b0, ids: number[]) => round(ids.reduce((s, id) => s + (m.get(id)!.calc.pv_kw ?? 0), 0), 1);
const notInstalled = read.filter((r) => !raws.find((b) => b.bld_id === r.bld_id)!.installed).map((r) => r.bld_id);
const top20 = rank(base).slice(0, 20), top20ai = new Set(rank(ai).slice(0, 20));
const tierMoves = read.filter((r) => b0.get(r.bld_id)!.score.tier !== b1.get(r.bld_id)!.score.tier).map((r) => `${b0.get(r.bld_id)!.score.tier}→${b1.get(r.bld_id)!.score.tier}`);
const EXAMPLE = 121902; // 화면·의견서 예시 건물(공장 A)
const ex = (m: typeof b0) => ({ pv_kw: m.get(EXAMPLE)!.calc.pv_kw, score: m.get(EXAMPLE)!.score.score, tier: m.get(EXAMPLE)!.score.tier, packs: m.get(EXAMPLE)!.calc.packs, save_base: m.get(EXAMPLE)!.calc.save_base });

const result = {
  meta: {
    generated: new Date().toLocaleDateString("sv-SE"),
    rule: `이용률 = 1 − 두 판독 장애 비율 평균, ${LO}~${HI}로 자름. 기본 계산은 이용률 ${C.UTIL.value} 그대로`,
    source: "브이월드 항공영상(국토지리정보원 정사영상) 건물별 캡처를 Claude Opus 5.5 에이전트 둘이 서로의 결과를 보지 않고 판독(2026-10-06)",
    targets: "점수 상위 10%(34동)와 설치 우선 건물의 합집합",
  },
  targets: targets.length,
  read: read.length,
  unreadable: rows.filter((r) => r.usable === null).map((r) => r.bld_id),
  needs_review: rows.filter((r) => r.needs_review).map((r) => r.bld_id),
  pass_agreement: { same: rows.filter((r) => r.pass1 !== null && r.pass1 === r.pass2).length, within10: rows.filter((r) => r.pass1 !== null && r.pass2 !== null && Math.abs(r.pass1 - r.pass2) <= 10).length, max_diff: Math.max(...rows.filter((r) => r.pass1 !== null && r.pass2 !== null).map((r) => Math.abs(r.pass1! - r.pass2!))) },
  usable: { mean: round(read.reduce((s, r) => s + r.usable!, 0) / read.length), mean_not_installed: round(notInstalled.reduce((s, id) => s + usable.get(id)!, 0) / notInstalled.length), at_floor: read.filter((r) => r.usable === LO).length, at_cap: read.filter((r) => r.usable === HI).length, assumed: C.UTIL.value },
  capacity_kw: { all_read: { assumed: kw(b0, read.map((r) => r.bld_id)), ai: kw(b1, read.map((r) => r.bld_id)) }, not_installed: { n: notInstalled.length, assumed: kw(b0, notInstalled), ai: kw(b1, notInstalled) } },
  top20_kept: top20.filter((id) => top20ai.has(id)).length,
  tier_moves: tierMoves.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}),
  example: { bld_id: EXAMPLE, usable: usable.get(EXAMPLE) ?? null, assumed: ex(b0), ai: ex(b1) },
};
writeFileSync("data/quality/roof_usable.json", JSON.stringify(result, null, 1));
writeFileSync("public/data/roof_usable.json", JSON.stringify({ meta: result.meta, usable: Object.fromEntries(read.map((r) => [r.bld_id, { usable: r.usable, note: r.note }])) }));
console.log(JSON.stringify(result, null, 1));
