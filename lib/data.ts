// 정적 데이터(public/data) 로딩과 건물별 계산 결합.
import type { FeatureCollection } from "geojson";
import { calc, roofArea, summarize, type Assumptions, type Calc, type Roof, type Summary } from "./calc";
import { score, type Industry, type Score } from "./score";

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
}

export interface Building extends RawBuilding {
  roof: Roof;
  calc: Calc;
  score: Score;
  industry: Industry;
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
  meta: { source: string; base_date: string; built: string };
  buildings: Building[];
  byId: Map<number, Building>;
  geo: FeatureCollection;
  complexes: Complex[];
  complexGeo: FeatureCollection;
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
  const industry: Industry = null; // 등록공장 매칭(DAT-04) 후 채운다
  const s = score({ target: raw.target, calc: c, struct: raw.struct, aprYmd: raw.apr_ymd, industry }, baseYmd);
  return { ...raw, roof, calc: c, score: s, industry };
}

export async function loadDataset(unitCost?: number): Promise<Dataset> {
  const [attrs, geo, complexGeo] = await Promise.all([
    fetchJson<{ meta: Dataset["meta"]; buildings: RawBuilding[] }>("/data/buildings.json"),
    fetchGzipJson<FeatureCollection>("/data/buildings.geojson.gz"),
    fetchJson<FeatureCollection>("/data/complex.geojson"),
  ]);
  const baseYmd = attrs.meta.built.replaceAll("-", "");
  const buildings = attrs.buildings.map((b) => enrich(b, baseYmd, unitCost));
  const byId = new Map(buildings.map((b) => [b.bld_id, b]));
  for (const f of geo.features) {
    const b = byId.get(Number(f.properties?.bld_id));
    if (b) f.properties = { ...f.properties, tier: b.score.tier, pv_kw: b.calc.pv_kw, small: b.calc.small };
  }
  return { meta: attrs.meta, buildings, byId, geo, complexes: complexGeo.features.map((f) => f.properties as Complex), complexGeo };
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
