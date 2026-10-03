// 정적 데이터(public/data) 로딩과 건물별 계산 결합.
import type { FeatureCollection } from "geojson";
import { calc, roofArea, summarize, type Assumptions, type Calc, type Roof, type Summary } from "./calc";
import { score, type Industry, type Score } from "./score";
import { rankStability, type StabilityResult } from "./stability";

export interface RawBuilding {
  bld_id: number;
  pnu: string | null;
  addr: string | null;
  name: string | null;
  dong: string | null;
  use: string | null;
  struct: string | null;
  arch_area: number | null;
  geom_area: number;
  tot_area: number | null;
  apr_ymd: string | null;
  fl_up: number | null;
  h: number | null;
  complex_cd: string;
  complex_nm: string;
  target: boolean;
  flags: string[];
  companies?: Company[];
  industry?: Industry;
  dist_119_m?: number | null;
  roof_type?: string | null;
  reg_match?: "EXACT" | "DONG" | "AREA" | null;
}

export interface Company {
  company: string;
  product: string | null;
  industry: Industry;
  group: string | null;
  match: "CONTAIN" | "PNU";
}

export interface Building extends RawBuilding {
  roof: Roof;
  calc: Calc;
  score: Score;
  companies: Company[];
  industry: Industry;
  /** 가중치 ±20% 1,000회 중 상위 10%에 든 비율. 30kW 미만·대상 아님은 null */
  stability: number | null;
}

export interface Complex {
  complex_cd: string;
  complex_nm: string;
  targets: number;
  factories: number;
  status: "운영" | "조성 중";
  source: string;
}

export interface Dataset {
  meta: { source: string; base_date: string; built: string; factory_source?: string; register_source?: string };
  buildings: Building[];
  byId: Map<number, Building>;
  geo: FeatureCollection;
  complexes: Complex[];
  complexGeo: FeatureCollection;
  stationGeo: FeatureCollection | null;
  factories: Factory[];
  stability: StabilityResult;
  grid: Grid | null;
}

export interface GridLine {
  subst: string;
  dl: string;
  /** 선로·주변압기·변전소 여유 중 가장 작은 값(kW) */
  margin_kw: number;
  dl_margin_kw: number;
  dl_linked_kw: number;
}

/** DAT-09: 읍면동·리 단위 배전선로 여유용량(참고). 건물이 어느 선로에 물리는지는 알 수 없다. */
export interface Grid {
  meta: { source: string; fetched: string; unit: string };
  areas: Record<string, GridLine[]>;
}

export function gridOf(grid: Grid | null, addr: string | null): GridLine[] | null {
  const t = (addr ?? "").split(/\s+/);
  return (t.length >= 4 && grid?.areas[`${t[t.length - 3]} ${t[t.length - 2]}`]) || null;
}

export interface Factory {
  company: string;
  product: string | null;
  complex: string | null;
  addr: string;
  match: "CONTAIN" | "PNU" | "NONE";
  bld_ids: number[];
  lon?: number;
  lat?: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function fetchGzipJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} ${res.status}`);
  // 서버가 이미 풀어서 주는 경우(Content-Encoding: gzip)와 파일 그대로 주는 경우를 모두 처리
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

export function enrich(raw: RawBuilding, baseYmd: string, unitCost?: number, assumptions?: Partial<Assumptions>): Building {
  const roof = roofArea(raw.arch_area, raw.geom_area);
  const c = calc(roof.roof_m2, unitCost, assumptions);
  const industry: Industry = raw.industry ?? null;
  const s = score({ target: raw.target, calc: c, struct: raw.struct, aprYmd: raw.apr_ymd, industry }, baseYmd);
  return { ...raw, roof, calc: c, score: s, industry, companies: raw.companies ?? [], stability: null };
}

export async function loadDataset(unitCost?: number): Promise<Dataset> {
  const [attrs, geo, complexGeo, stationGeo, fac, grid] = await Promise.all([
    fetchJson<{ meta: Dataset["meta"]; buildings: RawBuilding[] }>("/data/buildings.json"),
    fetchGzipJson<FeatureCollection>("/data/buildings.geojson.gz"),
    fetchJson<FeatureCollection>("/data/complex.geojson"),
    fetchJson<FeatureCollection>("/data/station.geojson").catch(() => null),
    fetchJson<{ factories: Factory[] }>("/data/factories.json").catch(() => ({ factories: [] })),
    fetchJson<Grid>("/data/grid.json").catch(() => null),
  ]);
  const baseYmd = attrs.meta.built.replaceAll("-", "");
  const buildings = attrs.buildings.map((b) => enrich(b, baseYmd, unitCost));
  const byId = new Map(buildings.map((b) => [b.bld_id, b]));
  const stability = withStability(buildings);
  for (const f of geo.features) {
    const b = byId.get(Number(f.properties?.bld_id));
    if (b) f.properties = { ...f.properties, tier: b.score.tier, gate: b.score.gate, pv_kw: b.calc.pv_kw ?? -1, packs: b.calc.packs ?? -1, age: b.score.ageYears ?? -1 };
  }
  return { meta: attrs.meta, buildings, byId, geo, complexes: complexGeo.features.map((f) => f.properties as Complex), complexGeo, stationGeo, factories: fac.factories, stability, grid };
}

/** 30kW 이상 대상 건물을 후보로 순위 안정도를 계산해 각 건물에 붙인다. */
export function withStability(buildings: Building[]): StabilityResult {
  const cands = buildings.filter((b) => b.score.tier !== "제외" && b.calc.pv_kw !== null && !b.calc.small);
  const result = rankStability(cands.map((b) => ({ id: b.bld_id, score: b.score, tie: b.calc.pv_kw ?? 0 })));
  for (const b of buildings) b.stability = result.byId.get(b.bld_id) ?? null;
  return result;
}

/** 운영 중 산단의 대상 건물 합계. complexCd가 있으면 그 산단만. */
export function summaryOf(ds: Dataset, complexCd?: string | null): Summary {
  const open = new Set(ds.complexes.filter((c) => c.status === "운영").map((c) => c.complex_cd));
  return summarize(ds.buildings.filter((b) => open.has(b.complex_cd) && (!complexCd || b.complex_cd === complexCd)));
}

/** 적합도 1순위: 설치 우선 중 점수가 가장 높은 건물(동점이면 용량 큰 쪽). */
export function topBuilding(ds: Dataset, complexCd?: string | null): Building | null {
  const list = ds.buildings.filter((b) => b.score.tier === "설치 우선" && (!complexCd || b.complex_cd === complexCd));
  list.sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0));
  return list[0] ?? null;
}

/** 단가가 바뀌면 건물별 계산만 다시 한다(지도 도형은 그대로). */
export function reprice(ds: Dataset, unitCost: number): Dataset {
  const baseYmd = ds.meta.built.replaceAll("-", "");
  // 단가는 점수에 영향을 주지 않으므로 안정도는 그대로 옮긴다
  const buildings = ds.buildings.map((b) => ({ ...enrich(b, baseYmd, unitCost), stability: b.stability }));
  return { ...ds, buildings, byId: new Map(buildings.map((b) => [b.bld_id, b])) };
}
