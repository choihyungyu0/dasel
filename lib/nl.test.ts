// 말로 찾기 고정 케이스 10건. OpenAI 호출은 mock(모델 응답을 고정)하고, 검증·변환 결과를 기대 필터와 비교한다.
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type Filters } from "./filters";
import { callOpenAI, chipsOf, NL_SCHEMA } from "./nl";

const empty = { top_n: null, top_basis: null, complex: [], tier: [], gate: [], industry: [], struct: [], kw_min: null, kw_max: null, ess_min: null, seismic: null, land_owner: [], multi_tenant: null, recent_permit: null, sort: null, ignored: [] };

const CASES: { text: string; model: Record<string, unknown>; complex: string[]; filters: Partial<Filters>; ignored?: string[] }[] = [
  { text: "오창과학 200kW 이상 내진설계 적용 공장", model: { complex: ["오창과학"], kw_min: 200, seismic: "적용" }, complex: ["오창과학"], filters: { minKw: 200, seismic: "적용" } },
  { text: "복수 입주 아닌 설치 우선 건물", model: { tier: ["설치 우선"], multi_tenant: false }, complex: [], filters: { tiers: ["설치 우선"], multi: false } },
  { text: "법인 소유 500kW 이상", model: { land_owner: ["법인"], kw_min: 500 }, complex: [], filters: { landOwners: ["법인"], minKw: 500 } },
  { text: "1MW 넘는 철근콘크리트 공장", model: { kw_min: 1000, struct: ["콘크리트"] }, complex: [], filters: { minKw: 1000, structs: ["콘크리트"] } },
  { text: "오창2 검토 단계 중 게이트 통과", model: { complex: ["오창2"], tier: ["검토"], gate: ["통과"] }, complex: ["오창2"], filters: { tiers: ["검토"], gates: ["통과"] } },
  { text: "최근 증축한 적 없는 다소비 업종", model: { recent_permit: false, industry: ["다소비 업종"] }, complex: [], filters: { recentPermit: false, industries: ["다소비 업종"] } },
  { text: "100kW 이상 300kW 이하 국공유지", model: { kw_min: 100, kw_max: 300, land_owner: ["국유지", "시 도유지", "군유지"] }, complex: [], filters: { minKw: 100, maxKw: 300, landOwners: ["국유지", "시 도유지", "군유지"] } },
  { text: "ESS 500kWh 이상 내진 미적용", model: { ess_min: 500, seismic: "미적용" }, complex: [], filters: { minEss: 500, seismic: "미적용" } },
  { text: "용량 큰 상위 30동", model: { top_n: 30, top_basis: "용량", sort: "설치용량" }, complex: [], filters: { topKw: 30 } },
  // 허용 값 밖(오창5, 최우선, 음수 용량)은 버린다
  { text: "오창5 최우선 -50kW", model: { complex: ["오창5"], tier: ["최우선"], kw_min: -50, ignored: ["오창5", "최우선"] }, complex: [], filters: {}, ignored: ["오창5", "최우선"] },
  // 조건이 아닌 표현은 ignored로
  { text: "유한양행 근처 맛집", model: { ignored: ["유한양행 근처 맛집"] }, complex: [], filters: {}, ignored: ["유한양행 근처 맛집"] },
];

const mockFetch = (content: unknown) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 })) as unknown as typeof fetch;

describe("말로 찾기 10건(OpenAI mock)", () => {
  for (const c of CASES) {
    it(c.text, async () => {
      const r = await callOpenAI(c.text, "test", "gpt-4.1", AbortSignal.timeout(1000), mockFetch({ ...empty, ...c.model }));
      expect(r.complex).toEqual(c.complex);
      expect(r.filters).toEqual({ ...DEFAULT_FILTERS, ...c.filters });
      expect(r.ignored).toEqual(c.ignored ?? []);
    });
  }
  it("스키마는 strict, 모든 키 필수", () => {
    expect(NL_SCHEMA.strict).toBe(true);
    expect([...NL_SCHEMA.schema.required].sort()).toEqual(Object.keys(NL_SCHEMA.schema.properties).sort());
  });
  it("칩 x는 그 조건만 푼다", () => {
    const f = { ...DEFAULT_FILTERS, minKw: 200, seismic: "적용" as const };
    const chips = chipsOf(f);
    expect(chips.map((c) => c.label)).toEqual(["200kW 이상", "내진설계 적용"]);
    expect(chips[0].clear(f)).toEqual({ ...DEFAULT_FILTERS, seismic: "적용" });
  });
  it("응답 오류는 예외", async () => {
    const bad = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(callOpenAI("x", "k", "m", AbortSignal.timeout(1000), bad)).rejects.toThrow();
  });
});
