// 말로 찾기: 문장 → 필터 조건(JSON). 모델은 조건 변환만 하고 점수·순위 계산에는 쓰지 않는다.
// 모델 응답은 스키마로 강제한 뒤 여기서 다시 검사해 허용 값 밖은 버린다.
import { DEFAULT_FILTERS, GATE_OPTIONS, LAND_OPTIONS, STRUCT_OPTIONS, TIER_OPTIONS, INDUSTRY_OPTIONS, type Filters, type LandOwner, type StructClass, type IndustryClass } from "./filters";
import type { Gate, Tier } from "./score";

export const COMPLEX_NAMES = ["오창과학", "오창테크노폴리스", "오창3", "오창2"] as const;
export const SORT_OPTIONS = ["점수", "설치용량", "절감액", "필요 팩 수"] as const;
export const NL_MAX_CHARS = 200;
export const NL_EXAMPLES = ["오창과학 200kW 이상 내진설계 적용 공장", "복수 입주 아닌 설치 우선 건물", "법인 소유 500kW 이상"];

const arr = (items: readonly string[]) => ({ type: "array", items: { type: "string", enum: [...items] } });
const numOrNull = { type: ["number", "null"] };
const boolOrNull = { type: ["boolean", "null"] };

/** OpenAI structured output 스키마(strict) */
export const NL_SCHEMA = {
  name: "dasel_filter",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["complex", "tier", "gate", "industry", "struct", "kw_min", "kw_max", "ess_min", "seismic", "land_owner", "multi_tenant", "recent_permit", "sort", "ignored"],
    properties: {
      complex: arr(COMPLEX_NAMES),
      tier: arr(TIER_OPTIONS),
      gate: arr(GATE_OPTIONS),
      industry: arr(INDUSTRY_OPTIONS),
      struct: arr(STRUCT_OPTIONS),
      kw_min: numOrNull,
      kw_max: numOrNull,
      ess_min: numOrNull,
      seismic: { type: ["string", "null"], enum: ["적용", "미적용", null] },
      land_owner: arr(LAND_OPTIONS),
      multi_tenant: boolOrNull,
      recent_permit: boolOrNull,
      sort: { type: ["string", "null"], enum: [...SORT_OPTIONS, null] },
      ignored: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export const NL_SYSTEM = `오창 산업단지 공장 지붕 태양광 후보 목록의 검색 문장을 필터 JSON으로 바꾼다. 다른 일은 하지 않는다.
허용 값만 쓴다.
- complex(산단): ${COMPLEX_NAMES.join(", ")}
- tier(단계): ${TIER_OPTIONS.join(", ")}
- gate(안전 게이트): ${GATE_OPTIONS.join(", ")}
- industry(업종): ${INDUSTRY_OPTIONS.join(", ")}(다소비 업종 = 전력 다소비 업종)
- struct(구조): ${STRUCT_OPTIONS.join(", ")}(철근콘크리트 = 콘크리트, 철골조·경량철골 = 철골)
- kw_min·kw_max: 지붕 태양광 설치용량(kW). MW는 1000을 곱한다. "이상"은 kw_min, "이하·미만"은 kw_max
- ess_min: ESS 용량(kWh) 하한
- seismic: 내진설계 적용 여부(적용, 미적용)
- land_owner(토지 소유 구분): ${LAND_OPTIONS.join(", ")}(시·도유지 = 시 도유지, 국공유 = 국유지와 시 도유지와 군유지)
- multi_tenant: 한 건물에 등록공장 2곳 이상이면 true. "복수 입주 아닌·단독 입주"는 false
- recent_permit: 최근 5년 증축·대수선 허가 있음 true, 없음 false
- sort: ${SORT_OPTIONS.join(", ")}
말하지 않은 조건은 빈 배열 또는 null. 공장·건물·후보 같은 일반 명사는 조건이 아니다.
허용 값으로 바꿀 수 없는 표현(회사명, 지역명, 날씨, 업체 연락처 등)은 문장 조각 그대로 ignored에 넣는다. 추측해서 조건을 만들지 않는다.`;

export interface NlResult {
  complex: string[];
  filters: Filters;
  sort: (typeof SORT_OPTIONS)[number] | null;
  ignored: string[];
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => allowed.includes(x as T)))] : []);
const num = (v: unknown, max: number): number => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : 0);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** 모델 응답 검사: 스키마 밖 값은 버린다 */
export function toFilters(raw: unknown): NlResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f: Filters = {
    ...DEFAULT_FILTERS,
    tiers: pick<Tier>(o.tier, TIER_OPTIONS),
    gates: pick<Gate>(o.gate, GATE_OPTIONS),
    industries: pick<IndustryClass>(o.industry, INDUSTRY_OPTIONS),
    structs: pick<StructClass>(o.struct, STRUCT_OPTIONS),
    minKw: num(o.kw_min, 100_000),
    maxKw: num(o.kw_max, 100_000),
    minEss: num(o.ess_min, 1_000_000),
    seismic: o.seismic === "적용" || o.seismic === "미적용" ? o.seismic : null,
    landOwners: pick<LandOwner>(o.land_owner, LAND_OPTIONS),
    multi: bool(o.multi_tenant),
    recentPermit: bool(o.recent_permit),
  };
  if (f.maxKw && f.minKw > f.maxKw) f.maxKw = 0;
  const sort = SORT_OPTIONS.includes(o.sort as never) ? (o.sort as NlResult["sort"]) : null;
  const ignored = Array.isArray(o.ignored) ? o.ignored.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.slice(0, 40)).slice(0, 5) : [];
  return { complex: pick(o.complex, COMPLEX_NAMES), filters: f, sort, ignored };
}

export interface NlChip {
  key: string;
  label: string;
  /** 이 조건만 푼 필터 */
  clear: (f: Filters) => Filters;
}

const kw = (v: number) => v.toLocaleString("ko-KR");

/** 지금 적용된 조건을 칩으로(칩마다 x로 해제) */
export function chipsOf(f: Filters): NlChip[] {
  const out: NlChip[] = [];
  const list = <K extends "tiers" | "gates" | "industries" | "structs" | "landOwners">(k: K, label: (v: string) => string) => {
    for (const v of f[k] as string[]) out.push({ key: `${k}:${v}`, label: label(v), clear: (g) => ({ ...g, [k]: (g[k] as string[]).filter((x) => x !== v) }) });
  };
  list("tiers", (v) => v);
  list("gates", (v) => `게이트 ${v}`);
  list("industries", (v) => v);
  list("structs", (v) => `구조 ${v}`);
  if (f.minKw) out.push({ key: "minKw", label: `${kw(f.minKw)}kW 이상`, clear: (g) => ({ ...g, minKw: 0 }) });
  if (f.maxKw) out.push({ key: "maxKw", label: `${kw(f.maxKw)}kW 이하`, clear: (g) => ({ ...g, maxKw: 0 }) });
  if (f.minEss) out.push({ key: "minEss", label: `ESS ${kw(f.minEss)}kWh 이상`, clear: (g) => ({ ...g, minEss: 0 }) });
  if (f.seismic) out.push({ key: "seismic", label: `내진설계 ${f.seismic}`, clear: (g) => ({ ...g, seismic: null }) });
  list("landOwners", (v) => `토지 ${v}`);
  if (f.multi !== null) out.push({ key: "multi", label: f.multi ? "복수 입주" : "단독 입주", clear: (g) => ({ ...g, multi: null }) });
  if (f.recentPermit !== null) out.push({ key: "recentPermit", label: f.recentPermit ? "최근 증축 허가 있음" : "최근 증축 허가 없음", clear: (g) => ({ ...g, recentPermit: null }) });
  return out;
}

/** 서버: OpenAI 호출(키는 서버 환경변수에서만). 8초 제한 */
export async function callOpenAI(text: string, key: string, model: string, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<NlResult> {
  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0, max_completion_tokens: 400, response_format: { type: "json_schema", json_schema: NL_SCHEMA }, messages: [{ role: "system", content: NL_SYSTEM }, { role: "user", content: text }] }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const content = (await res.json()).choices?.[0]?.message?.content ?? "";
  return toFilters(JSON.parse(content));
}
