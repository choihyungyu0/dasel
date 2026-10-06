// 작업 C 대상 목록: 점수 상위 10%(34동) + '설치 우선' 건물(중복 제외). 실행: npx tsx scripts/roof_targets.ts
// 출력  data/labels_draft/roof_targets.json (bld_id 배열, 건물 ID 순)
import { readFileSync, writeFileSync } from "node:fs";
import { enrich, type RawBuilding } from "../lib/data";

const doc = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const labels = (JSON.parse(readFileSync("public/data/labels.json", "utf8")) as { labels: Record<string, string> }).labels;
for (const b of doc.buildings) if (labels[String(b.bld_id)] === "설치") b.installed = true;
const cands = doc.buildings
  .map((b) => enrich(b, doc.meta.built.replaceAll("-", "")))
  .filter((b) => b.score.tier !== "제외" && b.calc.pv_kw !== null && !b.calc.small)
  .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0));
const top = cands.slice(0, Math.ceil(cands.length * 0.1)).map((b) => b.bld_id);
const go = cands.filter((b) => b.score.tier === "설치 우선").map((b) => b.bld_id);
const ids = [...new Set([...top, ...go])].sort((a, b) => a - b);
writeFileSync("data/labels_draft/roof_targets.json", JSON.stringify({ top10: top.length, install_first: go.length, ids }));
console.log(JSON.stringify({ top10: top.length, install_first: go.length, total: ids.length }));
