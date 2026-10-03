// 포스터 차트용 숫자를 한 파일(public/data/poster_numbers.json)로 만든다.
// 실행: npx tsx scripts/analysis/build_numbers.ts
// 계산은 화면과 같은 코드(lib/data.ts enrich·withStability, lib/calc.ts summarize)를 그대로 쓴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { enrich, withStability, type RawBuilding } from "../../lib/data";
import { summarize } from "../../lib/calc";
import { STABILITY } from "../../lib/stability";
import { WEIGHTS, maxAvailable, type PartKey } from "../../lib/score";

const OUT = "public/data/poster_numbers.json";
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

const doc = readJson<{ meta: Record<string, string>; buildings: RawBuilding[] }>("public/data/buildings.json");
const labelsDoc = existsSync("public/data/labels.json")
  ? readJson<{ meta: Record<string, unknown>; labels: Record<string, string> }>("public/data/labels.json")
  : null;
const baseYmd = doc.meta.built.replaceAll("-", "");
const blds = doc.buildings.map((b) => enrich(b, baseYmd));
const installed = (id: number) => labelsDoc?.labels[String(id)] === "설치";
type Status = "설치 우선" | "검토" | "보류" | "이미 설치됨";
const STATUSES: Status[] = ["설치 우선", "검토", "보류", "이미 설치됨"];
const statusOf = (b: (typeof blds)[number]): Status => (installed(b.bld_id) ? "이미 설치됨" : (b.score.tier as Status));

// ① 용량 분포 ------------------------------------------------------------
const cands = blds.filter((b) => b.target && b.calc.pv_kw !== null && !b.calc.small);
const sorted = [...cands].sort((a, b) => (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0));
const totalKw = sorted.reduce((a, b) => a + (b.calc.pv_kw ?? 0), 0);
let acc = 0;
const cum = sorted.map((b) => {
  acc += b.calc.pv_kw ?? 0;
  return round(acc / totalKw, 4);
});
const nFor = (share: number) => cum.findIndex((c) => c >= share) + 1;
const EDGES = [30, 100, 200, 500, 1000, Infinity];
const histogram = EDGES.slice(0, -1).map((from, i) => {
  const to = EDGES[i + 1];
  const inBin = sorted.filter((b) => (b.calc.pv_kw ?? 0) >= from && (b.calc.pv_kw ?? 0) < to);
  const kw = inBin.reduce((a, b) => a + (b.calc.pv_kw ?? 0), 0);
  return { from, to: Number.isFinite(to) ? to : null, label: Number.isFinite(to) ? `${from}~${to}kW` : `${from}kW 이상`, count: inBin.length, kw: round(kw, 1), share_kw: round(kw / totalKw, 4) };
});
const sum = summarize(blds);
const capacity = {
  count: sorted.length,
  total_kw: round(totalKw, 1),
  total_mw: round(totalKw / 1000, 2),
  summarize_mw: sum.mw, // lib/calc.ts summarize 와 같은 값인지 대조용
  pv_kw: sorted.map((b) => b.calc.pv_kw),
  cum_share: cum,
  status: sorted.map(statusOf),
  n_for_50pct: nFor(0.5),
  n_for_80pct: nFor(0.8),
  share_of_n_for_50pct: round(nFor(0.5) / sorted.length, 4),
  top10pct: { n: Math.ceil(sorted.length * 0.1), share_kw: cum[Math.ceil(sorted.length * 0.1) - 1] },
  median_kw: sorted[Math.floor(sorted.length / 2)].calc.pv_kw,
  max_kw: sorted[0].calc.pv_kw,
  histogram,
};

// ② 산단별 단계 ----------------------------------------------------------
const targets = blds.filter((b) => b.target);
const complexNames = [...new Set(targets.map((b) => b.complex_nm))];
const tiersByComplex = complexNames
  .map((nm) => {
    const list = targets.filter((b) => b.complex_nm === nm);
    const counts = Object.fromEntries(STATUSES.map((s) => [s, list.filter((b) => statusOf(b) === s).length])) as Record<Status, number>;
    return {
      complex_nm: nm,
      total: list.length,
      counts,
      // 보류 중 30kW 미만(또는 면적 없음)이라 보류인 동 수
      hold_small: list.filter((b) => statusOf(b) === "보류" && (b.calc.pv_kw === null || b.calc.small)).length,
      candidates_30kw: list.filter((b) => b.calc.pv_kw !== null && !b.calc.small).length,
    };
  })
  .sort((a, b) => b.total - a.total);
const tierTotal = Object.fromEntries(STATUSES.map((s) => [s, tiersByComplex.reduce((a, c) => a + c.counts[s], 0)]));

// ③ 청주 산업용 평균판매단가 (app/api/tariff/route.ts 와 같은 호출) --------
const ENDPOINT = "https://bigdata.kepco.co.kr/openapi/v1/powerUsage/contractType.do";
function envKey(): string | null {
  if (!existsSync(".env.local")) return null;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*KEPCO_API_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "") || null;
  }
  return null;
}
async function monthCost(key: string, year: number, month: number): Promise<{ cost: number | null; note: string | null }> {
  const q = new URLSearchParams({ year: String(year), month: String(month).padStart(2, "0"), metroCd: "43", cityCd: "110", cntrCd: "", apiKey: key, returnType: "json" });
  try {
    const res = await fetch(`${ENDPOINT}?${q}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) return { cost: null, note: `HTTP ${res.status}` };
    const rows: { cntr?: string; unitCost?: number | string }[] = (await res.json()).data ?? [];
    if (!rows.length) return { cost: null, note: "자료 없음(빈 응답)" };
    const cost = Number(rows.find((r) => r.cntr === "산업용")?.unitCost);
    return cost >= 100 && cost <= 300 ? { cost, note: null } : { cost: null, note: "산업용 행 없음 또는 범위 밖" };
  } catch (e) {
    return { cost: null, note: `호출 실패: ${(e as Error).name}` };
  }
}
async function tariff() {
  const key = envKey();
  const now = new Date();
  // 최근 18개월을 조회해, 아직 공개되지 않은 최신 달(앞쪽 null)을 빼고 13개월을 쓴다
  const months = Array.from({ length: 18 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 1));
  const got: { month: string; cost: number | null; note: string | null }[] = [];
  for (const d of months) {
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!key) {
      got.push({ month: ym, cost: null, note: "KEPCO_API_KEY 없음" });
      continue;
    }
    let r = await monthCost(key, d.getFullYear(), d.getMonth() + 1);
    if (r.cost === null && r.note?.startsWith("호출 실패")) r = await monthCost(key, d.getFullYear(), d.getMonth() + 1);
    got.push({ month: ym, ...r });
    console.log(`  단가 ${ym}: ${r.cost ?? "null"}${r.note ? ` (${r.note})` : ""}`);
  }
  const first = got.findIndex((g) => g.cost !== null);
  const window = (first < 0 ? got.slice(0, 13) : got.slice(first, first + 13)).reverse();
  const valid = window.filter((w) => w.cost !== null).map((w) => w.cost as number);
  return {
    region: "충청북도 청주시(metroCd 43, cityCd 110)",
    contract: "산업용",
    unit: "원/kWh",
    months: window.map((w) => ({ month: w.month, unit_cost: w.cost, note: w.note })),
    not_yet_published: first > 0 ? got.slice(0, first).map((g) => g.month).reverse() : [],
    failed: window.filter((w) => w.cost === null).map((w) => w.month),
    latest: first < 0 ? null : { month: got[first].month, unit_cost: got[first].cost },
    min: valid.length ? Math.min(...valid) : null,
    max: valid.length ? Math.max(...valid) : null,
    mean: valid.length ? round(valid.reduce((a, b) => a + b, 0) / valid.length, 1) : null,
  };
}

// ④ 검증: data/quality/validation.json 통째로 ----------------------------
const validation = existsSync("data/quality/validation.json") ? readJson<Record<string, unknown>>("data/quality/validation.json") : null;

// ⑤ 민감도 ---------------------------------------------------------------
// 상위 10% 유지율은 lib 의 withStability 결과를 그대로 쓴다.
const stab = withStability(blds);
// 스피어만은 lib/stability.ts 와 같은 난수(mulberry32, 같은 시드·spread·호출 순서)로 여기서 계산한다.
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
function sensitivity() {
  // withStability 와 같은 후보·같은 순서
  const cs = blds.filter((b) => b.score.tier !== "제외" && b.calc.pv_kw !== null && !b.calc.small).map((b) => ({ id: b.bld_id, score: b.score, tie: b.calc.pv_kw ?? 0 }));
  const n = cs.length;
  const k = Math.max(1, Math.ceil(n * STABILITY.top));
  const keys = [...new Set(cs.flatMap((c) => Object.keys(c.score.parts) as PartKey[]))];
  const rate = cs.map((c) => keys.map((key) => (c.score.parts[key] ?? 0) / WEIGHTS[key]));
  const order = (w: number[]) =>
    cs
      .map((c, i) => ({ i, s: rate[i].reduce((a, r, j) => a + r * w[j], 0), tie: c.tie }))
      .sort((a, b) => b.s - a.s || b.tie - a.tie)
      .map((x) => x.i);
  const rankOf = (ord: number[]) => {
    const r = new Array<number>(n);
    ord.forEach((i, pos) => (r[i] = pos + 1));
    return r;
  };
  const baseOrder = order(keys.map((key) => WEIGHTS[key]));
  const baseRank = rankOf(baseOrder);
  const baseTop = baseOrder.slice(0, k);
  const hits = new Array<number>(n).fill(0);
  const rand = rng(STABILITY.seed);
  const rhos: number[] = [];
  for (let r = 0; r < STABILITY.runs; r++) {
    const w = keys.map((key) => WEIGHTS[key] * (1 - STABILITY.spread + 2 * STABILITY.spread * rand()));
    const ord = order(w);
    for (const i of ord.slice(0, k)) hits[i] += 1;
    const rk = rankOf(ord);
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (rk[i] - baseRank[i]) ** 2;
    rhos.push(1 - (6 * d2) / (n * (n * n - 1)));
  }
  const asc = [...rhos].sort((a, b) => a - b);
  const q = (p: number) => {
    const pos = (asc.length - 1) * p;
    const lo = Math.floor(pos);
    return asc[lo] + (asc[Math.min(lo + 1, asc.length - 1)] - asc[lo]) * (pos - lo);
  };
  const topRet = baseTop.map((i) => hits[i] / STABILITY.runs);
  const myMean = topRet.reduce((a, b) => a + b, 0) / topRet.length;
  return {
    runs: STABILITY.runs,
    spread: STABILITY.spread,
    seed: STABILITY.seed,
    weights: Object.fromEntries(keys.map((key) => [key, WEIGHTS[key]])),
    max_score: maxAvailable(),
    population: stab.population,
    top_count: stab.topCount,
    top_mean_retention: round(stab.topMean, 4),
    top_stable_90: stab.topStable,
    top_stable_share: round(stab.topStable / stab.topCount, 4),
    // 기본 순위 상위 10% 건물별 유지율(기본 순위 순, 번호만)
    top_retention: topRet.map((v) => round(v, 3)),
    spearman: {
      method: "기본 순위와 매 회 순위(점수 내림차순, 동점은 설치용량 큰 순)의 순위 상관",
      mean: round(rhos.reduce((a, b) => a + b, 0) / rhos.length, 4),
      min: round(asc[0], 4),
      p05: round(q(0.05), 4),
      median: round(q(0.5), 4),
      max: round(asc[asc.length - 1], 4),
      values: rhos.map((v) => round(v, 4)),
    },
    // 이 스크립트의 재현이 lib 결과와 같은지(같아야 난수 순서가 일치한 것)
    replication_matches_lib: Math.abs(myMean - stab.topMean) < 1e-12 && topRet.filter((v) => v >= 0.9).length === stab.topStable,
  };
}

async function main() {
  const sens = sensitivity();
  console.log("단가 조회 중…");
  const tar = await tariff();
  const d = new Date();
  const generated = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const out = {
    meta: {
      generated,
      buildings_base_date: doc.meta.base_date,
      buildings_built: doc.meta.built,
      labels: labelsDoc?.meta ?? null,
      sources: {
        capacity: `${doc.meta.source}(기준일 ${doc.meta.base_date}) · ${doc.meta.register_source ?? "건축물대장"} — 지붕면적×이용률÷kW당 면적(lib/calc.ts 기본 가정), 30kW 이상 대상 건물`,
        tiers_by_complex: `설치 적합도 점수(lib/score.ts, ${maxAvailable()}점 만점) 단계 · '이미 설치됨'은 위성영상 판독 라벨(public/data/labels.json, basis=${String(labelsDoc?.meta?.basis ?? "없음")})`,
        tariff: "한전 전력데이터 개방포털 계약종별 전력사용량(청주시 산업용 평균판매단가)",
        validation: "data/quality/validation.json (scripts/06_validate.ts 산출)",
        sensitivity: `lib/stability.ts — 가중치 ±${STABILITY.spread * 100}% 균등 난수 ${STABILITY.runs}회, 시드 ${STABILITY.seed}`,
      },
    },
    capacity,
    tiers_by_complex: { statuses: STATUSES, complexes: tiersByComplex, total: tierTotal, targets: targets.length },
    tariff: tar,
    validation,
    sensitivity: sens,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
  console.log(JSON.stringify({
    out: OUT,
    capacity: { count: capacity.count, total_mw: capacity.total_mw, summarize_mw: capacity.summarize_mw, n50: capacity.n_for_50pct, n80: capacity.n_for_80pct, top10: capacity.top10pct, histogram: histogram.map((h) => `${h.label}:${h.count}동/${h.kw}kW`) },
    tiers: tiersByComplex, tierTotal,
    tariff: { months: tar.months.map((m) => `${m.month}:${m.unit_cost}`), failed: tar.failed, not_yet_published: tar.not_yet_published },
    sensitivity: { ...sens, top_retention: undefined, spearman: { ...sens.spearman, values: undefined } },
  }, null, 1));
}
main();
