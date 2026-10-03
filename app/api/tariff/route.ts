// DAT-08: 한전 전력데이터 개방포털에서 청주 산업용 평균판매단가를 받아온다. 실패하면 기준값으로 답한다.
import { NextResponse } from "next/server";
import { CONSTANTS } from "@/lib/constants";

// 빌드 때 한 번 계산해 굳히지 않는다. 성공한 응답만 CDN에 24시간 둔다(실패·기준값은 캐시하지 않음).
export const dynamic = "force-dynamic";

const CACHE_OK = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };
const NO_STORE = { "Cache-Control": "no-store" };

const ENDPOINT = "https://bigdata.kepco.co.kr/openapi/v1/powerUsage/contractType.do";
const TIMEOUT_MS = 5000;

interface Tariff {
  latest: number;
  month: string;
  min: number;
  max: number;
  fetchedAt: string;
  fallback: boolean;
}

const fallback = (): Tariff => {
  const p = CONSTANTS.PRICE_FALLBACK;
  return { latest: p.value, month: p.asOf.replace("-", "."), min: p.value, max: p.value, fetchedAt: new Date().toISOString(), fallback: true };
};

async function monthCost(key: string, year: number, month: number, signal: AbortSignal): Promise<number | null> {
  const q = new URLSearchParams({ year: String(year), month: String(month).padStart(2, "0"), metroCd: "43", cityCd: "110", cntrCd: "", apiKey: key, returnType: "json" });
  const res = await fetch(`${ENDPOINT}?${q}`, { signal, cache: "no-store" });
  if (!res.ok) return null;
  const rows: { cntr?: string; unitCost?: number | string }[] = (await res.json()).data ?? [];
  const cost = Number(rows.find((r) => r.cntr === "산업용")?.unitCost);
  return cost >= 100 && cost <= 300 ? cost : null;
}

export async function GET() {
  const key = process.env.KEPCO_API_KEY;
  if (!key) return NextResponse.json(fallback(), { headers: NO_STORE });
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 1));
    const costs = await Promise.all(months.map((d) => monthCost(key, d.getFullYear(), d.getMonth() + 1, signal).catch(() => null)));
    const i = costs.findIndex((c) => c !== null); // 최신월이 비어 있으면 직전 월
    if (i < 0) return NextResponse.json(fallback(), { headers: NO_STORE });
    const valid = costs.filter((c): c is number => c !== null);
    const d = months[i];
    const body: Tariff = {
      latest: costs[i]!, month: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
      min: Math.min(...valid), max: Math.max(...valid), fetchedAt: now.toISOString(), fallback: false,
    };
    return NextResponse.json(body, { headers: CACHE_OK });
  } catch {
    return NextResponse.json(fallback(), { headers: NO_STORE });
  }
}
