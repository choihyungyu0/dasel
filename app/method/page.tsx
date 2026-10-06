import { readFileSync } from "node:fs";
import path from "node:path";
import AppHeader from "@/components/AppHeader";
import { CONSTANTS, HAZMAT_CHIP_P0, SUBSIDY_BADGE, peakSpread, REVIEW_BADGE, TARIFF } from "@/lib/constants";
import { enrich, withStability, type RawBuilding } from "@/lib/data";
import rules from "@/config/complex_rules.json";
import { maxAvailable, WEIGHTS } from "@/lib/score";
import { STABILITY } from "@/lib/stability";
import type { Validation } from "@/lib/validate";

export const metadata = { title: "산정 기준 | 다셀" };

const read = <T,>(file: string): T => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8"));
const n = (v: number, d = 0) => v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });

interface BuildingQ { meta: { base_date: string }; source_total: number; clipped: number; target_use: string[]; by_complex: { complex_nm: string; buildings: number }[] }
interface FactoryQ { factories: number; match: Record<"CONTAIN" | "PNU" | "NONE", number>; geocode_fail: number; target: number; target_with_company: number; target_use_null: number; stations: { total: number; geocoded: number } }
interface RegisterQ { lots: number; buildings: number; matched: Record<string, number>; reg_null: number; match_rate: number; target_after: number; null_after: Record<string, number> }

function keywords(): { group: string; ksic: string; words: string[] }[] {
  const lines = readFileSync(path.join(process.cwd(), "config/industry_keywords.csv"), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1);
  const out = new Map<string, { group: string; ksic: string; words: string[] }>();
  for (const line of lines) {
    const [group, ksic, word] = line.split(",");
    if (!out.has(group)) out.set(group, { group, ksic, words: [] });
    out.get(group)!.words.push(word);
  }
  return [...out.values()];
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 surface bg-white p-4">
      <h2 className="mb-2 text-[15px] font-semibold">{title}</h2>
      <div className="space-y-2 text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

function Table({ id, head, rows }: { id?: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table id={id} className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead className="bg-slate-100 text-left text-xs text-slate-600">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">{r.map((c, j) => <td key={j} className={`px-2 py-1.5 ${typeof c === "number" ? "num text-right" : ""}`}>{typeof c === "number" ? n(c) : c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const F = ({ children }: { children: React.ReactNode }) => <p className="num rounded bg-slate-100 px-2 py-1 font-mono text-xs">{children}</p>;

export default function MethodPage() {
  const bq = read<BuildingQ>("data/quality/buildings.json");
  const fq = read<FactoryQ>("data/quality/factory.json");
  const rq = read<RegisterQ>("data/quality/register.json");
  const C = CONSTANTS;
  const vq = read<Validation & { generated: string; basis?: "human" | "ai"; review?: { queue: number; done: number; agreement: number | null; precision: number | null; recall: number | null; missRate: number | null; missChecked: number }; blind?: { checked: number; agreement: number; installedKept: number; installedTotal: number; notFlipped: number; notTotal: number; changed: number; kappa?: number | null } | null }>("data/quality/validation.json");
  const rv = vq.review;
  const ai = vq.basis === "ai";
  const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);
  const sq = read<{ zoning_source: string; zoning_fetched: string; d35_zone_buildings: number; by_complex: Record<string, Record<string, number>>; total: Record<string, number> }>("data/quality/solar_biz.json");
  const uq = read<{ meta: { rule: string; source: string; targets: string }; targets: number; read: number; unreadable: number[]; pass_agreement: { same: number; within10: number; max_diff: number }; usable: { mean: number; mean_not_installed: number; at_floor: number; at_cap: number; assumed: number }; capacity_kw: { not_installed: { n: number; assumed: number; ai: number } }; top20_kept: number; tier_moves: Record<string, number>; example: { usable: number | null; assumed: { pv_kw: number }; ai: { pv_kw: number } } }>("data/quality/roof_usable.json");
  type Packs = { base: number; a_only: number; b_only: number };
  type BatTier = { buildings: number; ess_kwh: number; ess_units: number; packs: Packs; ess_save_won: number; site: Record<string, number> };
  const bat = read<{ meta: { generated: string }; by_tier: Record<string, BatTier>; total: BatTier; outlook: { chungbuk_2030: number; formula: string; nationwide_source: string; chungbuk_source: string; caveat: string; need_vs_outlook: { total: { base_pct: number; a_only_pct: number; b_only_pct: number } } } }>("data/quality/battery.json");
  type MS = { mean: number; std: number };
  const ml = read<{ generated: string; n: number; positives: number; negatives: number; excluded_unknown: number; rule: { auc_folds: MS }; models: Record<"logistic" | "gradient_boosting", { auc_folds: MS }>; diff_ml_minus_rule: Record<"logistic" | "gradient_boosting", { mean: number; share_folds_positive: number }>; group_importance: Record<"logistic" | "gradient_boosting", Record<string, MS>>; rule_weights: Record<string, number>; rank_correlation: Record<"logistic" | "gradient_boosting", { spearman_rho: number; p_value: number }> }>("data/quality/ml_check.json");
  const gq = read<{ meta: { fetched: string; source: string }; areas_ok: number; summary: Record<string, { lines: number; min_kw: number; max_kw: number }> }>("data/quality/grid.json");
  const raw = read<{ meta: { built: string }; buildings: RawBuilding[] }>("public/data/buildings.json");
  const st = withStability(raw.buildings.map((b) => enrich(b, raw.meta.built.replaceAll("-", ""))));
  const baseDate = bq.meta.base_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-2 p-2 md:p-3">
      <AppHeader complexSelect={false} />
      <Section id="top" title="산정 기준">
        <p>
          이 지도의 숫자는 공개 데이터와 아래 식으로 계산한 <strong>{REVIEW_BADGE}</strong> 값입니다. 실제 설치 여부와 용량은 현장 조사, 구조검토, 전기·소방 협의를 거쳐 정해집니다.
        </p>
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {[["pv", "지붕 태양광"], ["ess", "재사용 ESS"], ["money", "절감액·탄소"], ["capex", "투자비·회수기간"], ["score", "적합도·설치 조건"], ["stability", "순위 안정도"], ...(vq.labeled > 0 ? [["validation", "기존 설치 검증"]] : []), ["industry", "업종 분류"], ["constants", "상수"], ["tariff", "요금표"], ["data", "데이터"], ["limits", "한계"]].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="underline">{label}</a>
          ))}
        </nav>
      </Section>

      <Section id="pv" title="지붕 태양광">
        <F>지붕면적 = min(건축면적, 도형 면적) · 건축면적이 없으면 도형 면적</F>
        <F>설치용량(kW) = 지붕면적 × 이용률 {C.UTIL.value} ÷ {C.M2_PER_KW.value}㎡/kW · 연 발전량(kWh) = 설치용량 × {n(C.PVOUT.value)}</F>
        <p>예: 5,000㎡ × 0.5 ÷ 10 = 250kW, 250 × 1,427 = 356,750kWh. 도형 면적이 건축면적의 2/3에 못 미치면 두 자료가 맞지 않는 것으로 보고 작은 값을 씁니다.</p>
      </Section>

      <Section id="ess" title="재사용 배터리 ESS (선택 설비)">
        <p>공장은 낮에 만든 태양광 전기를 대부분 그 자리에서 쓰므로, ESS를 태양광 크기에 비례해 붙이지 않습니다. 피크 저감, 경부하 충전·최대부하 방전, 정전 대비 가운데 쓰임새를 골라 따로 정하는 설비로 보고, 기본은 건물당 1단위 시범입니다.</p>
        <F>ESS 용량(kWh) = min(설치용량 × {C.ESS_HOURS.value}시간, {n(C.ESS_UNIT_MAX.value)}kWh × 단위 수 {C.ESS_UNITS.value}) · 분산 단위 = 올림(ESS 용량 ÷ {n(C.ESS_UNIT_MAX.value)}kWh)</F>
        <F>팩당 사용 가능(kWh) = 정격 {C.PACK_KWH.value} × (A비율 {C.A_RATIO.value} × {C.SOH_A.value} + B비율 × {C.SOH_B.value}) × (충전율 상한 {C.SOC_MAX.value} − 하한 {C.SOC_MIN.value}) = 36.96</F>
        <F>필요 팩 수 = 올림(ESS 용량 ÷ 팩당 사용 가능)</F>
        <F>ESS 시간대 차익(원/년, 추정) = ESS 용량 × 왕복 효율 {C.ESS_EFF.value} × 운영일 {C.ESS_DAYS.value} × 최대−경부하 단가차 {peakSpread().toFixed(1)}원</F>
        <F>필지 공지(㎡) = 대지면적 − 그 필지 건물 바닥면적 합 · 놓을 수 있는 단위 수 = 내림(공지 ÷ {C.ESS_UNIT_AREA.value}㎡)</F>
        <p>예: 250kW → 500kWh → 1단위, 팩 14개. 657kW → 1,314kWh가 아니라 1,000kWh 1단위, 팩 28개. 설치용량 {C.PV_MIN_KW.value}kW 미만은 ESS를 산정하지 않습니다. 충전율 상한은 옥외 {C.SOC_MAX.value * 100}%, 옥내 {C.SOC_MAX_INDOOR.value * 100}%입니다({C.SOC_MAX.source}). 피크 저감 효과는 공장 계약전력과 부하 자료가 있어야 계산할 수 있어 넣지 않았습니다. 시간대 차익은 요금표만으로 추정한 값(예: 500kWh → 약 744만 원/년)이라 태양광 절감과 따로 표시합니다. 공지가 ESS 단위 수보다 모자라면 'ESS 공간 부족 · 옥상·별동 검토'를 표시하며, 대지면적을 모르는 건물은 판단하지 않습니다.</p>
      </Section>

      <Section id="money" title="절감액·탄소">
        <F>연 절감(원) = 연 발전량 × 단가 · 하한 {C.PRICE_LOW.value}원 ~ 기준(청주 산업용 평균판매단가 최신월)</F>
        <F>감축량(tCO2eq) = 연 발전량 ÷ 1,000 × {C.EMISSION.value}</F>
        <p>
          기준 단가는 한국전력공사 전력데이터 개방포털에서 받아오며, 조회하지 못하면 {C.PRICE_FALLBACK.value}원({C.PRICE_FALLBACK.asOf.replace("-", ".")})으로 계산하고 그 사실을 화면에 표시합니다. 평균판매단가에는 기본요금이 들어 있어 실제 절감은 하한에 가까울 수 있습니다. 기후환경요금·연료비조정액은 넣지 않았습니다. 예: 356,750kWh → 5,351만~6,850만 원, 148.9t.
        </p>
      </Section>

      <Section id="capex" title="투자비·회수기간">
        <F>태양광 투자비(원) = 설치용량 × kW당 {n(C.CAPEX_PER_KW.value / 10000)}만 원 · 단순 회수기간(년) = 투자비 ÷ 연 절감(기준 단가 ~ 하한 단가)</F>
        <p>예: 250kW × 140만 원 = 3.5억 원, 회수 5.1~6.5년. kW당 설치비는 {C.CAPEX_PER_KW.source}이며 범위는 {n(C.CAPEX_PER_KW.range[0] / 10000)}만~{n(C.CAPEX_PER_KW.range[1] / 10000)}만 원입니다. 유지비, 발전량 저하, 금융비용은 넣지 않은 단순 계산이며 보조금도 기본 계산에는 넣지 않습니다. 전력 판매 방식은 {C.SMP.source} {C.SMP.value}원/kWh만 넣고 REC 수익은 넣지 않았습니다. 지붕 임대 방식은 계산하지 않습니다(공식 임대료 단가가 없고 계약마다 다름). 업체 홍보 단가는 쓰지 않았고, ESS 투자비도 재사용 배터리 단가가 정해지지 않아 넣지 않았습니다.</p>
      </Section>

      <Section id="subsidy" title="보조금 시나리오">
        <p>건물 정보창과 시뮬레이터의 '보조금 반영(2026 단가 기준)'을 켜면 지원액을 뺀 순투자로 회수기간을 다시 계산합니다. 기본 계산에는 넣지 않습니다. <span className="rounded bg-amber-100 px-1 py-0.5 text-[11px] text-amber-900">{SUBSIDY_BADGE}</span></p>
        <Table head={["항목", "값", "신뢰도", "출처·기준일"]} rows={[C.SUBSIDY_LOW, C.SUBSIDY_HIGH, C.SUBSIDY_TIER_KW, C.SUBSIDY_CAP_KW].map((x) => [x.label, `${n(x.value)}${x.unit}`, x.kind, `${x.source} (${x.asOf})`])} />
        <p>공고문은 "신청용량에 보조금 지원단가를 적용"한다고만 적고 구간별 산식은 밝히지 않았습니다. 그래서 전 용량에 낮은 단가({n(C.SUBSIDY_LOW.value)}원)를 적용한 값을 먼저 보여 주고, 200kW 이하 건물은 그 구간 단가({n(C.SUBSIDY_HIGH.value)}원)를 적용한 값을 괄호로 함께 보여 줍니다. 예: 250kW·투자비 3.5억 원 → 지원 1.035억 원, 순투자 2.465억 원, 회수 3.6~4.6년. {n(C.SUBSIDY_CAP_KW.value)}kW 초과분은 지원 0, {C.PV_MIN_KW.value}kW 미만은 표시하지 않습니다. 이 보조금은 자가소비 설비와 저탄소 모듈에만 지원되고 발전한 전기를 거래·판매하지 않는 조건이어서 자가소비 방식에만 해당합니다.</p>
      </Section>

      <Section id="score" title="설치 적합도·설치 조건">
        <p>적합도는 아래 항목의 점수를 더한 값입니다. 항목 값이 없는 건물은 그 항목을 0점으로 둡니다. 전 건물에 자료가 없는 항목(현재 위험물시설 거리)은 만점에서 빼서 <strong>{maxAvailable()}점 만점</strong>으로 표시합니다.</p>
        <Table head={["항목", "배점", "기준"]} rows={[
          ["규모", WEIGHTS.scale, "500kW 이상 30 / 200~499 22 / 100~199 15 / 30~99 8 / 30 미만 0"],
          ["구조", WEIGHTS.struct, "철근콘크리트·철골철근콘크리트·철골콘크리트·프리캐스트콘크리트 20 / 일반철골·경량철골·강파이프·기타강구조 12 / 조적·목조·기타 5 / 정보 없음 0"],
          ["사용 연수", WEIGHTS.age, "10년 미만 15 / 10~19년 12 / 20~29년 6 / 30년 이상·정보 없음 0"],
          ["전력수요 업종", WEIGHTS.industry, "다소비 업종 15 / 그 밖의 제조 8 / 등록공장 미연결 0"],
          ["안전 이격(위험물)", WEIGHTS.hazmat, "미반영 · 위험물시설 위치 파일(소방청 15124189)이 공개 다운로드되지 않음"],
          ["배전 여유", WEIGHTS.grid, "주소의 리(里)에 걸친 모든 배전선로 여유 ≥ 설치용량 10 / 여유 있는 선로가 하나라도 있으면 5 / 없으면 0"],
        ]} />
        <Table head={["단계", "기준"]} rows={[
          ["설치 우선", `만점의 70% 이상(현재 ${Math.round(maxAvailable() * 0.7)}점)이고 설치 조건 '통과'`],
          ["검토", `만점의 50% 이상(현재 ${Math.round(maxAvailable() * 0.5)}점)이거나, 70% 이상이지만 설치 조건 '조건부'`],
          ["보류", "만점의 50% 미만 또는 30kW 미만"],
        ]} />
        <p><strong>배전 여유</strong>: {gq.meta.source}({gq.meta.fetched} 조회)는 지번 단위로 응답하지 않아 리 단위로 조회했습니다({gq.areas_ok}개 리). 건물이 어느 선로에 접속될지는 한전 접수 때 정해지므로, 그 리에 걸친 선로 여유의 최솟값과 최댓값을 함께 보고 보수적으로 점수를 줍니다. 선로 여유는 변전소·주변압기·배전선로 여유 중 가장 작은 값입니다. 응답에는 단위 표기가 없지만, 한전ON '배전선로 여유용량' 화면이 kW로 표기하고 접속기준용량(변전소 200,000kW·주변압기 50,000kW)이 응답의 누적 연계용량과 여유용량 합과 같아 kW로 확인했습니다. 다만 한전ON은 번지별로 실제 접속 선로를 보여 주고 이 자료는 리 단위 선로 목록이라, 한전ON에 나오는 선로가 목록에 없을 수 있습니다.</p>
        <p><strong>설치 조건</strong>: 구조 정보가 없거나 사용승인 30년 이상이면 '조건부(구조검토 필수)'입니다. 철골 계열과 경량 지붕은 하중·방수 확인이 필요하고, 의약·식품 업종은 옥상 설비와 청정구역 확인이 필요합니다. 산단 관리기본계획의 입주대상업종에 태양광 발전업이 명시되지 않은 산단은 판매·임대 방식에 '확인 필요'를 표시합니다. 위험물시설 위치 파일(소방청 15124189)이 공개 다운로드되지 않아 위험물시설 거리는 점수와 판정에 쓰지 않으며, 모든 건물에 “{HAZMAT_CHIP_P0}”을 표시합니다.</p>
      </Section>

      <Section id="stability" title="순위 안정도">
        <p>배점은 초기값이므로, 배점이 달라져도 순위가 유지되는지 확인합니다. 반영 중인 항목의 배점을 각각 ±{STABILITY.spread * 100}% 범위에서 무작위로 바꿔 {n(STABILITY.runs)}번 다시 순위를 매기고, 건물마다 상위 {STABILITY.top * 100}%에 든 비율을 계산합니다.</p>
        <Table head={["항목", "값"]} rows={[
          ["후보(30kW 이상 대상 건물)", `${n(st.population)}동`],
          [`상위 ${STABILITY.top * 100}%`, `${n(st.topCount)}동`],
          ["상위 건물의 평균 유지 비율", `${(st.topMean * 100).toFixed(1)}%`],
          ["1,000회 중 90% 이상 상위에 남은 건물", `${n(st.topStable)}동 / ${n(st.topCount)}동`],
        ]} />
        <p>건물 패널의 '순위 안정도'가 낮은 건물은 배점에 따라 순위가 바뀔 수 있으니 다른 조건과 함께 봐야 합니다. 난수 씨앗을 고정해 같은 데이터에서는 같은 값이 나옵니다.</p>
      </Section>

      {vq.labeled > 0 && (
        <Section id="validation" title={ai ? "기존 설치 건물로 본 검증 (항공영상 AI 판독)" : "기존 설치 건물로 본 검증"}>
          <p>적합도 점수가 실제와 맞는지 보려고, 후보 {n(vq.candidates)}동의 지붕을 항공영상에서 {ai ? "AI가 판독해" : "사람이 직접 보고"} 태양광 패널이 이미 있는지 표시했습니다{vq.imageYears.length ? ` (영상 ${vq.imageYears.join("·")}년)` : ""}. 이미 설치한 공장은 설치할 만해서 설치한 곳이므로, 점수 상위에 이런 건물이 많이 들어올수록 점수가 현실과 맞는다고 볼 수 있습니다.</p>
          {ai && <p>건물마다 항공영상을 AI(Claude Opus 5.5)가 두 번 판독하고, 두 결과가 엇갈리거나 불확실한 건물은 확대 이미지로 다시 판독했습니다. 같은 모델이 한 판독이라 독립된 검수가 아니며, 부분 설치·짙은 색 금속 지붕·채광창은 틀릴 수 있습니다. 영상이 흐리거나 건물이 아직 없는 곳은 '불명'으로 두었습니다. 영상: 브이월드 항공영상(국토지리정보원 정사영상, 해상도 12~25cm). 촬영연도는 확인하지 못했습니다.</p>}
          {vq.blind && <p>검수 표본은 앞선 판독 결과를 보지 않은 별도의 AI 판독으로 한 번 더 봤습니다(순서를 섞고 번호를 새로 붙임). 엇갈린 {n(vq.blind.changed)}동은 '불명'으로 내려 계산에서 뺐습니다. 이것도 AI 판독이며 사람 검수를 대신하지 않습니다.</p>}
          {rv && rv.done > 0 && <p>사람 검수 표본은 AI가 '설치'로 본 건물 전부와 '미설치' 중 무작위 50동(시드 고정), 모두 {n(rv.queue)}동입니다. 지금까지 {n(rv.done)}동을 검수했습니다. 검수한 건물은 사람 표시를, 나머지는 AI 판독을 써서 아래 지표를 계산합니다{rv.done < rv.queue ? ". 검수가 끝나면 수치가 달라질 수 있습니다" : ""}.</p>}
          <Table head={["항목", "값"]} rows={[
            ["표시한 건물", `${n(vq.labeled)}동 / ${n(vq.candidates)}동 (설치 ${n(vq.counts.설치)} · 미설치 ${n(vq.counts.미설치)} · 불명 ${n(vq.counts.불명)}${vq.counts.불일치 ? ` · 불일치 ${n(vq.counts.불일치)}` : ""})`],
            ...(ai ? [] : [
              ["표시한 사람", vq.labelers.map((l) => `${l.count}동`).join(" · ") || "–"],
              ["두 사람이 같이 본 건물의 일치율", vq.overlap ? `${pct(vq.agreement)} (${n(vq.overlap)}동${vq.kappa !== null ? `, 카파 ${vq.kappa}` : ""})` : "한 사람만 표시"],
            ]),
            ...(vq.blind ? [["AI 눈가림 재판독과의 일치(검수 표본)", `${pct(vq.blind.agreement)} (${n(vq.blind.checked)}동${vq.blind.kappa != null ? `, 카파 ${vq.blind.kappa}` : ""}) · '설치' ${n(vq.blind.installedKept)}/${n(vq.blind.installedTotal)}동 유지 · '미설치' 표본 ${n(vq.blind.notTotal)}동 중 '설치'로 바뀐 것 ${n(vq.blind.notFlipped)}동`]] : []),
            ...(rv && rv.done > 0 ? [
              ["AI 판독과 사람 검수의 일치율", `${pct(rv.agreement)} (${n(rv.done)}동)`],
              ["AI '설치' 중 사람도 '설치'로 본 비율(정밀도)", pct(rv.precision)],
              ["사람 '설치' 중 AI도 '설치'로 본 비율(재현율, 표본 안)", pct(rv.recall)],
              ["AI '미설치' 표본 중 사람이 '설치'로 고친 비율", rv.missChecked ? `${pct(rv.missRate)} (${n(rv.missChecked)}동 중)` : "–"],
            ] : []),
            ["전체 설치 비율(무작위로 골랐을 때 기대값)", pct(vq.baseRate)],
            ...vq.topK.filter((t) => t.k <= 0.2).map((t) => [`점수 상위 ${t.k * 100}% (${n(t.n)}동) 중 설치 비율`, `${pct(t.precision)}${t.lift !== null ? ` · 기준의 ${t.lift}배` : ""}${t.recall !== null ? ` · 설치 건물의 ${pct(t.recall)} 포함` : ""}`]),
            ["설치 건물이 미설치 건물보다 점수가 높을 확률", vq.auc === null ? "–" : pct(vq.auc)],
            ["평균 점수", `설치 ${vq.mean.installed ?? "–"}점 · 미설치 ${vq.mean.notInstalled ?? "–"}점`],
            ["설치 vs 미설치 점수 분포 (Mann-Whitney U, 양측)", vq.mw ? `U = ${n(vq.mw.u, 1)} · z = ${vq.mw.z} · p = ${vq.mw.p < 0.001 ? "0.001 미만" : vq.mw.p} · 효과크기(순위이연상관) ${vq.mw.effect} · 설치 ${n(vq.mw.n1)}동, 미설치 ${n(vq.mw.n2)}동` : "–"],
          ]} />
          <Table head={["점수 구간", "설치", "미설치"]} rows={vq.bins.filter((b) => b.installed + b.notInstalled > 0).map((b) => [`${b.from}~${b.to}점`, b.installed, b.notInstalled])} />
          <p>'불명'은 계산에서 뺐습니다. 판독에 쓴 모델·지시문·영상 출처는 저장소의 <code>data/labels/README.md</code>에 적었습니다. '설치'로 표시된 건물은 지도와 목록에서 '이미 설치됨'으로 따로 구분하고 '설치 우선' 순위에서 뺍니다. 다시 계산하려면 <code>npx tsx scripts/06_validate.ts</code>를 실행합니다({vq.generated} 계산).</p>
        </Section>
      )}

      <Section id="ml-check" title="ML 교차검증 (규칙 점수와 같은 조건 비교)">
        <p>규칙으로 만든 점수가 '이미 설치한 건물'을 얼마나 가려내는지를 ML 모델과 같은 조건에서 비교했습니다({ml.generated} 계산). 대상은 판독 결과가 설치·미설치인 {n(ml.n)}동(설치 {n(ml.positives)} · 미설치 {n(ml.negatives)}, 불명 {n(ml.excluded_unknown)}동 제외)이고, 입력은 점수 구성요소 5개와 그 원값(설치용량·사용연수·구조·업종·배전 여유)입니다. 층화 5겹 교차검증을 시드를 바꿔 20회 반복했고(폴드 100개), 규칙 점수도 같은 테스트 폴드에서 AUC를 냈습니다.</p>
        <Table head={["방법", "AUC 평균 ± 표준편차(폴드 100개)", "규칙 대비 차이", "규칙보다 높았던 폴드"]} rows={[
          ["규칙 점수(학습 없음)", `${ml.rule.auc_folds.mean.toFixed(3)} ± ${ml.rule.auc_folds.std.toFixed(3)}`, "기준", "기준"],
          ...(["logistic", "gradient_boosting"] as const).map((k) => [k === "logistic" ? "로지스틱 회귀" : "그래디언트 부스팅", `${ml.models[k].auc_folds.mean.toFixed(3)} ± ${ml.models[k].auc_folds.std.toFixed(3)}`, `+${ml.diff_ml_minus_rule[k].mean.toFixed(3)}`, pct(ml.diff_ml_minus_rule[k].share_folds_positive)]),
        ]} />
        <Table head={["항목", "규칙 가중치", "로지스틱 중요도", "부스팅 중요도"]} rows={Object.keys(ml.rule_weights).map((k) => [k, ml.rule_weights[k], `${ml.group_importance.logistic[k].mean.toFixed(3)} ± ${ml.group_importance.logistic[k].std.toFixed(3)}`, `${ml.group_importance.gradient_boosting[k].mean.toFixed(3)} ± ${ml.group_importance.gradient_boosting[k].std.toFixed(3)}`])} />
        <p>중요도는 테스트 폴드에서 그 항목의 값을 섞었을 때 AUC가 줄어든 양(permutation importance)입니다. 규칙 가중치 순위와의 스피어만 순위상관은 로지스틱 {ml.rank_correlation.logistic.spearman_rho.toFixed(2)}(p = {ml.rank_correlation.logistic.p_value.toFixed(2)}), 부스팅 {ml.rank_correlation.gradient_boosting.spearman_rho.toFixed(2)}(p = {ml.rank_correlation.gradient_boosting.p_value.toFixed(2)})입니다. 두 모델 모두 규모가 가장 크고, 나머지 네 항목은 표준편차가 평균보다 커서 서로의 순서는 가리기 어렵습니다.</p>
        <p>읽을 때 주의할 점입니다. ML의 AUC가 조금 높지만 그 차이는 폴드별 흔들림보다 작습니다. 설치 건물이 {n(ml.positives)}동뿐이라 ML은 이 라벨에 맞춰졌을(과적합) 수 있고, ML이 쓴 정보는 규칙과 같습니다. 라벨은 항공영상 AI 판독이며, '이미 설치했는가'는 적합도를 대신 보는 지표일 뿐입니다. 그래서 이 결과로 점수 규칙이나 가중치를 바꾸지 않았습니다.</p>
      </Section>

      <Section id="roof-usable" title="지붕 이용률 판독 (AI, 참고)">
        <p>기본 계산은 모든 건물에 지붕 이용률 {C.UTIL.value}를 씁니다. 이 가정이 얼마나 맞는지 보려고 {uq.meta.targets} {n(uq.targets)}동의 지붕을 AI가 판독해, 패널을 놓을 수 없는 면적(옥상 설비·채광창·계단실·그림자·기존 패널·지붕이 아닌 부분)의 비율을 10% 단위로 추정했습니다. {uq.meta.source}. {uq.meta.rule}.</p>
        <Table head={["항목", "값"]} rows={[
          ["판독한 건물", `${n(uq.read)}동 / ${n(uq.targets)}동${uq.unreadable.length ? ` (영상이 흐려 판독하지 못한 건물 ${uq.unreadable.length}동)` : ""}`],
          ["두 판독의 차이", `같음 ${n(uq.pass_agreement.same)}동 · 10%p 이내 ${n(uq.pass_agreement.within10)}동 · 최대 ${uq.pass_agreement.max_diff}%p (20%p를 넘는 건물은 재판독 대상)`],
          ["평균 이용률", `${uq.usable.mean} (이미 설치된 건물을 빼면 ${uq.usable.mean_not_installed}) · 가정 ${uq.usable.assumed}`],
          ["상한·하한에 걸린 건물", `상한 0.7에 ${n(uq.usable.at_cap)}동 · 하한 0.2에 ${n(uq.usable.at_floor)}동`],
          [`설치용량 합계(이미 설치된 건물 제외 ${n(uq.capacity_kw.not_installed.n)}동)`, `가정 0.5일 때 ${n(uq.capacity_kw.not_installed.assumed)}kW → 판독 이용률일 때 ${n(uq.capacity_kw.not_installed.ai)}kW`],
          ["점수 상위 20동 중 그대로 남는 건물", `${n(uq.top20_kept)}동`],
          ["단계가 바뀌는 건물", Object.entries(uq.tier_moves).map(([k, v]) => `${k} ${v}동`).join(" · ") || "없음"],
          ["예시 건물(정보창 기본 예시)", uq.example.usable === null ? "판독하지 못함" : `이용률 ${uq.example.usable} · ${n(uq.example.assumed.pv_kw, 1)}kW → ${n(uq.example.ai.pv_kw, 1)}kW`],
        ]} />
        <p>이 값은 건물 정보창에 "AI 판독 이용률(참고)"로만 보여 주고, 점수·합계·순위는 모두 이용률 {C.UTIL.value} 기준 그대로입니다. 하한에 걸린 건물은 대부분 이미 패널이 덮여 있거나 건물 도형이 지붕과 어긋난 경우입니다. 사람이 현장에서 잰 값이 아닙니다.</p>
      </Section>

      <Section id="battery" title="재사용 배터리 집계">
        <p>'설치 우선'과 '검토' 단계 건물({n(bat.total.buildings)}동)에 건물당 1MWh 이하 1단위를 둔다고 가정한 집계입니다({bat.meta.generated} 계산). 팩 수는 A등급(잔존 80%) 비율에 따라 달라져 범위로 적습니다.</p>
        <Table head={["단계", "동", "ESS 용량(MWh)", "분산 단위", "재사용 팩(기본 · A등급만~B등급만)", "ESS 시간대 차익(억 원/년)", "옥외 부지 여유 · 옥내 검토 · 대지면적 정보 없음"]} rows={[...Object.entries(bat.by_tier), ["합계", bat.total] as [string, BatTier]].map(([k, t]) => [k, n(t.buildings), n(t.ess_kwh / 1000, 1), n(t.ess_units), `${n(t.packs.base)} · ${n(t.packs.a_only)}~${n(t.packs.b_only)}`, n(t.ess_save_won / 1e8, 1), `${n(t.site["부지 여유"] ?? 0)} · ${n(t.site["옥내 검토(충전율 80%)"] ?? 0)} · ${n(t.site["대지면적 정보 없음"] ?? 0)}`])} />
        <p>옥외 부지 확인은 필지 공지(대지면적 − 건축면적)가 단위 수 × {C.ESS_UNIT_AREA.value}㎡ 이상이면 '부지 여유', 모자라면 '옥내 검토(충전율 상한 80%)'입니다. 대지면적은 건축물대장에서 확인된 건물만 판정했고, 같은 필지의 여러 동이 공지를 나눠 쓰는 경우는 보지 않았습니다.</p>
        <p><span className="mr-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">추정</span>충북 2030년 사용후 배터리 발생 전망 {n(bat.outlook.chungbuk_2030)}개는 공식 통계가 아니라 이 서비스가 계산한 값입니다. {bat.outlook.formula}. 출처: {bat.outlook.nationwide_source} · {bat.outlook.chungbuk_source}. 위 {n(bat.total.buildings)}동에 필요한 팩은 이 전망의 {bat.outlook.need_vs_outlook.total.base_pct}%({bat.outlook.need_vs_outlook.total.a_only_pct}~{bat.outlook.need_vs_outlook.total.b_only_pct}%)입니다. {bat.outlook.caveat}</p>
      </Section>

      <Section id="industry" title="업종 분류">
        <p>등록공장은 주소 좌표가 떨어진 건물과 같은 필지의 다른 동에도 함께 연결합니다(동 구분 불가). 그래서 창고나 부속동도 같은 업종 점수를 받습니다.</p>
        <p>등록공장현황에는 업종코드가 없어 생산품 문구의 키워드로 분류합니다. 아래 키워드가 들어 있으면 다소비 업종(15점), 그 밖의 생산품은 제조(8점)입니다.</p>
        <Table head={["업종군", "KSIC", "키워드"]} rows={keywords().map((k) => [k.group, k.ksic, k.words.join(", ")])} />
      </Section>

      <Section id="constants" title="상수와 출처">
        <Table id="TBL-04" head={["항목", "값", "구분", "허용 범위", "출처", "기준일"]} rows={Object.values(C).map((c) => [c.label, `${c.value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${c.unit ? ` ${c.unit}` : ""}`, c.kind, "range" in c && c.range ? `${c.range[0]}~${c.range[1]}` : "–", c.source, c.asOf])} />
      </Section>

      <Section id="tariff" title={`요금표 · ${TARIFF.name}`}>
        <Table head={["계절", "경부하", "중간부하", "최대부하", "최대−경부하"]} rows={([["여름(6~8월)", TARIFF.energy.summer], ["봄·가을(3~5, 9~10월)", TARIFF.energy.springFall], ["겨울(11~2월)", TARIFF.energy.winter]] as const).map(([label, s]) => [label, ...s.rates.map((r) => `${r.toFixed(1)}원`), `${(s.rates[2] - s.rates[0]).toFixed(1)}원`])} />
        <p>기본요금 {n(TARIFF.basicWonPerKw)}원/kW · 최대부하 시간: 여름 {TARIFF.peakHours.summer}, 그 외 {TARIFF.peakHours.other} · 월수 가중 평균 단가차 {peakSpread().toFixed(1)}원/kWh · 출처 {TARIFF.source}, {TARIFF.asOf} 적용. 절감액 하한 150원의 근거 자료이며, ESS 시간대 차익은 아직 계산에 넣지 않았습니다.</p>
      </Section>

      <Section id="data" title="데이터와 연결 결과">
        <Table id="TBL-05" head={["데이터", "기준일", "쓰임", "결과"]} rows={[
          ["국토교통부 GIS건물통합정보(15083092)", baseDate, "건물 도형·용도·구조·면적·사용승인일", `충북 ${n(bq.source_total)}동 중 4개 산단 안 ${n(bq.clipped)}동, 대상 ${n(rq.target_after)}동`],
          ["국토교통부 산업단지 경계도면(15152766)", "2026-06-30", "산단 경계(형상 변경 없이 표시)", bq.by_complex.map((c) => `${c.complex_nm} ${n(c.buildings)}동`).join(" · ")],
          ["한국산업단지공단 전국등록공장현황(15105482)", "2025-12-31", "회사명·생산품, 업종 분류", `오창 ${n(fq.factories)}곳 중 건물 안 ${n(fq.match.CONTAIN)} · 같은 필지 ${n(fq.match.PNU)} · 미연결 ${n(fq.match.NONE)}(주소 변환 실패 ${fq.geocode_fail} 포함)`],
          ["국토교통부 건축HUB 건축물대장 표제부(15134735)", "조회일 기준", "구조·면적·사용승인일·지붕 보강", `대상 ${n(rq.buildings)}동 중 ${n(rq.buildings - rq.reg_null)}동 연결(${Math.round(rq.match_rate * 100)}%)`],
          ["소방청 119안전센터 현황(15065056)", "2026-07-01", "가까운 119안전센터 직선거리(참고)", `충북 ${fq.stations.total}곳 중 ${fq.stations.geocoded}곳 위치 확인`],
          ["한국전력공사 전력데이터 개방포털", "최신월", "청주 산업용 평균판매단가", `조회 실패 시 ${C.PRICE_FALLBACK.value}원(${C.PRICE_FALLBACK.asOf})`],
          ["한국전력공사 분산전원연계 정보", gq.meta.fetched, "리 단위 배전선로 여유용량(배전 여유 점수)", `${gq.areas_ok}개 리 · 선로 여유 ${n(Math.min(...Object.values(gq.summary).map((v) => v.min_kw)))}~${n(Math.max(...Object.values(gq.summary).map((v) => v.max_kw)))}kW`],
          ["브이월드(국토교통부)", "–", "항공영상 배경지도, 주소 좌표 변환", "장애 시 Esri World Imagery로 표시"],
          ["Global Solar Atlas", C.PVOUT.asOf, "연간 발전량 계수", `${n(C.PVOUT.value)} kWh/kWp (36.72N 127.43E)`],
        ]} />
        <p>대상 건물은 산단 경계 안(건물 대표점 기준)에서 용도가 {bq.target_use.join("·")}인 건물입니다. 교육연구시설 중 학교는 뺐습니다. 용도 정보가 없는 건물은 도형 면적 600㎡ 이상이거나 등록공장이 연결된 경우만 대상으로 하고 '용도 미확인'으로 표시합니다(현재 {n(rq.null_after.use)}동). 대상 건물 {n(rq.target_after)}동 가운데 회사가 연결된 건물은 {n(fq.target_with_company)}동입니다.</p>
        <Table head={["산단", "대상 건물", "판매·임대형 입주업종", "고시문 근거"]} rows={Object.entries(sq.by_complex).map(([name, c]) => [name, n(Object.values(c).reduce((a, b) => a + b, 0)), Object.entries(c).map(([k, v]) => `${k} ${n(v)}동`).join(" · "), (rules as unknown as Record<string, { source?: string | null; checked?: string | null }>)[name]?.source ?? "–"])} />
        <p>판정은 세 자료를 봅니다. ① 산단 관리기본계획 고시문의 입주대상업종, ② {sq.zoning_source}의 구역별 유치업종(대상 건물 중 '전기, 가스, 증기' 구역 안 {n(sq.d35_zone_buildings)}동), ③ 같은 자료의 API 조회({sq.zoning_fetched}). 하나라도 전기업(발전업) 계열이 명시되면 '확인됨', 자료를 봤는데 없으면 '확인 안 됨(유치업종 목록에 발전업 없음)'입니다. '확인 안 됨'은 허용되지 않는다는 뜻이 아니며, 유치업종 도면은 구역마다 대표 업종 하나만 적은 축약 표기입니다. 이 판정은 점수에 넣지 않고, 계산은 모두 자가소비 기준입니다.</p>
        <p>경기도는 산단 관리계획에 태양력 발전업을 넣도록 지원해 산업단지 태양광 발전사업 허가 물량이 2023년 63MW에서 2025년 125MW로 늘었습니다(머니투데이 2026.3.7). 판매·임대형에 입주업종 확인이 필요한 이유입니다. 지붕 임대 사례로는 화성의 한 공장이 지붕 100kW를 16년 빌려주고 임대료 4,800만 원을 33kW 자가용 설비로 한 번에 받은 보도가 있습니다(오마이뉴스 2024.2.23). 사례일 뿐 단가가 아니어서 계산에는 쓰지 않습니다.</p>
        <p>공장이 직접 쓰는 자가소비 설치는 위 표와 별개입니다. 전기를 팔거나 지붕을 빌려주는 사업은 산단 관리기본계획의 입주대상업종에 발전업이 있어야 합니다(산업집적법 시행령 제6조).</p>
        <p>산업단지 경계도면은 공공누리 제4유형(출처표시·비상업·변경금지) 자료입니다.</p>
      </Section>

      <Section id="limits" title="한계">
        <ul className="list-disc space-y-1 pl-5">
          <li>GIS건물통합정보는 구축기관이 달라 참고용입니다. 도형과 건축물대장이 어긋난 건물이 있습니다.</li>
          <li>지붕 이용률, kW당 면적, 팩 정격, 잔존용량, 저장 시간은 초기 가정값입니다. 시뮬레이터에서 범위를 바꿔 볼 수 있습니다.</li>
          <li>재사용 배터리의 법정 성능등급 기준은 2027년 5월 시행 전이라 정해지지 않았습니다.</li>
          <li>지붕 하중, 방수, 기존 설비, 음영은 반영하지 않았습니다. 구조검토가 필요합니다.</li>
          <li>위험물시설 위치 파일(소방청 15124189)이 공개 다운로드되지 않아 위험물시설 거리는 반영하지 않았습니다(90점 만점).</li>
          <li>배전선로 여유용량은 한전 자료가 리 단위로만 조회되어, 건물이 어느 선로에 연결되는지 알 수 없습니다. 패널에 참고 정보로만 보여 주고 점수에는 넣지 않았습니다.</li>
          <li>업종은 생산품 문구로 추정한 것이며 실제 전력 사용량과 다를 수 있습니다.</li>
        </ul>
      </Section>
    </main>
  );
}
