// 규칙 점수와 ML 비교용 특징 내보내기. 실행: npx tsx scripts/analysis/export_features.ts
// 후보(대상·30kW 이상) 건물의 점수·구성요소·원값·항공영상 라벨만 담는다. 회사명·주소는 넣지 않는다.
// enrich 에 installed 를 넘기지 않으므로 점수는 라벨과 무관하게 계산된다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { enrich, type RawBuilding } from "../../lib/data";

const doc = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as {
  meta: { built: string; base_date?: string };
  buildings: RawBuilding[];
};
const lab = JSON.parse(readFileSync("public/data/labels.json", "utf8")) as {
  meta: { basis?: string; generated?: string };
  labels: Record<string, string>;
};

const baseYmd = doc.meta.built.replaceAll("-", "");
const blds = doc.buildings.map((b) => enrich(b, baseYmd));
const cands = blds.filter((b) => b.target && b.calc.pv_kw !== null && !b.calc.small);

const rows = cands.map((b) => ({
  bld_id: b.bld_id,
  score: b.score.score,
  parts: {
    scale: b.score.parts.scale ?? null,
    struct: b.score.parts.struct ?? null,
    age: b.score.parts.age ?? null,
    industry: b.score.parts.industry ?? null,
    grid: b.score.parts.grid ?? null,
  },
  pv_kw: b.calc.pv_kw,
  age_years: b.score.ageYears,
  struct: b.struct ?? null,
  industry: b.industry,
  grid_min_kw: b.grid_min_kw ?? null,
  grid_max_kw: b.grid_max_kw ?? null,
  label: lab.labels[String(b.bld_id)] ?? null,
}));

const labelCounts = rows.reduce<Record<string, number>>((a, r) => {
  const k = r.label ?? "없음";
  a[k] = (a[k] ?? 0) + 1;
  return a;
}, {});

const out = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    score_base_ymd: baseYmd,
    buildings_base_date: doc.meta.base_date ?? null,
    labels_basis: lab.meta.basis ?? null,
    labels_generated: lab.meta.generated ?? null,
    candidates: rows.length,
    label_counts: labelCounts,
    note: "후보 = target && pv_kw !== null && !small. 점수는 설치 라벨을 쓰지 않고 계산함.",
  },
  buildings: rows,
};

mkdirSync("data/quality", { recursive: true });
writeFileSync("data/quality/features.json", JSON.stringify(out, null, 1) + "\n", "utf8");
console.log(JSON.stringify(out.meta, null, 1));
