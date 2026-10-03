// VAL-01 기존 설치 건물 검증: 라벨 합의, 2인 일치율, 상위 k% 적중률, 점수 분포.
import type { Label, LabelRow } from "./labels";

export type Consensus = Label | "불일치";

export interface Ranked {
  bld_id: number;
  score: number;
}

export interface Validation {
  labelers: { name: string; count: number }[];
  imageYears: string[];
  /** 두 사람 이상이 본 건물 수, 그중 같은 표시를 한 비율, 코헨 카파(2인일 때) */
  overlap: number;
  agreement: number | null;
  kappa: number | null;
  conflicts: number[];
  candidates: number;
  labeled: number;
  counts: Record<Consensus, number>;
  /** 판정에 쓰는 건물(설치·미설치) 중 설치 비율 */
  baseRate: number | null;
  topK: { k: number; n: number; judged: number; installed: number; precision: number | null; lift: number | null; recall: number | null }[];
  /** 설치 건물이 미설치 건물보다 점수가 높을 확률(동점은 0.5) */
  auc: number | null;
  mean: { installed: number | null; notInstalled: number | null };
  bins: { from: number; to: number; installed: number; notInstalled: number }[];
}

/** 건물별 합의 라벨. 라벨러끼리 다르면 '불일치'(재검토 대상, 계산 제외) */
export function consensus(rows: LabelRow[]): Map<number, Consensus> {
  const by = new Map<number, Map<string, Label>>();
  for (const r of rows) {
    if (!by.has(r.bld_id)) by.set(r.bld_id, new Map());
    by.get(r.bld_id)!.set(r.labeler || "?", r.label); // 같은 라벨러가 두 번 적으면 뒤의 것
  }
  const out = new Map<number, Consensus>();
  for (const [id, m] of by) {
    const set = new Set(m.values());
    out.set(id, set.size === 1 ? [...set][0] : "불일치");
  }
  return out;
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (a: number[]) => (a.length ? round(a.reduce((x, y) => x + y, 0) / a.length, 1) : null);

function pairStats(rows: LabelRow[]) {
  const by = new Map<number, Map<string, Label>>();
  for (const r of rows) {
    if (!by.has(r.bld_id)) by.set(r.bld_id, new Map());
    by.get(r.bld_id)!.set(r.labeler || "?", r.label);
  }
  const shared = [...by.values()].filter((m) => m.size >= 2);
  if (!shared.length) return { overlap: 0, agreement: null, kappa: null };
  const agree = shared.filter((m) => new Set(m.values()).size === 1).length;
  const names = [...new Set(rows.map((r) => r.labeler || "?"))];
  let kappa: number | null = null;
  if (names.length === 2) {
    const pairs = shared.map((m) => [m.get(names[0])!, m.get(names[1])!] as const).filter(([a, b]) => a && b);
    const cats = [...new Set(pairs.flat())];
    const po = pairs.filter(([a, b]) => a === b).length / pairs.length;
    const pe = cats.reduce((s, c) => s + (pairs.filter(([a]) => a === c).length / pairs.length) * (pairs.filter(([, b]) => b === c).length / pairs.length), 0);
    kappa = pe === 1 ? 1 : round((po - pe) / (1 - pe));
  }
  return { overlap: shared.length, agreement: round(agree / shared.length), kappa };
}

/** ranked: 후보(30kW 이상 대상 건물)를 점수 높은 순으로 */
export function validate(rows: LabelRow[], ranked: Ranked[], ks: number[] = [0.1, 0.2, 0.3]): Validation {
  const cons = consensus(rows);
  const label = (id: number) => cons.get(id);
  const judged = ranked.filter((r) => label(r.bld_id) === "설치" || label(r.bld_id) === "미설치");
  const inst = judged.filter((r) => label(r.bld_id) === "설치");
  const not = judged.filter((r) => label(r.bld_id) === "미설치");
  const baseRate = judged.length ? round(inst.length / judged.length) : null;

  const counts: Record<Consensus, number> = { 설치: 0, 미설치: 0, 불명: 0, 불일치: 0 };
  for (const r of ranked) {
    const l = label(r.bld_id);
    if (l) counts[l] += 1;
  }

  const topK = ks.map((k) => {
    const n = Math.max(1, Math.ceil(ranked.length * k));
    const top = ranked.slice(0, n).filter((r) => label(r.bld_id) === "설치" || label(r.bld_id) === "미설치");
    const hit = top.filter((r) => label(r.bld_id) === "설치").length;
    const precision = top.length ? round(hit / top.length) : null;
    return { k, n, judged: top.length, installed: hit, precision, lift: precision !== null && baseRate ? round(precision / baseRate, 2) : null, recall: inst.length ? round(hit / inst.length) : null };
  });

  let auc: number | null = null;
  if (inst.length && not.length) {
    let wins = 0;
    for (const a of inst) for (const b of not) wins += a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
    auc = round(wins / (inst.length * not.length));
  }

  const bins = Array.from({ length: 8 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, installed: 0, notInstalled: 0 }));
  for (const r of judged) {
    const b = bins[Math.min(bins.length - 1, Math.floor(r.score / 10))];
    if (label(r.bld_id) === "설치") b.installed += 1;
    else b.notInstalled += 1;
  }

  const names = [...new Set(rows.map((r) => r.labeler || "?"))];
  return {
    labelers: names.map((name) => ({ name, count: new Set(rows.filter((r) => (r.labeler || "?") === name).map((r) => r.bld_id)).size })),
    imageYears: [...new Set(rows.map((r) => r.image_year).filter(Boolean))].sort(),
    ...pairStats(rows),
    conflicts: ranked.filter((r) => label(r.bld_id) === "불일치").map((r) => r.bld_id),
    candidates: ranked.length,
    labeled: ranked.filter((r) => label(r.bld_id)).length,
    counts,
    baseRate,
    topK,
    auc,
    mean: { installed: mean(inst.map((r) => r.score)), notInstalled: mean(not.map((r) => r.score)) },
    bins,
  };
}
