// 재사용 배터리 ESS 집계. 실행: npx tsx scripts/analysis/battery.ts → data/quality/battery.json
// 산식은 lib/calc.ts·lib/data.ts·lib/chips.ts·lib/constants.ts 를 그대로 부른다(여기서 새로 만들지 않는다).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { kwhPerPack, normalize, type Assumptions } from "../../lib/calc";
import { essSpace } from "../../lib/chips";
import { BATTERY_OUTLOOK, CONSTANTS as C, peakSpread, TARIFF } from "../../lib/constants";
import { enrich, type Building, type RawBuilding } from "../../lib/data";

const TIERS = ["설치 우선", "검토"] as const;
type Tier = (typeof TIERS)[number];
const SITES = ["부지 여유", "옥내 검토(충전율 80%)", "대지면적 정보 없음"] as const;
type Site = (typeof SITES)[number];

const doc = JSON.parse(readFileSync("public/data/buildings.json", "utf8")) as { meta: { source: string; base_date: string; built: string; register_source?: string }; buildings: RawBuilding[] };
const labelDoc = JSON.parse(readFileSync("public/data/labels.json", "utf8")) as { meta: { basis?: string; generated: string }; labels: Record<string, string> };
for (const b of doc.buildings) if (labelDoc.labels[String(b.bld_id)] === "설치") b.installed = true;
const baseYmd = doc.meta.built.replaceAll("-", "");

const run = (a?: Partial<Assumptions>) => new Map(doc.buildings.map((b) => [b.bld_id, enrich(b, baseYmd, undefined, a)]));
const base = run();
const onlyA = run({ aRatio: 1 });
const onlyB = run({ aRatio: 0 });
const inBase = run({ indoor: 1 });
const inA = run({ indoor: 1, aRatio: 1 });
const inB = run({ indoor: 1, aRatio: 0 });

const siteOf = (b: Building): Site => {
  const sp = essSpace(b);
  if (sp === null) return "대지면적 정보 없음";
  return sp.units >= (b.calc.ess_units ?? 0) ? "부지 여유" : "옥내 검토(충전율 80%)";
};

const all = [...base.values()];
const tierAll: Record<string, number> = {};
for (const b of all) tierAll[b.score.tier] = (tierAll[b.score.tier] ?? 0) + 1;

const packs = (m: Map<number, Building>, list: Building[]) => list.reduce((s, b) => s + (m.get(b.bld_id)!.calc.packs ?? 0), 0);
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

function agg(list: Building[]) {
  const site: Record<Site, number> = { "부지 여유": 0, "옥내 검토(충전율 80%)": 0, "대지면적 정보 없음": 0 };
  for (const b of list) site[siteOf(b)] += 1;
  const indoor = list.filter((b) => siteOf(b) === "옥내 검토(충전율 80%)");
  const outdoor = list.filter((b) => siteOf(b) !== "옥내 검토(충전율 80%)");
  return {
    buildings: list.length,
    ess_kwh: round(list.reduce((s, b) => s + (b.calc.ess_kwh ?? 0), 0), 1),
    ess_units: list.reduce((s, b) => s + (b.calc.ess_units ?? 0), 0),
    packs: { base: packs(base, list), a_only: packs(onlyA, list), b_only: packs(onlyB, list) },
    ess_save_won: list.reduce((s, b) => s + (b.calc.ess_save ?? 0), 0),
    site,
    site_share: Object.fromEntries(SITES.map((k) => [k, list.length ? round(site[k] / list.length, 4) : null])),
    indoor_review: {
      buildings: indoor.length,
      ess_kwh: round(indoor.reduce((s, b) => s + (b.calc.ess_kwh ?? 0), 0), 1),
      // 같은 건물을 옥외(상한 90%)로 계산했을 때와 옥내(상한 80%)로 다시 계산했을 때의 팩 수
      packs_outdoor: { base: packs(base, indoor), a_only: packs(onlyA, indoor), b_only: packs(onlyB, indoor) },
      packs_indoor: { base: packs(inBase, indoor), a_only: packs(inA, indoor), b_only: packs(inB, indoor) },
    },
    // 옥내 검토 건물만 옥내 가정으로 바꾸고 나머지는 옥외 그대로 둔 합계
    packs_site_adjusted: {
      base: packs(base, outdoor) + packs(inBase, indoor),
      a_only: packs(onlyA, outdoor) + packs(inA, indoor),
      b_only: packs(onlyB, outdoor) + packs(inB, indoor),
    },
  };
}

const byTier = Object.fromEntries(
  TIERS.map((t) => {
    const inTier = all.filter((b) => b.score.tier === t);
    const list = inTier.filter((b) => b.calc.ess_kwh !== null);
    return [t, { tier_buildings: inTier.length, no_ess: inTier.length - list.length, ...agg(list) }];
  }),
) as Record<Tier, ReturnType<typeof agg> & { tier_buildings: number; no_ess: number }>;
const targets = all.filter((b) => (TIERS as readonly string[]).includes(b.score.tier) && b.calc.ess_kwh !== null);
const total = agg(targets);

// 참고: 한 필지에 대상 건물이 여러 동이면 공지를 함께 쓴다(essSpace 는 건물 단위라 이를 보지 않음)
const byPnu = new Map<string, { need: number; fit: number; n: number }>();
for (const b of targets) {
  const sp = essSpace(b);
  if (!sp || !b.pnu) continue;
  const e = byPnu.get(b.pnu) ?? { need: 0, fit: sp.units, n: 0 };
  e.need += b.calc.ess_units ?? 0;
  e.n += 1;
  byPnu.set(b.pnu, e);
}
const shared = [...byPnu.values()].filter((e) => e.n > 1);

// 충북 2030 발생 전망: app/sim/page.tsx CHT-02 와 같은 식
const supply = Math.round(BATTERY_OUTLOOK.nationwide2030 * BATTERY_OUTLOOK.chungbukShare);
const pct = (v: number) => round((v / supply) * 100, 1);
const ratio = (p: { base: number; a_only: number; b_only: number }) => ({ base_pct: pct(p.base), a_only_pct: pct(p.a_only), b_only_pct: pct(p.b_only) });

const out = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    buildings_source: doc.meta.source,
    buildings_base_date: doc.meta.base_date,
    buildings_built: doc.meta.built,
    score_base_ymd: baseYmd,
    register_source: doc.meta.register_source ?? null,
    labels: { basis: labelDoc.meta.basis ?? null, generated: labelDoc.meta.generated },
    stage_note: "현장·구조검토 전 1차 추정값. 재사용 팩의 실제 등급·수량은 성능평가 뒤에 정해진다.",
    scope: "public/data/buildings.json 전체 건물 중 단계가 '설치 우선' 또는 '검토'이고 ESS 를 산정하는 건물(calc.ess_kwh !== null, 태양광 30kW 이상)",
    formulas: {
      tier: "lib/data.ts enrich() → lib/score.ts score(). labels.json 이 '설치'인 건물은 '이미 설치됨'으로 먼저 분류",
      ess_kwh: `lib/calc.ts calc(): min(태양광 kW × 저장 시간 ${C.ESS_HOURS.value}h, 분산 단위 상한 ${C.ESS_UNIT_MAX.value}kWh × 시범 단위 수 ${C.ESS_UNITS.value}). 태양광 ${C.PV_MIN_KW.value}kW 미만은 산정하지 않음`,
      ess_units: `ceil(ess_kwh ÷ ${C.ESS_UNIT_MAX.value}kWh)`,
      kwh_per_pack: `lib/calc.ts kwhPerPack(): 팩 정격 ${C.PACK_KWH.value}kWh × (A비율×${C.SOH_A.value} + B비율×${C.SOH_B.value}) × (충전율 상한 − ${C.SOC_MIN.value})`,
      packs: "건물별 ceil(ess_kwh ÷ 팩당 사용 가능 용량)의 합",
      ess_save: `ess_kwh × 왕복 효율 ${C.ESS_EFF.value} × 운영일 ${C.ESS_DAYS.value}일 × 최대부하−경부하 단가차 ${peakSpread()}원/kWh(${TARIFF.name}, ${TARIFF.source}, ${TARIFF.asOf}). 기본요금 절감은 넣지 않음`,
      site: `lib/chips.ts essSpace(): 필지 공지(대지면적 − 건물 바닥면적 합) ÷ 단위당 ${C.ESS_UNIT_AREA.value}㎡ 를 내림한 단위 수가 ess_units 이상이면 '부지 여유', 모자라면 '옥내 검토(충전율 80%)', 대지면적을 모르면 '대지면적 정보 없음'`,
      indoor: `'옥내 검토' 건물은 enrich 가정 { indoor: 1 } 로 다시 계산(충전율 상한 ${C.SOC_MAX_INDOOR.value}, 옥외는 ${C.SOC_MAX.value})`,
      outlook: "app/sim/page.tsx CHT-02 와 같은 식: round(전국 2030 전망 × 충북 전기차 등록 비중)",
    },
    kwh_per_pack: {
      outdoor: { base: kwhPerPack(normalize()), a_only: kwhPerPack(normalize({ aRatio: 1 })), b_only: kwhPerPack(normalize({ aRatio: 0 })) },
      indoor: { base: kwhPerPack(normalize({ indoor: 1 })), a_only: kwhPerPack(normalize({ indoor: 1, aRatio: 1 })), b_only: kwhPerPack(normalize({ indoor: 1, aRatio: 0 })) },
    },
    constants: Object.fromEntries(
      (["ESS_HOURS", "ESS_UNIT_MAX", "ESS_UNITS", "PV_MIN_KW", "PACK_KWH", "SOH_A", "SOH_B", "A_RATIO", "SOC_MAX", "SOC_MAX_INDOOR", "SOC_MIN", "ESS_EFF", "ESS_DAYS", "ESS_UNIT_AREA"] as const).map((k) => [k, C[k]]),
    ),
  },
  tiers_all: tierAll,
  by_tier: byTier,
  total,
  parcel_note: {
    note: "참고(프로젝트 산식 밖의 단순 점검): essSpace 는 건물 단위라 같은 필지의 대상 건물이 공지를 나눠 쓰는 경우를 보지 않는다",
    parcels_with_multiple_targets: shared.length,
    buildings_on_those_parcels: shared.reduce((s, e) => s + e.n, 0),
    parcels_short_when_shared: shared.filter((e) => e.fit < e.need).length,
  },
  outlook: {
    estimate: true,
    label: "추정",
    nationwide_2030: BATTERY_OUTLOOK.nationwide2030,
    nationwide_source: BATTERY_OUTLOOK.nationwideSource,
    ev_nationwide: BATTERY_OUTLOOK.evNationwide,
    ev_chungbuk: BATTERY_OUTLOOK.evChungbuk,
    chungbuk_share: BATTERY_OUTLOOK.chungbukShare,
    chungbuk_source: BATTERY_OUTLOOK.chungbukSource,
    chungbuk_2030: supply,
    formula: `충북 전망 = round(전국 2030년 ${BATTERY_OUTLOOK.nationwide2030}개 × 충북 전기차 등록 비중 ${BATTERY_OUTLOOK.evChungbuk}/${BATTERY_OUTLOOK.evNationwide})`,
    caveat: "전국 전망은 보도 재인용이라 '추정'으로 표시한다. 발생한 배터리가 모두 재사용 등급을 받는 것은 아니다.",
    need_vs_outlook: {
      ...Object.fromEntries(TIERS.map((t) => [t, ratio(byTier[t].packs)])),
      total: ratio(total.packs),
      total_site_adjusted: ratio(total.packs_site_adjusted),
    },
  },
};

mkdirSync("data/quality", { recursive: true });
writeFileSync("data/quality/battery.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ tiers_all: tierAll, by_tier: byTier, total, parcel_note: out.parcel_note, supply, need_vs_outlook: out.outlook.need_vs_outlook, kwh_per_pack: out.meta.kwh_per_pack }, null, 1));
