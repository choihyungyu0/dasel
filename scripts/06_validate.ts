// VAL-01 재현 스크립트: AI 판독(data/labels_ai) + 사람 검수(data/labels) → 검증 지표와 지도용 라벨 파일.
//   npx tsx scripts/06_validate.ts
// 출력  data/quality/validation.json, public/data/labels.json, public/data/label_queue.json
//
// 사람 검수 표본(큐) = AI가 '설치'로 본 건물 전부 + '미설치' 중 무작위 50동(시드 고정).
// 검증에 쓰는 라벨 = 사람이 본 건물은 사람 라벨, 나머지는 AI 판독. 큐를 다 볼 때까지 basis는 'ai'(화면에 '검수 전').
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { enrich, type RawBuilding } from "../lib/data";
import { parseLabelCsv, type Label, type LabelRow } from "../lib/labels";
import { consensus, validate } from "../lib/validate";

const SEED = 20261004;
const SAMPLE_NOT = 50;

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

/** 같은 입력이면 같은 표본이 나오도록 씨앗을 고정한 난수(mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

const human = load("data/labels");
const ai = load("data/labels_ai");
const aiLabel = consensus(ai.rows);
const humanLabel = consensus(human.rows);

const data = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { built: string }; buildings: RawBuilding[] };
const ranked = data.buildings
  .map((b) => enrich(b, data.meta.built.replaceAll("-", "")))
  .filter((b) => b.score.tier !== "제외" && b.calc.pv_kw !== null && !b.calc.small)
  .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0))
  .map((b) => ({ bld_id: b.bld_id, score: b.score.score ?? 0 }));

// ---- 사람 검수 큐: 건물 ID 순으로 정렬한 뒤 섞어야 점수가 바뀌어도 표본이 그대로다
const ids = ranked.map((r) => r.bld_id).sort((a, b) => a - b);
const aiInstalled = ids.filter((id) => aiLabel.get(id) === "설치");
const pool = ids.filter((id) => aiLabel.get(id) === "미설치");
const rand = rng(SEED);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sampleNot = pool.slice(0, SAMPLE_NOT);
const queue = [...aiInstalled, ...sampleNot];
// 사람 눈가림 표본(A2): AI '설치' 10동 + '미설치' 10동을 시드 고정으로 뽑아 섞는다. /label?blind=1 이 이 순서로 보여 준다
const BLIND_SEED = 20261006;
const rand2 = rng(BLIND_SEED);
const pick = (arr: number[], k: number) => {
  const a = [...arr].sort((x, y) => x - y);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand2() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
};
const blind20 = pick([...pick(aiInstalled, 10), ...pick(sampleNot, 10)], 20);
writeFileSync("public/data/label_queue.json", JSON.stringify({ meta: { seed: SEED, installed: aiInstalled.length, not_installed_sample: sampleNot.length, rule: "AI 판독 '설치' 전부 + '미설치' 중 무작위 50동", blind_seed: BLIND_SEED, blind_rule: "AI 판독 '설치' 10동 + '미설치' 10동(시드 고정 무작위, 순서 섞음)" }, ids: queue, blind20 }));

// ---- AI 판독 vs 사람 검수
const both = queue.filter((id) => humanLabel.has(id));
const judged = both.filter((id) => humanLabel.get(id) === "설치" || humanLabel.get(id) === "미설치");
const aiPos = judged.filter((id) => aiLabel.get(id) === "설치");
const humanPos = judged.filter((id) => humanLabel.get(id) === "설치");
const notChecked = sampleNot.filter((id) => humanLabel.get(id) === "설치" || humanLabel.get(id) === "미설치");
const review = {
  queue: queue.length,
  done: both.length,
  agreement: both.length ? round(both.filter((id) => humanLabel.get(id) === aiLabel.get(id)).length / both.length) : null,
  /** AI가 '설치'로 본 것 중 사람도 '설치'로 본 비율 */
  precision: aiPos.length ? round(aiPos.filter((id) => humanLabel.get(id) === "설치").length / aiPos.length) : null,
  /** 사람이 '설치'로 본 것 중 AI도 '설치'로 본 비율(검수 표본 안에서) */
  recall: humanPos.length ? round(humanPos.filter((id) => aiLabel.get(id) === "설치").length / humanPos.length) : null,
  /** AI '미설치' 무작위 표본 중 사람이 '설치'로 고친 비율(놓친 비율 추정) */
  missRate: notChecked.length ? round(notChecked.filter((id) => humanLabel.get(id) === "설치").length / notChecked.length) : null,
  missChecked: notChecked.length,
};
// 사람 표본 20동(A2): 사람이 실제로 표시한 것만 센다. AI가 대신 채우지 않는다
const s20 = blind20.filter((id) => humanLabel.has(id));
const sample20 = {
  total: blind20.length,
  done: s20.length,
  agree: s20.filter((id) => humanLabel.get(id) === aiLabel.get(id)).length,
  kappa: s20.length ? kappaOf(s20.map((id) => [aiLabel.get(id) as string, humanLabel.get(id) as string])) : null,
};
// 허가대장 대조(A1) 결과가 있으면 basis에 붙인다
const permit = existsSync("data/quality/permit.json") ? (JSON.parse(readFileSync("data/quality/permit.json", "utf8")) as Record<string, unknown>) : null;
const basis: string = review.done >= review.queue && review.queue > 0 ? "human" : ["ai", permit ? "permit" : null, sample20.done >= sample20.total ? "human_sample20" : null].filter(Boolean).join("+");

/** 코헨 카파: 두 판독이 우연히 맞을 확률을 뺀 일치도 */
function kappaOf(pairs: [string, string][]): number | null {
  if (!pairs.length) return null;
  const cats = [...new Set(pairs.flat())];
  const po = pairs.filter(([a, b]) => a === b).length / pairs.length;
  const pe = cats.reduce((sum, c) => sum + (pairs.filter(([a]) => a === c).length / pairs.length) * (pairs.filter(([, b]) => b === c).length / pairs.length), 0);
  return pe === 1 ? 1 : round((po - pe) / (1 - pe));
}

// ---- AI 눈가림 재판독: 앞선 판독을 보지 않은 별도 판독(검수 큐 대상). 사람 검수가 아니다.
const BLIND = "data/labels_draft/ai_blind_queue.csv";
const blindLabel = new Map<number, Label>(existsSync(BLIND) ? parseLabelCsv(readFileSync(BLIND, "utf8")).rows.map((r) => [r.bld_id, r.label]) : []);
const blindIds = queue.filter((id) => blindLabel.has(id));
const blind = blindIds.length
  ? {
      checked: blindIds.length,
      agreement: round(blindIds.filter((id) => blindLabel.get(id) === aiLabel.get(id)).length / blindIds.length),
      installedKept: aiInstalled.filter((id) => blindLabel.get(id) === "설치").length,
      installedTotal: aiInstalled.filter((id) => blindLabel.has(id)).length,
      notFlipped: sampleNot.filter((id) => blindLabel.get(id) === "설치").length,
      notTotal: sampleNot.filter((id) => blindLabel.has(id)).length,
      changed: blindIds.filter((id) => blindLabel.get(id) !== aiLabel.get(id)).length,
      kappa: kappaOf(blindIds.map((id) => [aiLabel.get(id) as string, blindLabel.get(id) as string])),
    }
  : null;

// ---- 검증에 쓰는 라벨: 사람이 본 건물은 사람 라벨, 나머지는 AI 판독(재판독과 엇갈리면 '불명'으로 내려 계산에서 뺀다)
const merged = new Map<number, Label | "불일치">(aiLabel);
for (const id of blindIds) if (blindLabel.get(id) !== aiLabel.get(id)) merged.set(id, "불명");
for (const [id, l] of humanLabel) merged.set(id, l);
const rows: LabelRow[] = [...merged].filter(([, l]) => l !== "불일치").map(([bld_id, l]) => ({ bld_id, label: l as Label, labeler: humanLabel.has(bld_id) ? "human" : "ai", image_year: "" }));
const years = [...new Set([...human.rows, ...ai.rows].map((r) => r.image_year).filter(Boolean))].sort();

const result = { basis, review, blind, sample20, files: [...human.files, ...ai.files], skipped: human.skipped + ai.skipped, generated: new Date().toLocaleDateString("sv-SE"), ...validate(rows, ranked, [0.1, 0.2, 0.3]), imageYears: years, humanConflicts: [...humanLabel].filter(([, l]) => l === "불일치").map(([id]) => id) };
writeFileSync("data/quality/validation.json", JSON.stringify(result, null, 1));
writeFileSync("public/data/labels.json", JSON.stringify({ meta: { basis, reviewed: review.done, image_year: years.join("·") || null, generated: result.generated }, labels: Object.fromEntries(rows.map((r) => [r.bld_id, r.label])) }));

console.log(JSON.stringify({ basis, review, blind, counts: result.counts, baseRate: result.baseRate, topK: result.topK, auc: result.auc, mean: result.mean, mw: result.mw }, null, 1));
