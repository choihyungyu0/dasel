// DAT-07 계산 상수. 화면에 나오는 모든 값은 출처·기준일을 함께 가진다(BR-O1).

export type Kind = "공식" | "가정";

export interface Const {
  value: number;
  unit: string;
  label: string;
  kind: Kind;
  source: string;
  asOf: string;
  /** 시뮬레이터 허용 범위(SIM-01) */
  range?: [number, number];
}

const ASSUMED = "초기 가정값(시뮬레이터에서 범위 조정 가능)";

export const CONSTANTS = {
  PVOUT: { value: 1427, unit: "kWh/kWp·년", label: "연간 발전량 계수", kind: "공식", source: "Global Solar Atlas (36.72N 127.43E)", asOf: "2026-10-03" },
  EMISSION: { value: 0.4173, unit: "tCO2eq/MWh", label: "전력 간접배출계수", kind: "공식", source: "2025 승인 국가 온실가스 배출·흡수계수(2023 소비단)", asOf: "2025" },
  PRICE_LOW: { value: 150, unit: "원/kWh", label: "절감 단가 하한", kind: "가정", source: "한전ON 산업용(을) 고압A 선택Ⅱ 낮 시간대 전력량요금 보수 가정", asOf: "2024-10-24" },
  PRICE_FALLBACK: { value: 192, unit: "원/kWh", label: "기준 단가(조회 실패 시)", kind: "공식", source: "한전 전력데이터 개방포털 계약종별 전력사용량(청주 산업용 평균판매단가)", asOf: "2026-06" },
  UTIL: { value: 0.5, unit: "", label: "지붕 이용률", kind: "가정", source: ASSUMED, asOf: "2026-10-03", range: [0.3, 0.7] },
  M2_PER_KW: { value: 10, unit: "㎡/kW", label: "kW당 설치 면적", kind: "가정", source: ASSUMED, asOf: "2026-10-03", range: [7, 12] },
  ESS_HOURS: { value: 2, unit: "h", label: "ESS 저장 시간", kind: "가정", source: ASSUMED, asOf: "2026-10-03", range: [1, 4] },
  ESS_UNIT_MAX: { value: 1000, unit: "kWh", label: "분산 단위 상한", kind: "가정", source: "ESS 화재 사례(1~5MWh 다수) 기준 1MWh 이하 분산 조건", asOf: "2026-10-03" },
  PV_MIN_KW: { value: 30, unit: "kW", label: "ESS 산정 최소 용량", kind: "가정", source: ASSUMED, asOf: "2026-10-03" },
  PACK_KWH: { value: 60, unit: "kWh", label: "재사용 팩 정격", kind: "가정", source: ASSUMED, asOf: "2026-10-03", range: [40, 80] },
  SOH_A: { value: 0.8, unit: "", label: "A등급 잔존용량", kind: "가정", source: "초기 가정값(법정 성능등급 기준은 2027.5 시행 전 미정)", asOf: "2026-10-03" },
  SOH_B: { value: 0.7, unit: "", label: "B등급 잔존용량", kind: "가정", source: "초기 가정값(법정 성능등급 기준은 2027.5 시행 전 미정)", asOf: "2026-10-03" },
  A_RATIO: { value: 0.7, unit: "", label: "A등급 비율", kind: "가정", source: ASSUMED, asOf: "2026-10-03", range: [0, 1] },
  SOC_MAX: { value: 0.9, unit: "", label: "충전율 상한(옥외 설치)", kind: "공식", source: "산업통상자원부 ESS 추가 안전대책(신규 설비 옥내 80%·옥외 90%)", asOf: "2020-02-06", range: [0.8, 0.9] },
  SOC_MAX_INDOOR: { value: 0.8, unit: "", label: "충전율 상한(옥내 설치)", kind: "공식", source: "산업통상자원부 ESS 추가 안전대책(신규 설비 옥내 80%·옥외 90%)", asOf: "2020-02-06" },
  ESS_UNITS: { value: 1, unit: "단위", label: "재사용 ESS 시범 단위 수", kind: "가정", source: "1MWh 이하 1단위 시범을 기본으로 가정", asOf: "2026-10-04", range: [1, 5] },
  CAPEX_PER_KW: { value: 1400000, unit: "원/kW", label: "태양광 kW당 설치비(참고값)", kind: "가정", source: "시공사 공개 견적(2026) 기준 참고값 — 공식 지원·표준단가 확보 시 교체", asOf: "2026", range: [1300000, 1650000] },
  ESS_EFF: { value: 0.85, unit: "", label: "ESS 왕복 효율", kind: "가정", source: "초기 가정값", asOf: "2026-10-04" },
  ESS_DAYS: { value: 250, unit: "일/년", label: "ESS 운영일", kind: "가정", source: "평일 운영을 가정한 초기 가정값", asOf: "2026-10-04" },
  ESS_UNIT_AREA: { value: 40, unit: "㎡/단위", label: "ESS 단위당 필요 면적", kind: "가정", source: "1MWh 이하 컨테이너 1기와 이격 공간을 합친 초기 가정값", asOf: "2026-10-04" },
  SMP: { value: 119.7, unit: "원/kWh", label: "계통한계가격(SMP, 육지)", kind: "공식", source: "전력거래소 월별 SMP 2026년 1~9월 단순평균", asOf: "2026-09" },
  SOC_MIN: { value: 0.1, unit: "", label: "충전율 하한", kind: "가정", source: ASSUMED, asOf: "2026-10-03" },
} as const satisfies Record<string, Const>;

/** 산업용(을) 고압A 선택Ⅱ 요금표(BR-C6). 전력량요금은 [경부하, 중간부하, 최대부하] 원/kWh. */
export const TARIFF = {
  name: "산업용(을) 고압A 선택Ⅱ",
  source: "한전ON 전기요금표(PRM004D00)",
  asOf: "2024-10-24",
  basicWonPerKw: 8320,
  energy: {
    summer: { months: [6, 7, 8], rates: [116.0, 163.8, 229.0] },
    springFall: { months: [3, 4, 5, 9, 10], rates: [116.0, 133.4, 150.9] },
    winter: { months: [11, 12, 1, 2], rates: [123.0, 164.0, 204.6] },
  },
  peakHours: { summer: "11~12시·13~18시", other: "09~12시·16~19시" },
} as const;

/** 최대부하 − 경부하 단가차의 월수 가중 평균(원/kWh, 소수 1자리). */
export function peakSpread(): number {
  const seasons = Object.values(TARIFF.energy);
  const sum = seasons.reduce((a, s) => a + (s.rates[2] - s.rates[0]) * s.months.length, 0);
  return Math.round((sum / 12) * 10) / 10;
}

export type ConstKey = keyof typeof CONSTANTS;

/** 출처·기준일이 빠진 상수 키 목록. 비어 있지 않으면 빌드를 중단한다(BR-O1). */
export function unsourcedConstants(): string[] {
  const missing = Object.entries(CONSTANTS)
    .filter(([, c]) => !c.source.trim() || !c.asOf.trim())
    .map(([k]) => k);
  if (!TARIFF.source.trim() || !TARIFF.asOf.trim()) missing.push("TARIFF");
  return missing;
}

export const REVIEW_BADGE = "1차 검토(현장·구조검토 전)";
export const HAZMAT_CHIP_P0 = "위험물시설 거리 미반영 — 설치 전 관할 소방서 확인";

/** SIM-03: 사용후 배터리 발생 전망. 두 값 모두 2차 자료 재인용이라 화면에 '추정'으로 표시한다. */
export const BATTERY_OUTLOOK = {
  nationwide2030: 107500,
  nationwideSource: "환경부 추정(뉴스핌 2026-05-20 보도 재인용)",
  chungbukShare: 0.0371,
  chungbukSource: "전기차 등록 2026-05 전국 1,053,623대·충북 39,109대(국토교통부 자동차등록 통계 재인용, 원자료 확인 전)",
} as const;
