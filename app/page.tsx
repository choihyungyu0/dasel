"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import BuildingPanel, { type Price } from "@/components/BuildingPanel";
import SummaryBanner from "@/components/SummaryBanner";
import { TIER_COLOR, USING_FALLBACK_IMAGERY } from "@/components/MapView";
import { CONSTANTS } from "@/lib/constants";
import { loadDataset, reprice, summaryOf, topBuilding, type Dataset } from "@/lib/data";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type State = { status: "loading" } | { status: "error" } | { status: "ready"; ds: Dataset };

const FALLBACK_PRICE: Price = {
  unitCost: CONSTANTS.PRICE_FALLBACK.value,
  month: CONSTANTS.PRICE_FALLBACK.asOf.replace("-", "."),
  fallback: true,
  loading: false,
};

export default function Page() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [complexCd, setComplexCd] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [price, setPrice] = useState<Price>(FALLBACK_PRICE);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    loadDataset()
      .then((ds) => {
        setState({ status: "ready", ds });
        // MAP-07: ?b=건물ID 딥링크
        const id = Number(new URLSearchParams(location.search).get("b"));
        if (id) {
          if (ds.byId.has(id)) setSelectedId(id);
          else setToast("건물을 찾지 못했어요");
        }
      })
      .catch(() => setState({ status: "error" }));
  }, []);
  useEffect(load, [load]);

  // DAT-08: 최신 단가. 실패해도 기준값으로 계속 동작한다.
  const refreshPrice = useCallback(() => {
    setPrice((p) => ({ ...p, loading: true }));
    fetch("/api/tariff", { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((t: { latest: number; month: string; fallback: boolean }) => setPrice({ unitCost: t.latest, month: t.month, fallback: t.fallback, loading: false }))
      .catch(() => setPrice({ ...FALLBACK_PRICE }));
  }, []);
  useEffect(refreshPrice, [refreshPrice]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const base = state.status === "ready" ? state.ds : null;
  const ds = useMemo(() => (base ? reprice(base, price.unitCost) : null), [base, price.unitCost]);
  const summary = useMemo(() => (ds ? summaryOf(ds, complexCd) : null), [ds, complexCd]);
  const top = useMemo(() => (ds ? topBuilding(ds, complexCd) : null), [ds, complexCd]);
  const scope = ds?.complexes.find((c) => c.complex_cd === complexCd)?.complex_nm ?? "오창 산단 전체";
  const selected = ds && selectedId !== null ? (ds.byId.get(selectedId) ?? null) : null;
  const tierCounts = useMemo(() => {
    const out: Record<string, number> = {};
    ds?.buildings.forEach((b) => (!complexCd || b.complex_cd === complexCd) && (out[b.score.tier] = (out[b.score.tier] ?? 0) + 1));
    return out;
  }, [ds, complexCd]);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {base && <MapView ds={base} complexCd={complexCd} selectedId={selectedId} onSelect={setSelectedId} />}

      {state.status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-800 text-sm text-slate-200">공장 건물 불러오는 중</div>
      )}
      {state.status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100">
          <div className="text-center">
            <p className="mb-3 text-sm">건물 데이터를 불러오지 못했어요</p>
            <button type="button" onClick={load} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">다시 시도</button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 md:p-3">
        <header className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/92 px-3 py-2 shadow-sm ring-1 ring-slate-900/10 backdrop-blur">
          <h1 className="text-base font-bold tracking-tight">다셀</h1>
          <nav id="NAV-01" className="flex gap-1 whitespace-nowrap text-sm">
            <span className="rounded-md bg-slate-900 px-2.5 py-1 text-white">지도</span>
            <span data-tour="nav-sim" className="rounded-md px-2.5 py-1 text-slate-400">시뮬레이터</span>
            <span className="rounded-md px-2.5 py-1 text-slate-400">후보 목록</span>
          </nav>
          {ds && (
            <div id="SEG-02" data-tour="complex" className="flex gap-1 overflow-x-auto whitespace-nowrap text-sm md:ml-auto">
              <button type="button" onClick={() => setComplexCd(null)} className={`rounded-md px-2.5 py-1 ${complexCd === null ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>전체</button>
              {ds.complexes.map((c) =>
                c.status === "조성 중" ? (
                  <span key={c.complex_cd} title="대상 건물이 아직 없습니다" className="rounded-md px-2.5 py-1 text-slate-400">{c.complex_nm} <small>조성 중</small></span>
                ) : (
                  <button key={c.complex_cd} type="button" onClick={() => setComplexCd(c.complex_cd)} className={`rounded-md px-2.5 py-1 ${complexCd === c.complex_cd ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>{c.complex_nm}</button>
                ),
              )}
            </div>
          )}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row md:items-start">
          <div className={`flex min-w-0 flex-1 flex-col gap-2 ${selected ? "max-md:hidden" : ""}`}>
            {ds && summary && (
              <div className="pointer-events-auto">
                <SummaryBanner
                  summary={summary}
                  scope={scope}
                  baseDate={ds.meta.base_date}
                  unitCost={price.unitCost}
                  priceLabel={price.fallback ? `기준값(${price.month})` : `한전 ${price.month}`}
                  hasTop={top !== null}
                  onTop={() => top && setSelectedId(top.bld_id)}
                />
              </div>
            )}
            {ds && USING_FALLBACK_IMAGERY && (
              <p className="pointer-events-auto self-start rounded-md bg-slate-900/80 px-2 py-1 text-[11px] text-white">위성 배경: Esri World Imagery로 표시 중</p>
            )}
          </div>

          {ds && selected && (
            <div className="mt-auto flex max-h-[62dvh] min-h-0 w-full flex-col md:mt-0 md:h-full md:max-h-full md:w-[380px] md:shrink-0">
              <BuildingPanel b={selected} ds={ds} price={price} onRefreshPrice={refreshPrice} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </div>
      </div>

      {ds && (
        <aside id="LGD-01" className={`absolute bottom-3 left-3 max-w-[280px] rounded-xl bg-white/92 px-3 py-2 text-[11px] shadow-sm ring-1 ring-slate-900/10 backdrop-blur ${selected ? "max-md:hidden" : ""}`}>
          <p className="mb-1 font-semibold">설치 적합도 단계</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {(Object.keys(TIER_COLOR) as (keyof typeof TIER_COLOR)[]).map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm" style={{ background: TIER_COLOR[t] }} />
                {t === "제외" ? "일반 건물" : t} <span className="num text-slate-500">{(tierCounts[t] ?? 0).toLocaleString("ko-KR")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-slate-500">
            {ds.meta.source} {ds.meta.base_date} · {ds.complexes[0]?.source} · 위험물·배전 여유는 아직 반영하지 않아 80점 만점입니다
          </p>
        </aside>
      )}

      {toast && <p role="status" className="absolute left-1/2 top-20 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">{toast}</p>}
    </main>
  );
}
