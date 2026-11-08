import { CONSTANTS } from "./constants";

export interface Price {
  unitCost: number;
  month: string;
  fallback: boolean;
  loading: boolean;
  /** 고정 기준 단가(기본값). false = 실시간 조회 값 */
  fixed?: boolean;
}

/** 기본 계산 단가: 한전 청주 산업용 2026.08 평균단가로 고정(포트폴리오·캡처와 같은 숫자) */
export const FIXED_PRICE: Price = { unitCost: 189.7, month: "2026.08", fallback: false, loading: false, fixed: true };
export const FIXED_LABEL = `기준 단가 ${FIXED_PRICE.unitCost}원/kWh (한전 ${FIXED_PRICE.month} 고정)`;

export const FALLBACK_PRICE: Price = {
  unitCost: CONSTANTS.PRICE_FALLBACK.value,
  month: CONSTANTS.PRICE_FALLBACK.asOf.replace("-", "."),
  fallback: true,
  loading: false,
};
