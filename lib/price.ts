import { CONSTANTS } from "./constants";

export interface Price {
  unitCost: number;
  month: string;
  fallback: boolean;
  loading: boolean;
}

export const FALLBACK_PRICE: Price = {
  unitCost: CONSTANTS.PRICE_FALLBACK.value,
  month: CONSTANTS.PRICE_FALLBACK.asOf.replace("-", "."),
  fallback: true,
  loading: false,
};
