"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadDataset, reprice, type Building, type Dataset } from "@/lib/data";
import { DEFAULT_FILTERS, passes, type Filters } from "@/lib/filters";
import { FALLBACK_PRICE, type Price } from "@/lib/price";

type Status = "loading" | "error" | "ready";

interface Store {
  status: Status;
  reload: () => void;
  /** 지도 도형용(단가와 무관) */
  base: Dataset | null;
  ds: Dataset | null;
  price: Price;
  refreshPrice: () => void;
  complexCd: string | null;
  setComplexCd: (cd: string | null) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  /** 필터를 통과한 대상 건물(점수 내림차순). 지도 배지와 목록이 같은 배열을 쓴다. */
  filtered: Building[];
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  /** 둘러보기 다시 보기 요청(값이 바뀌면 지도 화면이 투어를 시작한다) */
  tourNonce: number;
  requestTour: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider 밖에서 useStore를 썼습니다");
  return s;
}

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [base, setBase] = useState<Dataset | null>(null);
  const [price, setPrice] = useState<Price>(FALLBACK_PRICE);
  const [complexCd, setComplexCd] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tourNonce, setTourNonce] = useState(0);
  const requestTour = useCallback(() => setTourNonce((n) => n + 1), []);

  const reload = useCallback(() => {
    setStatus("loading");
    loadDataset()
      .then((d) => {
        setBase(d);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);
  useEffect(reload, [reload]);

  // DAT-08: 실패해도 기준값으로 계속 동작한다.
  const refreshPrice = useCallback(() => {
    setPrice((p) => ({ ...p, loading: true }));
    fetch("/api/tariff", { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((t: { latest: number; month: string; fallback: boolean }) => setPrice({ unitCost: t.latest, month: t.month, fallback: t.fallback, loading: false }))
      .catch(() => setPrice({ ...FALLBACK_PRICE }));
  }, []);
  useEffect(refreshPrice, [refreshPrice]);

  const ds = useMemo(() => (base ? reprice(base, price.unitCost) : null), [base, price.unitCost]);
  const filtered = useMemo(
    () =>
      (ds?.buildings ?? [])
        .filter((b) => passes(b, filters, complexCd))
        .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0)),
    [ds, filters, complexCd],
  );

  const value = { status, reload, base, ds, price, refreshPrice, complexCd, setComplexCd, filters, setFilters, filtered, selectedId, setSelectedId, tourNonce, requestTour };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
