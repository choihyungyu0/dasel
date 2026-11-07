// 상위 30동 비율 확인: npx tsx scripts/analysis/top30.ts
import { readFileSync } from "node:fs";
import { summarize } from "../../lib/calc";
import { enrich, type RawBuilding } from "../../lib/data";
import { DEFAULT_FILTERS, passes } from "../../lib/filters";
import { rankMap } from "../../lib/rank";
const d = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const labels = JSON.parse(readFileSync("public/data/labels.json", "utf8")).labels as Record<string, string>;
for (const b of d.buildings) if (labels[String(b.bld_id)] === "설치") b.installed = true;
const all = d.buildings.map((b) => enrich(b, d.meta.built.replaceAll("-", ""), 189.7)).filter((b) => passes(b, DEFAULT_FILTERS, null)).sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0));
const r = rankMap(all);
const top = all.filter((b) => (r.get(b.bld_id) ?? 1e9) <= 30);
const s = summarize(all), t = summarize(top);
console.log({ total: s.buildings, mw: s.mw, top: t.buildings, topMw: t.mw, pct: ((t.mw / s.mw) * 100).toFixed(1), first: top[0].bld_id });
const byKw = all.filter((b) => r.has(b.bld_id)).sort((a, b) => (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0)).slice(0, 30);
const prio = all.filter((b) => b.score.tier === "설치 우선");
console.log({ byKwPct: ((summarize(byKw).mw / s.mw) * 100).toFixed(1), prio: prio.length, prioPct: ((summarize(prio).mw / s.mw) * 100).toFixed(1), rankCount: r.size });
