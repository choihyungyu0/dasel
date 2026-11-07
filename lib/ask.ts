// 질의응답: 서버가 계산해 둔 결과(합계·건물표)만 근거로 넘기고, 답의 숫자는 근거에 있는 것만 허용한다.
import { summarize, toManwon } from "./calc";
import { enrich, type Building, type RawBuilding } from "./data";
import { DEFAULT_FILTERS, passes } from "./filters";
import { FORBIDDEN, numbersIn } from "./opinion";
import { rankMap } from "./rank";
import { topByKw } from "./top";

const PART: Record<string, string> = { scale: "규모", struct: "구조", age: "사용 연수", industry: "전력수요 업종", hazmat: "안전 이격", grid: "배전 여유" };

export const ASK_MAX_CHARS = 300;
export const ASK_EXAMPLES = [
  "오창 산단 전체에 추가로 설치할 수 있는 태양광 용량은?",
  "설치 우선 단계 건물 중 연 절감액이 가장 큰 곳은?",
  "유한양행 건물이 설치 우선인 이유는?",
  "오창2 산단에서 검토할 만한 건물 5곳",
  "복수 입주라 건물주 승낙이 필요한 설치 우선 건물은?",
];
export const ASK_FOOT = "1차 검토(현장·구조검토 전) · 다셀 계산 결과만 근거로 답변";

export const ASK_SYSTEM = `너는 오창 산업단지 공장 지붕 태양광·재사용 배터리 ESS 1차 검토 도구 '다셀'의 질의응답 담당이다.
아래 [자료]에 있는 사실만으로 한국어로 답한다. 외부 지식, 추정, 새 숫자를 쓰지 않는다.
숫자는 [자료]에 적힌 표기를 그대로 옮긴다. 더하거나 나누거나 반올림하지 않는다. 합계가 필요하면 [자료]의 합계 줄을 쓴다.
[자료]에 없는 내용이면 "다셀 자료로는 확인할 수 없음"이라고 쓰고, 확인할 곳(현장 구조검토, 한전, 소방 등)을 한 줄로 안내한다.
개조식 명사형으로 짧게 쓴다(5줄 이내, '-'로 나열 가능). 대시(—)를 쓰지 않는다.
"안전 보장", "확정", "위험 없음", "AI가 판단", "설치 가능" 같은 단정 표현을 쓰지 않는다. 결과는 1차 검토이며 최종 판단은 현장·구조검토다.
건물을 말할 때는 회사명과 산단을 함께 쓴다.
단계(설치 우선·검토·보류)나 산단을 지정한 질문은 건물표에서 그 단계·산단 열이 일치하는 건물만 고른다. 목록을 달라고 하면 건물표 순위 순서로 고른다.
한 회사에 건물이 여러 동이면 순위가 가장 높은 1동을 기준으로 답하고 "같은 회사 건물 N동" 식으로 동 수만 덧붙인다. 다른 동의 숫자를 섞지 않는다.
"상위 N동"을 물으면 점수순(건물표 순위)인지 용량순(설치용량 큰 순)인지 먼저 밝힌다. 구분이 없으면 점수순으로 답하고 용량순은 '용량 큰 30동' 합계 줄을 함께 알려 준다. 두 기준을 섞지 않는다. 비율을 물으면 그 줄의 "전체 추가 용량 대비 N%"를 그대로 쓴다.`;

export interface AskData {
  meta: { source: string; base_date: string; built: string; factory_source?: string; register_source?: string };
  buildings: RawBuilding[];
}

const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "정보 없음" : v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));

function line(b: Building, rank: number | undefined): string {
  const c = b.calc;
  const x = b.extra;
  return [
    rank ?? (b.score.tier === "이미 설치됨" ? "설치됨" : "-"),
    b.companies.map((co) => co.company).join("/") || `${b.name ?? "건물"}(등록공장 미연결, ${b.addr ?? "주소 정보 없음"})`,
    b.complex_nm,
    `${n(c.pv_kw, 1)}kW`,
    b.score.tier,
    `${b.score.score}/${b.score.max}점`,
    `연절감 ${n(c.save_low === null ? null : toManwon(c.save_low))}~${n(c.save_base === null ? null : toManwon(c.save_base))}만원`,
    `팩 ${n(c.packs)}개`,
    `ESS ${n(c.ess_kwh)}kWh`,
    `게이트 ${b.score.gate}`,
    `구조 ${b.struct ?? "정보 없음"}`,
    `사용승인 ${b.apr_ymd ? b.apr_ymd.slice(0, 4) : "정보 없음"}`,
    `내진 ${x?.seismic ?? "정보 없음"}`,
    `토지 ${x?.land ?? "정보 없음"}`,
    x?.multi ? "복수 입주" : "",
    x?.permit_years?.length ? `최근 증축 허가 ${x.permit_years.join("·")}` : "",
  ].filter(Boolean).join(" | ");
}

function totals(label: string, list: Building[]): string {
  const s = summarize(list);
  return `${label}: 대상 ${n(s.buildings)}동 · 추가 설치 ${n(s.mw, 1)}MW · 연 발전 ${n(s.gwh, 1)}GWh · 연 절감 ${n(toManwon(s.save_low) / 10000, 1)}~${n(toManwon(s.save_base) / 10000, 1)}억 원 · 감축 ${n(s.co2_t)}tCO2 · 재사용 팩 ${n(s.packs)}개 · 이미 설치 ${n(s.installed)}동(포함 시 ${n(s.mw_with_installed, 1)}MW)`;
}

/** [자료] 문단. 질문에 회사명이 나오면 그 건물의 사유도 붙인다 */
export function buildContext(data: AskData, labels: Record<string, string>, extra: Record<string, Building["extra"]>, unitCost: number, question: string): string {
  const base = data.meta.built.replaceAll("-", "");
  const all = data.buildings.map((r) => enrich({ ...r, installed: labels[String(r.bld_id)] === "설치" || undefined, extra: extra[String(r.bld_id)] }, base, unitCost));
  const list = all.filter((b) => passes(b, DEFAULT_FILTERS, null)).sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0));
  const rank = rankMap(list);
  const shown = list.filter((b) => !b.calc.small && b.calc.pv_kw !== null);
  const complexes = [...new Set(list.map((b) => b.complex_nm))];
  const named = shown.filter((b) => b.companies.some((co) => question.includes(co.company.replace(/\(주\)|㈜|주식회사|\s/g, "")))).slice(0, 5);
  return [
    `[자료] 기준: ${data.meta.source} ${data.meta.base_date} · 전기요금 단가 ${unitCost}원/kWh(하한 150원) · 이용률 50% · 10㎡/kW 가정 · 단계 기준 점수 63점 이상 설치 우선, 45점 이상 검토`,
    totals("오창 산단 전체", list),
    ...complexes.map((c) => totals(c, list.filter((b) => b.complex_nm === c))),
    ...["점수순", "용량순"].map((k) => `${totals(k === "점수순" ? "점수순 상위 30동(건물표 순위 1~30)" : "용량 큰 30동(이미 설치됨 제외, 설치용량 내림차순, 점수 순위와 별개)", k === "점수순" ? list.filter((b) => (rank.get(b.bld_id) ?? 1e9) <= 30) : topByKw(list))} · 전체 추가 용량 대비 ${n((summarize(k === "점수순" ? list.filter((b) => (rank.get(b.bld_id) ?? 1e9) <= 30) : topByKw(list)).mw / summarize(list).mw) * 100, 1)}%`),
    `단계별 동 수: ${["설치 우선", "검토", "보류", "이미 설치됨"].map((t) => `${t} ${shown.filter((b) => b.score.tier === t).length}동`).join(" · ")}`,
    "건물표(순위 | 회사 | 산단 | 설치용량 | 단계 | 점수 | 연 절감 | 재사용 팩 | ESS | 게이트 | 구조 | 사용승인 | 내진설계 | 토지 소유 | 참고):",
    ...shown.map((b) => line(b, rank.get(b.bld_id))),
    ...named.map((b) => `${b.companies[0].company} 사유: ${b.score.chips.join(", ") || "없음"} · 점수 항목 ${Object.entries(b.score.parts).map(([k, v]) => `${PART[k] ?? k} ${v}점`).join(", ")}`),
  ].join("\n");
}

/** 답 검사: 근거에 없는 숫자, 금지 표현 */
export function checkAnswer(answer: string, context: string): string[] {
  const allowed = new Set(numbersIn(context));
  // 순위·개수 표현(1~10)은 허용
  const stray = [...new Set(numbersIn(answer))].filter((x) => !allowed.has(x) && !(Number(x) >= 1 && Number(x) <= 10 && Number.isInteger(Number(x))));
  const out: string[] = [];
  if (stray.length) out.push(`근거에 없는 숫자: ${stray.join(", ")}`);
  if (FORBIDDEN.test(answer) || answer.includes("—")) out.push("금지 표현");
  return out;
}
