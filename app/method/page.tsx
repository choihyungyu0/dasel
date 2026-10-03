import { readFileSync } from "node:fs";
import path from "node:path";
import AppHeader from "@/components/AppHeader";
import { CONSTANTS, HAZMAT_CHIP_P0, peakSpread, REVIEW_BADGE, TARIFF } from "@/lib/constants";
import { enrich, withStability, type RawBuilding } from "@/lib/data";
import { maxAvailable, WEIGHTS } from "@/lib/score";
import { STABILITY } from "@/lib/stability";
import type { Validation } from "@/lib/validate";

export const metadata = { title: "산정 기준 — 다셀" };

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
  const vq = read<Validation & { generated: string }>("data/quality/validation.json");
  const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);
  const gq = read<{ meta: { fetched: string }; areas_ok: number; summary: Record<string, { lines: number; min_kw: number; max_kw: number }> }>("data/quality/grid.json");
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
        <p>예: 250kW → 500kWh → 1단위, 팩 14개. 657kW → 1,314kWh가 아니라 1,000kWh 1단위, 팩 28개. 설치용량 {C.PV_MIN_KW.value}kW 미만은 ESS를 산정하지 않습니다. 충전율 상한은 옥외 {C.SOC_MAX.value * 100}%, 옥내 {C.SOC_MAX_INDOOR.value * 100}%입니다({C.SOC_MAX.source}). 피크 저감 효과는 공장 계약전력과 부하 자료가 있어야 계산할 수 있어 넣지 않았습니다. 시간대 차익은 요금표만으로 추정한 값(예: 500kWh → 약 744만 원/년)이라 태양광 절감과 따로 표시합니다. 공지가 ESS 단위 수보다 모자라면 'ESS 공간 부족 — 옥상·별동 검토'를 표시하며, 대지면적을 모르는 건물은 판단하지 않습니다.</p>
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
        <p>예: 250kW × 140만 원 = 3.5억 원, 회수 5.1~6.5년. kW당 설치비는 {C.CAPEX_PER_KW.source}이며 범위는 {n(C.CAPEX_PER_KW.range[0] / 10000)}만~{n(C.CAPEX_PER_KW.range[1] / 10000)}만 원입니다. 보조금, 유지비, 발전량 저하, 금융비용은 넣지 않은 단순 계산입니다. 지붕 임대와 전력 판매 방식은 임대료·판매단가 자료를 확보하지 못해 계산하지 않았고, ESS 투자비도 재사용 배터리 단가가 정해지지 않아 넣지 않았습니다.</p>
      </Section>

      <Section id="score" title="설치 적합도·설치 조건">
        <p>적합도는 아래 항목의 점수를 더한 값입니다. 항목 값이 없는 건물은 그 항목을 0점으로 둡니다. 전 건물에 자료가 없는 항목(현재 위험물 거리·배전 여유)은 만점에서 빼서 <strong>{maxAvailable()}점 만점</strong>으로 표시합니다.</p>
        <Table head={["항목", "배점", "기준"]} rows={[
          ["규모", WEIGHTS.scale, "500kW 이상 30 / 200~499 22 / 100~199 15 / 30~99 8 / 30 미만 0"],
          ["구조", WEIGHTS.struct, "철근콘크리트·철골철근콘크리트·철골콘크리트·프리캐스트콘크리트 20 / 일반철골·경량철골·강파이프·기타강구조 12 / 조적·목조·기타 5 / 정보 없음 0"],
          ["사용 연수", WEIGHTS.age, "10년 미만 15 / 10~19년 12 / 20~29년 6 / 30년 이상·정보 없음 0"],
          ["전력수요 업종", WEIGHTS.industry, "다소비 업종 15 / 그 밖의 제조 8 / 등록공장 미연결 0"],
          ["안전 이격(위험물)", WEIGHTS.hazmat, "자료 미확보로 미반영"],
          ["배전 여유", WEIGHTS.grid, "자료 미확보로 미반영"],
        ]} />
        <Table head={["단계", "기준"]} rows={[
          ["설치 우선", `만점의 70% 이상(현재 ${Math.round(maxAvailable() * 0.7)}점)이고 설치 조건 '통과'`],
          ["검토", `만점의 50% 이상(현재 ${Math.round(maxAvailable() * 0.5)}점)이거나, 70% 이상이지만 설치 조건 '조건부'`],
          ["보류", "만점의 50% 미만 또는 30kW 미만"],
        ]} />
        <p><strong>설치 조건</strong>: 구조 정보가 없거나 사용승인 30년 이상이면 '조건부(구조검토 필수)'입니다. 철골 계열과 경량 지붕은 하중·방수 확인이 필요하고, 의약·식품 업종은 옥상 설비와 청정구역 확인이 필요합니다. 산단 관리기본계획에 태양광 발전사업이 들어 있는지는 아직 확인하지 못해 판매·임대 방식에는 '확인 필요'를 표시합니다. 위험물시설 거리는 자료를 확보하지 못해 판정에 쓰지 않으며, 모든 건물에 “{HAZMAT_CHIP_P0}”을 표시합니다.</p>
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
        <Section id="validation" title="기존 설치 건물로 본 검증">
          <p>적합도 점수가 실제와 맞는지 보려고, 후보 {n(vq.candidates)}동의 지붕을 위성영상에서 사람이 직접 보고 태양광 패널이 이미 있는지 표시했습니다{vq.imageYears.length ? ` (영상 ${vq.imageYears.join("·")}년)` : ""}. 이미 설치한 공장은 설치할 만해서 설치한 곳이므로, 점수 상위에 이런 건물이 많이 들어올수록 점수가 현실과 맞는다고 볼 수 있습니다.</p>
          <Table head={["항목", "값"]} rows={[
            ["표시한 건물", `${n(vq.labeled)}동 / ${n(vq.candidates)}동 (설치 ${n(vq.counts.설치)} · 미설치 ${n(vq.counts.미설치)} · 불명 ${n(vq.counts.불명)} · 두 사람 불일치 ${n(vq.counts.불일치)})`],
            ["표시한 사람", vq.labelers.map((l) => `${l.count}동`).join(" · ") || "–"],
            ["두 사람이 같이 본 건물의 일치율", vq.overlap ? `${pct(vq.agreement)} (${n(vq.overlap)}동${vq.kappa !== null ? `, 카파 ${vq.kappa}` : ""})` : "한 사람만 표시"],
            ["전체 설치 비율(기준)", pct(vq.baseRate)],
            ...vq.topK.map((t) => [`점수 상위 ${t.k * 100}% (${n(t.n)}동) 중 설치 비율`, `${pct(t.precision)}${t.lift !== null ? ` · 기준의 ${t.lift}배` : ""}${t.recall !== null ? ` · 설치 건물의 ${pct(t.recall)} 포함` : ""}`]),
            ["설치 건물이 미설치 건물보다 점수가 높을 확률", vq.auc === null ? "–" : pct(vq.auc)],
            ["평균 점수", `설치 ${vq.mean.installed ?? "–"}점 · 미설치 ${vq.mean.notInstalled ?? "–"}점`],
          ]} />
          <Table head={["점수 구간", "설치", "미설치"]} rows={vq.bins.filter((b) => b.installed + b.notInstalled > 0).map((b) => [`${b.from}~${b.to}점`, b.installed, b.notInstalled])} />
          <p>'불명'과 두 사람의 표시가 다른 건물은 계산에서 뺐습니다. 다시 계산하려면 <code>npx tsx scripts/06_validate.ts</code>를 실행합니다({vq.generated} 계산).</p>
        </Section>
      )}

      <Section id="industry" title="업종 분류">
        <p>등록공장은 주소 좌표가 떨어진 건물과 같은 필지의 다른 동에도 함께 연결합니다(동 구분 불가). 그래서 창고나 부속동도 같은 업종 점수를 받습니다.</p>
        <p>등록공장현황에는 업종코드가 없어 생산품 문구의 키워드로 분류합니다. 아래 키워드가 들어 있으면 다소비 업종(15점), 그 밖의 생산품은 제조(8점)입니다.</p>
        <Table head={["업종군", "KSIC", "키워드"]} rows={keywords().map((k) => [k.group, k.ksic, k.words.join(", ")])} />
      </Section>

      <Section id="constants" title="상수와 출처">
        <Table id="TBL-04" head={["항목", "값", "구분", "허용 범위", "출처", "기준일"]} rows={Object.values(C).map((c) => [c.label, `${c.value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${c.unit ? ` ${c.unit}` : ""}`, c.kind, "range" in c && c.range ? `${c.range[0]}~${c.range[1]}` : "–", c.source, c.asOf])} />
      </Section>

      <Section id="tariff" title={`요금표 — ${TARIFF.name}`}>
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
          ["한국전력공사 분산전원연계 정보", gq.meta.fetched, "읍면동·리 단위 배전선로 여유용량(참고, 점수 미반영)", `${gq.areas_ok}개 리 · 선로 여유 ${n(Math.min(...Object.values(gq.summary).map((v) => v.min_kw)))}~${n(Math.max(...Object.values(gq.summary).map((v) => v.max_kw)))}kW`],
          ["브이월드(국토교통부)", "–", "위성 배경지도, 주소 좌표 변환", "장애 시 Esri World Imagery로 표시"],
          ["Global Solar Atlas", C.PVOUT.asOf, "연간 발전량 계수", `${n(C.PVOUT.value)} kWh/kWp (36.72N 127.43E)`],
        ]} />
        <p>대상 건물은 산단 경계 안(건물 대표점 기준)에서 용도가 {bq.target_use.join("·")}인 건물입니다. 교육연구시설 중 학교는 뺐습니다. 용도 정보가 없는 건물은 도형 면적 600㎡ 이상이거나 등록공장이 연결된 경우만 대상으로 하고 '용도 미확인'으로 표시합니다(현재 {n(rq.null_after.use)}동). 대상 건물 {n(rq.target_after)}동 가운데 회사가 연결된 건물은 {n(fq.target_with_company)}동입니다.</p>
        <p>산업단지 경계도면은 공공누리 제4유형(출처표시·비상업·변경금지) 자료입니다.</p>
      </Section>

      <Section id="limits" title="한계">
        <ul className="list-disc space-y-1 pl-5">
          <li>GIS건물통합정보는 구축기관이 달라 참고용입니다. 도형과 건축물대장이 어긋난 건물이 있습니다.</li>
          <li>지붕 이용률, kW당 면적, 팩 정격, 잔존용량, 저장 시간은 초기 가정값입니다. 시뮬레이터에서 범위를 바꿔 볼 수 있습니다.</li>
          <li>재사용 배터리의 법정 성능등급 기준은 2027년 5월 시행 전이라 정해지지 않았습니다.</li>
          <li>지붕 하중, 방수, 기존 설비, 음영은 반영하지 않았습니다. 구조검토가 필요합니다.</li>
          <li>위험물시설 거리는 자료를 확보하지 못해 반영하지 않았습니다.</li>
          <li>배전선로 여유용량은 한전 자료가 리 단위로만 조회되어, 건물이 어느 선로에 연결되는지 알 수 없습니다. 패널에 참고 정보로만 보여 주고 점수에는 넣지 않았습니다.</li>
          <li>업종은 생산품 문구로 추정한 것이며 실제 전력 사용량과 다를 수 있습니다.</li>
        </ul>
      </Section>
    </main>
  );
}
