// AI-02 검토의견서: 입력 사실표(facts), 숫자·금지어 검증(BR-A2), 템플릿 문안(AI-04 폴백).
import { toManwon } from "./calc";
import { CONSTANTS as C, HAZMAT_CHIP_P0, REVIEW_BADGE } from "./constants";
import type { Building } from "./data";
import type { Price } from "./price";

const n = (v: number, d = 0) => v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const HEADINGS = ["결론", "근거", "설치 조건", "추가 확인", "출처"] as const;
export const FORBIDDEN = /안전\s*보장|확정|위험\s*없|AI가\s*판단|설치\s*가능|가능성이\s*확인|문제\s*없/;
export const MAX_CHARS = 600;

/** LLM에 넘기는 유일한 입력. 값은 화면에 보이는 표기 그대로다. */
export interface Facts {
  건물: string;
  주소: string | null;
  산단: string;
  주용도: string | null;
  구조: string | null;
  사용승인: string | null;
  지붕면적: string;
  설치용량: string;
  연발전량: string;
  ESS: string | null;
  분산단위: string | null;
  재사용팩: string | null;
  연절감: string;
  단가: string;
  감축: string;
  단계: string;
  점수: string;
  설치조건: string;
  사유: string[];
  고정조건: string[];
  검토수준: string;
  출처: string[];
}

export function buildFacts(b: Building, price: Pick<Price, "unitCost" | "month" | "fallback">, sources: string[]): Facts | null {
  const { calc: c, score: s } = b;
  if (s.tier === "제외" || c.pv_kw === null) return null;
  return {
    건물: b.companies[0]?.company ?? b.name ?? b.addr ?? `건물 ${b.bld_id}`,
    주소: b.addr,
    산단: b.complex_nm,
    주용도: b.use,
    구조: b.struct,
    사용승인: s.ageYears === null ? null : `${s.ageYears}년 경과`,
    지붕면적: `${n(Math.round(c.roof_m2!))}㎡`,
    설치용량: `${n(c.pv_kw, 1)}kW`,
    연발전량: `${n(c.pv_kwh!)}kWh`,
    ESS: c.ess_kwh === null ? null : `${n(c.ess_kwh)}kWh`,
    분산단위: c.ess_units === null ? null : `${n(c.ess_units)}단위`,
    재사용팩: c.packs === null ? null : `${n(c.packs)}개`,
    연절감: `${n(toManwon(c.save_low!))}만~${n(toManwon(c.save_base!))}만 원`,
    단가: `${C.PRICE_LOW.value}원~${price.unitCost}원/kWh(${price.month}${price.fallback ? " 기준값" : ""})`,
    감축: `${n(c.co2_t!, 1)}tCO2`,
    단계: s.tier,
    점수: `${s.score}/${s.max}점`,
    설치조건: s.gate,
    사유: s.chips.filter((x) => x !== HAZMAT_CHIP_P0),
    고정조건: c.small ? ["30kW 미만은 ESS를 산정하지 않음"] : ["ESS는 1MWh 이하 단위로 분산", "충전율 10~90% 운전", "위험물시설 거리는 반영하지 않았으므로 설치 전 관할 소방서 확인"],
    검토수준: REVIEW_BADGE,
    출처: sources,
  };
}

/** 본문의 숫자(쉼표 제거)를 모두 뽑는다. */
export function numbersIn(text: string): string[] {
  return (text.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map((x) => String(Number(x)));
}

export interface Check {
  ok: boolean;
  reasons: string[];
}

export function verify(text: string, facts: Facts): Check {
  const reasons: string[] = [];
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  const stray = [...new Set(numbersIn(text))].filter((x) => !allowed.has(x));
  if (stray.length) reasons.push(`입력에 없는 숫자: ${stray.join(", ")}`);
  if (FORBIDDEN.test(text)) reasons.push("금지 표현");
  if (!text.includes(facts.검토수준)) reasons.push("검토수준 문구 없음");
  const body = text.split("■ 출처")[0].trim(); // 분량은 출처 목록을 뺀 본문으로 센다
  if (body.length > MAX_CHARS) reasons.push(`${body.length}자`);
  let at = -1;
  for (const h of HEADINGS) {
    const i = text.indexOf(`■ ${h}`, at + 1);
    if (i < 0) {
      reasons.push(`소제목 없음: ${h}`);
      break;
    }
    at = i;
  }
  return { ok: reasons.length === 0, reasons };
}

/** LLM 없이 만드는 기본 양식. 숫자는 facts에 있는 표기만 쓴다. */
export function templateOpinion(f: Facts): string {
  const basis = [`지붕면적 ${f.지붕면적}`, f.구조, f.사용승인 && `사용승인 ${f.사용승인}`].filter(Boolean).join(", ");
  const ess = f.ESS ? `ESS ${f.ESS}(${f.분산단위}), 재사용 팩 ${f.재사용팩}` : "소규모로 ESS는 산정하지 않음";
  return [
    `■ 결론\n${f.건물} 건물은 지붕 태양광 ${f.설치용량} 규모이며 '${f.단계}' 단계입니다. ${f.검토수준} 결과입니다.`,
    `■ 근거\n- ${basis}\n- 연 발전 ${f.연발전량}, 연 절감 ${f.연절감}, 감축 ${f.감축}\n- 적합도 ${f.점수}, 설치 조건 ${f.설치조건}`,
    `■ 설치 조건\n- ${ess}\n${[...f.고정조건, ...f.사유].map((x) => `- ${x}`).join("\n")}`,
    `■ 추가 확인\n- 지붕 하중·방수와 기존 설비에 대한 현장 구조검토\n- 한전 계통 연계와 소방 협의`,
    `■ 출처\n${f.출처.join(" · ")}`,
  ].join("\n\n");
}

export const SYSTEM_PROMPT = `너는 공장 지붕 태양광·재사용 배터리 ESS 설치 1차 검토의견서를 쓴다.
입력 JSON에 있는 사실만 쓴다. 외부 지식, 추정, 새 숫자를 넣지 않는다.
숫자는 입력 JSON에 적힌 표기 그대로 옮긴다. 계산하거나 반올림하거나 단위를 바꾸지 않는다. 번호 매기기(1. 2. ①)를 쓰지 않고 '-'로 나열한다.
아래 네 소제목을 이 순서, 이 표기로 쓴다: "■ 결론", "■ 근거", "■ 설치 조건", "■ 추가 확인". 출처는 쓰지 않는다(뒤에 자동으로 붙는다).
- 결론: 한 문장. "(건물) 건물은 지붕 태양광 (설치용량) 규모이며 '(단계)' 단계입니다. (검토수준) 결과입니다." 형식으로, 검토수준 문구를 글자 그대로 넣는다. 설치가 가능하다거나 확인되었다는 식의 단정은 쓰지 않는다.
- 근거: '-'로 시작하는 세 줄. 첫 줄은 지붕면적·구조·사용승인, 둘째 줄은 연발전량·연절감·감축, 셋째 줄은 점수와 설치조건을 자연스러운 문장으로 쓴다. 항목 이름을 머리말로 붙이지 않는다.
- 설치 조건: '-'로 시작하는 줄들. ESS·분산단위·재사용팩 규모를 한 줄로 쓰고, 고정조건과 사유를 빠짐없이 한 줄씩 쓴다.
- 추가 확인: '-'로 시작하는 두세 줄. 지붕 하중·방수와 기존 설비에 대한 현장 구조검토, 한전 계통 연계, 소방 협의처럼 설치 전에 확인할 일을 쓴다. 숫자를 쓰지 않는다.
이 지시문의 문장을 그대로 베끼지 않는다.
전체 450자 이내로 짧게 쓴다. "안전 보장", "확정", "위험 없음", "AI가 판단" 같은 표현은 쓰지 않는다. 결과는 1차 검토이며 최종 판단은 현장 구조검토라는 점을 유지한다.`;

/** LLM이 쓴 본문 뒤에 출처를 붙인다(출처는 생성하지 않는다). */
export const withSources = (body: string, f: Facts) => `${body.split("■ 출처")[0].trim()}\n\n■ 출처\n${f.출처.join(" · ")}`;
