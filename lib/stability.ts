// AI-01 민감도: 가중치를 ±20% 무작위로 흔들어도 상위 10%에 남는 비율(순위 안정도).
import { WEIGHTS, type PartKey, type Score } from "./score";

export const STABILITY = { runs: 1000, spread: 0.2, top: 0.1, seed: 20261003 } as const;

/** 같은 입력이면 같은 결과가 나오도록 씨앗을 고정한 난수(mulberry32) */
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

export interface Candidate {
  id: number;
  score: Score;
  /** 동점일 때 순서를 정하는 값(설치용량) */
  tie: number;
}

export interface StabilityResult {
  /** 건물별 상위 10% 유지 비율(0~1) */
  byId: Map<number, number>;
  /** 후보 수, 상위 10% 동 수 */
  population: number;
  topCount: number;
  /** 기본 가중치에서 상위 10%인 건물들의 평균 유지 비율 */
  topMean: number;
  /** 그중 90% 이상 유지되는 건물 수 */
  topStable: number;
}

/** 후보(30kW 이상 대상 건물)만 넘긴다. */
export function rankStability(cands: Candidate[], opts: { runs?: number; seed?: number } = {}): StabilityResult {
  const runs = opts.runs ?? STABILITY.runs;
  const n = cands.length;
  const k = Math.max(1, Math.ceil(n * STABILITY.top));
  const keys = [...new Set(cands.flatMap((c) => Object.keys(c.score.parts) as PartKey[]))];
  // 항목별 득점률(0~1). 가중치를 바꿔도 득점률은 그대로다.
  const rate = cands.map((c) => keys.map((key) => (c.score.parts[key] ?? 0) / WEIGHTS[key]));
  const order = (w: number[]) =>
    cands
      .map((c, i) => ({ i, s: rate[i].reduce((a, r, j) => a + r * w[j], 0), tie: c.tie }))
      .sort((a, b) => b.s - a.s || b.tie - a.tie)
      .slice(0, k)
      .map((x) => x.i);

  const base = new Set(order(keys.map((key) => WEIGHTS[key])));
  const hits = new Array<number>(n).fill(0);
  const rand = rng(opts.seed ?? STABILITY.seed);
  for (let r = 0; r < runs; r++) {
    const w = keys.map((key) => WEIGHTS[key] * (1 - STABILITY.spread + 2 * STABILITY.spread * rand()));
    for (const i of order(w)) hits[i] += 1;
  }

  const byId = new Map(cands.map((c, i) => [c.id, hits[i] / runs]));
  const top = [...base].map((i) => hits[i] / runs);
  return {
    byId,
    population: n,
    topCount: k,
    topMean: top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0,
    topStable: top.filter((v) => v >= 0.9).length,
  };
}
