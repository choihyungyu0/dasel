// 서버 API 공용: 사용량 제한(IP당 분당 30회 + 전체 분당 120회)과 24시간 메모리 캐시.
// 서버리스 인스턴스마다 따로 센다(인스턴스가 여러 개면 실제 허용량은 조금 더 클 수 있음).

export const IP_LIMIT = 30;
export const GLOBAL_LIMIT = 120;
export const LIMIT_MSG = "요청이 많아 잠시 후 다시 시도해 주세요(약 30초)";

export function makeLimiter(ipLimit = IP_LIMIT, globalLimit = GLOBAL_LIMIT) {
  const hits = new Map<string, number[]>();
  let all: number[] = [];
  return (ip: string, now = Date.now()): boolean => {
    all = all.filter((t) => now - t < 60_000);
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= ipLimit || all.length >= globalLimit) {
      hits.set(ip, recent);
      return true;
    }
    recent.push(now);
    all.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return false;
  };
}

export function makeCache<T>(ttlMs = 24 * 3600_000, max = 500) {
  const m = new Map<string, { at: number; v: T }>();
  return {
    get(k: string, now = Date.now()): T | undefined {
      const e = m.get(k);
      if (!e) return undefined;
      if (now - e.at > ttlMs) {
        m.delete(k);
        return undefined;
      }
      return e.v;
    },
    set(k: string, v: T, now = Date.now()) {
      if (m.size >= max) m.delete(m.keys().next().value as string);
      m.set(k, { at: now, v });
    },
    get size() {
      return m.size;
    },
  };
}

export const clientIp = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0].trim() || "local";
