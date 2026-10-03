// SIM-01·OUT-03: 시뮬레이터 조건 ↔ URL 문자열(s=u50.a10.p192.h2.k60.sa70.sx90)
import { DEFAULTS, type Assumptions } from "./calc";
import { CONSTANTS as C } from "./constants";

export interface Scenario extends Assumptions {
  /** 기준 단가(원/kWh) */
  price: number;
}

export const PRICE_RANGE: [number, number] = [100, 300];

interface Field {
  code: string;
  key: keyof Scenario;
  scale: number;
  range: readonly [number, number];
}

// 접두어가 겹치므로(s·sa·sx) 긴 코드부터 맞춘다
const FIELDS: Field[] = [
  { code: "sa", key: "aRatio", scale: 100, range: C.A_RATIO.range },
  { code: "sx", key: "socMax", scale: 100, range: C.SOC_MAX.range },
  { code: "in", key: "indoor", scale: 1, range: [0, 1] },
  { code: "n", key: "essUnits", scale: 1, range: C.ESS_UNITS.range },
  { code: "u", key: "util", scale: 100, range: C.UTIL.range },
  { code: "a", key: "m2PerKw", scale: 1, range: C.M2_PER_KW.range },
  { code: "p", key: "price", scale: 1, range: PRICE_RANGE },
  { code: "h", key: "essHours", scale: 1, range: C.ESS_HOURS.range },
  { code: "k", key: "packKwh", scale: 1, range: C.PACK_KWH.range },
];
const ORDER = ["u", "a", "p", "h", "k", "sa", "sx"];

export const defaultScenario = (price: number): Scenario => ({ ...DEFAULTS, price });

export function encodeScenario(s: Scenario): string {
  const part = (code: string) => {
    const f = FIELDS.find((x) => x.code === code)!;
    return `${code}${Math.round(s[f.key] * f.scale * 10) / 10}`;
  };
  // 기본값(옥외·1단위)일 때는 예전 형식 그대로 둔다
  return [...ORDER.map(part), ...(s.essUnits !== DEFAULTS.essUnits ? [part("n")] : []), ...(s.indoor ? [part("in")] : [])].join(".");
}

/** 범위 밖·해석 불가 값은 기본값으로 바꾸고 adjusted=true로 알린다. */
export function decodeScenario(text: string | null, price: number): { scenario: Scenario; adjusted: boolean } {
  const scenario = defaultScenario(price);
  if (!text) return { scenario, adjusted: false };
  // 값에 소수점이 올 수 있으므로(예: p192.4) 구분자로 자르지 않고 "코드+숫자" 단위로 읽는다
  const tokens = [...text.matchAll(/([a-z]+)(\d+(?:\.\d+)?)/g)];
  let adjusted = tokens.map((t) => t[0]).join(".") !== text;
  for (const [, code, num] of tokens) {
    const f = FIELDS.find((x) => x.code === code);
    const v = f ? Number(num) / f.scale : NaN;
    if (!f || v < f.range[0] || v > f.range[1]) adjusted = true;
    else scenario[f.key] = v;
  }
  // 옥내 설치는 충전율 상한 80%까지(BR-L1)
  if (scenario.indoor && scenario.socMax > C.SOC_MAX_INDOOR.value) {
    scenario.socMax = C.SOC_MAX_INDOOR.value;
    adjusted = true;
  }
  return { scenario, adjusted };
}
