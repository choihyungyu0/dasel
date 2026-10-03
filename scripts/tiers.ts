// 단계·배전 점수 분포를 찍어 보는 점검용 스크립트. 실행: npx tsx scripts/tiers.ts
import { readFileSync } from "node:fs";
import { enrich, type RawBuilding } from "../lib/data";

const doc = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const blds = doc.buildings.map((b) => enrich(b, doc.meta.built.replaceAll("-", "")));
const count = (xs: (string | number)[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
const cands = blds.filter((b) => b.target && b.calc.pv_kw !== null && !b.calc.small);
console.log(JSON.stringify({
  tier: count(blds.map((b) => b.score.tier)),
  grid_points_30kw: count(cands.map((b) => b.score.parts.grid ?? "null")),
  grid_level: count(blds.filter((b) => b.target).map((b) => b.grid_level ?? "없음")),
}, null, 1));
