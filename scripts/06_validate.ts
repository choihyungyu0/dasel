// VAL-01 재현 스크립트: data/labels/*.csv → 검증 지표와 지도용 라벨 파일.
//   npx tsx scripts/06_validate.ts
// 출력  data/quality/validation.json, public/data/labels.json
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { enrich, type RawBuilding } from "../lib/data";
import { parseLabelCsv, type LabelRow } from "../lib/labels";
import { consensus, validate } from "../lib/validate";

// 사람이 표시한 data/labels가 비어 있으면 AI 판독 초안(data/labels_ai)으로 계산하고 basis에 'ai'를 남긴다.
function load(dir: string) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".csv"));
  const rows: LabelRow[] = [];
  let skipped = 0;
  for (const f of files) {
    const r = parseLabelCsv(readFileSync(`${dir}/${f}`, "utf8"));
    rows.push(...r.rows);
    skipped += r.skipped;
  }
  return { files, rows, skipped };
}

const human = load("data/labels");
const basis: "human" | "ai" = human.rows.length ? "human" : "ai";
const { files, rows, skipped } = basis === "human" ? human : load("data/labels_ai");

const data = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const ranked = data.buildings
  .map((b) => enrich(b, data.meta.built.replaceAll("-", "")))
  .filter((b) => b.score.tier !== "제외" && b.calc.pv_kw !== null && !b.calc.small)
  .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0))
  .map((b) => ({ bld_id: b.bld_id, score: b.score.score ?? 0 }));

const result = { basis, files, skipped, generated: new Date().toLocaleDateString("sv-SE"), ...validate(rows, ranked) };
writeFileSync("data/quality/validation.json", JSON.stringify(result, null, 1));

const cons = consensus(rows);
const year = result.imageYears.join("·") || null;
writeFileSync("public/data/labels.json", JSON.stringify({ meta: { basis, image_year: year, generated: result.generated }, labels: Object.fromEntries([...cons].filter(([, l]) => l !== "불일치")) }));

console.log(JSON.stringify(result, null, 1));
