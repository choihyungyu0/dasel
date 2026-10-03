"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BuildingPanel from "@/components/BuildingPanel";
import Filters from "@/components/Filters";
import { COLOR_SCALES, TIER_COLOR, type ColorBy, type Layers } from "@/components/MapView";
import SearchBox from "@/components/SearchBox";
import { useStore } from "@/components/Store";
import SummaryBanner from "@/components/SummaryBanner";
import { summarize } from "@/lib/calc";
import { DEFAULT_FILTERS, isDefault } from "@/lib/filters";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const LAYER_LABEL: [keyof Layers, string][] = [["complex", "산단 경계"], ["target", "대상 공장 건물"], ["general", "일반 건물"], ["station", "119안전센터"]];

export default function Page() {
  const { status, reload, base, ds, price, refreshPrice, complexCd, filters, setFilters, filtered, selectedId, setSelectedId } = useStore();
  const [colorBy, setColorBy] = useState<ColorBy>("tier");
  const [layers, setLayers] = useState<Layers>({ complex: true, target: true, general: true, station: false });
  const [showFilter, setShowFilter] = useState(false);
  const [fallbackImagery, setFallbackImagery] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; n: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // MAP-07: ?b=건물ID 딥링크
  useEffect(() => {
    if (!base) return;
    const id = Number(new URLSearchParams(location.search).get("b"));
    if (!id) return;
    if (base.byId.has(id)) setSelectedId(id);
    else setToast("건물을 찾지 못했어요");
  }, [base, setSelectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const summary = useMemo(() => summarize(filtered), [filtered]);
  const top = filtered.find((b) => b.score.tier === "설치 우선") ?? null;
  const passIds = useMemo(() => (isDefault(filters) && !complexCd ? null : new Set(filtered.map((b) => b.bld_id))), [filters, complexCd, filtered]);
  const scope = `${ds?.complexes.find((c) => c.complex_cd === complexCd)?.complex_nm ?? "오창 산단 전체"}${isDefault(filters) ? "" : " · 필터 적용"}`;
  const selected = ds && selectedId !== null ? (ds.byId.get(selectedId) ?? null) : null;
  const scale = COLOR_SCALES[colorBy];

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {base && (
        <MapView
          ds={base} complexCd={complexCd} selectedId={selectedId} onSelect={setSelectedId} colorBy={colorBy} layers={layers} passIds={passIds} flyTo={flyTo}
          padding={selected ? (wide ? { right: 400, bottom: 0 } : { right: 0, bottom: Math.round(innerHeight * 0.6) }) : { right: 0, bottom: 0 }}
          onFallback={() => setFallbackImagery(true)}
        />
      )}

      {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-slate-800 text-sm text-slate-200">공장 건물 불러오는 중</div>}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100">
          <div className="text-center">
            <p className="mb-3 text-sm">건물 데이터를 불러오지 못했어요</p>
            <button type="button" onClick={reload} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">다시 시도</button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 md:p-3">
        <AppHeader>
          {ds && (
            <SearchBox
              ds={ds}
              onPick={(it) => {
                if (it.bldId !== null) setSelectedId(it.bldId);
                else if (it.lon !== undefined && it.lat !== undefined) {
                  setSelectedId(null);
                  setFlyTo({ lon: it.lon, lat: it.lat, n: Date.now() });
                  setToast("등록공장 주소 위치로 이동했어요. 연결된 건물은 없습니다");
                } else setToast("주소 위치를 찾지 못한 공장이에요");
              }}
            />
          )}
        </AppHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row md:items-start">
          <div className={`flex min-w-0 flex-1 flex-col items-start gap-2 ${selected ? "max-md:hidden" : ""}`}>
            {ds && (
              <div className="pointer-events-auto w-full">
                <SummaryBanner
                  summary={summary} scope={scope} baseDate={ds.meta.base_date} unitCost={price.unitCost}
                  priceLabel={price.fallback ? `기준값(${price.month})` : `한전 ${price.month}`}
                  hasTop={top !== null} onTop={() => top && setSelectedId(top.bld_id)}
                />
              </div>
            )}
            {ds && (
              <div className="pointer-events-auto max-w-full rounded-xl bg-white/92 p-2 shadow-sm ring-1 ring-slate-900/10 backdrop-blur">
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <div id="SEG-01" data-tour="color-by" role="group" aria-label="색상 기준" className="flex flex-wrap gap-1">
                    {(Object.keys(COLOR_SCALES) as ColorBy[]).map((k) => (
                      <button key={k} type="button" aria-pressed={colorBy === k} onClick={() => setColorBy(k)} className={`rounded-md px-2 py-1 ${colorBy === k ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>{COLOR_SCALES[k].label}</button>
                    ))}
                  </div>
                  <button type="button" aria-expanded={showFilter} onClick={() => setShowFilter((v) => !v)} className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100">
                    필터·레이어 <span className="num">{filtered.length.toLocaleString("ko-KR")}동</span>
                  </button>
                </div>
                {showFilter && (
                  <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                    <Filters id="FLT-01" tour="filter" />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {LAYER_LABEL.map(([k, label], i) => (
                        <label key={k} className="flex items-center gap-1">
                          <input id={`LYR-0${i === 3 ? 4 : i < 2 ? i + 1 : 2}${i === 2 ? "b" : ""}`} type="checkbox" checked={layers[k]} disabled={k === "station" && !ds.stationGeo} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />
                          {label}
                        </label>
                      ))}
                      <label className="flex items-center gap-1 text-slate-400" title="위험물시설 자료를 아직 확보하지 못했습니다">
                        <input id="LYR-03" type="checkbox" disabled /> 위험물시설
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
            {ds && filtered.length === 0 && (
              <p className="pointer-events-auto rounded-lg bg-white px-3 py-2 text-sm shadow">
                조건에 맞는 건물이 없어요 <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="ml-1 underline">필터 해제</button>
              </p>
            )}
            {ds && fallbackImagery && <p className="pointer-events-auto rounded-md bg-slate-900/80 px-2 py-1 text-[11px] text-white">위성 배경: Esri World Imagery로 표시 중</p>}
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
          <p className="mb-1 font-semibold">{scale.label}</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {scale.stops.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>
            ))}
            {colorBy !== "tier" && colorBy !== "gate" && <li className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-[#aab1bc]" />정보 없음</li>}
            <li className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: TIER_COLOR.제외 }} />일반 건물</li>
          </ul>
          <p className="mt-1 text-slate-500">
            {ds.meta.source} {ds.meta.base_date} · {ds.complexes[0]?.source} · 위험물·배전 여유는 아직 반영하지 않아 80점 만점입니다
          </p>
        </aside>
      )}

      {toast && <p role="status" className="absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">{toast}</p>}
    </main>
  );
}
