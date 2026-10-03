"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BuildingPanel from "@/components/BuildingPanel";
import Filters from "@/components/Filters";
import { COLOR_SCALES, TIER_COLOR, type ColorBy, type Layers } from "@/components/MapView";
import SearchBox from "@/components/SearchBox";
import { useStore } from "@/components/Store";
import SummaryBanner from "@/components/SummaryBanner";
import { summarize } from "@/lib/calc";
import { DEFAULT_FILTERS, isDefault } from "@/lib/filters";
import { startTour, tourDone, type TourHandle } from "@/lib/tour";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const LAYER_LABEL: [keyof Layers, string][] = [["complex", "산단 경계"], ["target", "대상 공장 건물"], ["general", "일반 건물"], ["station", "119안전센터"]];

export default function Page() {
  const { status, reload, base, ds, price, refreshPrice, complexCd, filters, setFilters, filtered, selectedId, setSelectedId, tourNonce } = useStore();
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [sheetTall, setSheetTall] = useState(false);
  const [live, setLive] = useState("");
  const [chip, setChip] = useState(false);
  const tour = useRef<TourHandle | null>(null);
  const topRef = useRef<number | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("tier");
  const [layers, setLayers] = useState<Layers>({ complex: true, target: true, general: true, station: false });
  const [showFilter, setShowFilter] = useState(false);
  const [fallbackImagery, setFallbackImagery] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; n: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  const [chrome, setChrome] = useState({ header: 60, strip: 0 });

  useEffect(() => {
    const mq = matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // 지도 여백 계산용: 머리띠와 합계 띠가 가리는 높이
  useEffect(() => {
    const measure = () => {
      const header = Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 60);
      const el = document.getElementById("CRD-00");
      const strip = el && el.offsetParent !== null ? Math.round(el.getBoundingClientRect().height) + 12 : 0;
      setChrome((c) => (c.header === header && c.strip === strip ? c : { header, strip }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    const el = document.getElementById("CRD-00");
    if (el) ro.observe(el);
    return () => ro.disconnect();
  });

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
  topRef.current = top?.bld_id ?? filtered[0]?.bld_id ?? null;

  const runTour = useCallback(async () => {
    if (tour.current) return;
    setChip(false);
    setShowFilter(false);
    tour.current = await startTour({
      topId: topRef.current,
      mobile: !matchMedia("(min-width: 768px)").matches,
      select: setSelectedId,
      setAnchor: setAnchorId,
      setLocked,
      setSheetTall,
      announce: setLive,
      onEnd: () => {
        tour.current = null;
        setLive("");
        // TUR-06: 끝나면 다시 보기 위치(? 버튼)를 2초간 강조
        const help = document.getElementById("BTN-H1");
        help?.classList.add("tour-flash");
        setTimeout(() => help?.classList.remove("tour-flash"), 2000);
      },
    });
  }, [setSelectedId]);

  // TUR-02 시작 조건: ?tour=1 → 무조건 / 첫 방문 → 자동 / 딥링크(?b=)·저장 불가 → 칩만
  useEffect(() => {
    if (!base) return;
    const params = new URLSearchParams(location.search);
    const done = tourDone();
    if (params.get("tour") === "1") {
      const t = setTimeout(runTour, 600);
      return () => clearTimeout(t);
    }
    if (done === true) return;
    if (params.has("b") || done === null) {
      setChip(true);
      return;
    }
    const t = setTimeout(runTour, 600);
    return () => clearTimeout(t);
  }, [base, runTour]);

  // ? 메뉴의 '둘러보기 다시 보기'
  useEffect(() => {
    if (tourNonce > 0) void runTour();
  }, [tourNonce, runTour]);
  useEffect(() => () => tour.current?.stop(), []);
  const passIds = useMemo(() => (isDefault(filters) && !complexCd ? null : new Set(filtered.map((b) => b.bld_id))), [filters, complexCd, filtered]);
  const scope = `${ds?.complexes.find((c) => c.complex_cd === complexCd)?.complex_nm ?? "오창 산단 전체"}${isDefault(filters) ? "" : " · 필터 적용"}`;
  const selected = ds && selectedId !== null ? (ds.byId.get(selectedId) ?? null) : null;
  const scale = COLOR_SCALES[colorBy];

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {base && (
        <MapView
          ds={base} complexCd={complexCd} selectedId={selectedId} onSelect={setSelectedId} colorBy={colorBy} layers={layers} passIds={passIds} flyTo={flyTo}
          padding={{
            top: chrome.header,
            right: selected && wide ? 400 : 0,
            // 아래쪽은 모바일 하단 시트 또는 합계 띠가 가린다
            bottom: selected && !wide ? Math.round((typeof innerHeight === "undefined" ? 800 : innerHeight) * (sheetTall ? 0.75 : 0.62)) : chrome.strip,
          }}
          onFallback={() => setFallbackImagery(true)}
          anchorId={anchorId} locked={locked}
          onAnchorClick={() => {
            setSelectedId(anchorId);
            tour.current?.buildingClicked();
          }}
        />
      )}

      {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-slate-800 text-sm text-slate-200">공장 건물 불러오는 중</div>}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100">
          <div className="text-center">
            <p className="mb-3 text-sm">건물 데이터를 불러오지 못했어요</p>
            <button type="button" onClick={reload} className="rounded-lg bg-ink px-3 py-1.5 text-sm text-white">다시 시도</button>
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

        <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row md:items-stretch">
          <div className={`flex min-w-0 flex-1 flex-col items-start gap-2 ${selected || anchorId !== null ? "max-md:hidden" : ""}`}>
            {ds && (
              <div className="pointer-events-auto max-w-full surface p-2">
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <div id="SEG-01" data-tour="color-by" role="group" aria-label="색상 기준" className="flex flex-wrap gap-1">
                    {(Object.keys(COLOR_SCALES) as ColorBy[]).map((k) => (
                      <button key={k} type="button" aria-pressed={colorBy === k} onClick={() => setColorBy(k)} className={`rounded-md px-2 py-1 ${colorBy === k ? "bg-ink text-white" : "hover:bg-slate-100"}`}>{COLOR_SCALES[k].label}</button>
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
                <div id="LGD-01" className="mt-2 border-t border-ink/10 pt-2 text-[11px]">
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {scale.stops.map((st) => (
                      <li key={st.label} className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-[2px]" style={{ background: st.color }} />{st.label}</li>
                    ))}
                    {colorBy !== "tier" && colorBy !== "gate" && <li className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-[2px] bg-[#aab1bc]" />정보 없음</li>}
                    <li className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-[2px]" style={{ background: TIER_COLOR.제외 }} />일반 건물</li>
                  </ul>
                  <p className="mt-1 hidden max-w-[420px] text-ink/50 md:block">
                    {ds.meta.source} {ds.meta.base_date} · {ds.complexes[0]?.source} · 위험물·배전 여유는 아직 반영하지 않아 80점 만점입니다
                  </p>
                </div>
              </div>
            )}
            {ds && filtered.length === 0 && (
              <p className="pointer-events-auto surface px-3 py-2 text-sm">
                조건에 맞는 건물이 없어요 <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="ml-1 underline">필터 해제</button>
              </p>
            )}
            {ds && fallbackImagery && <p className="pointer-events-auto rounded-md bg-ink/80 px-2 py-1 text-[11px] text-white">위성 배경: Esri World Imagery로 표시 중</p>}
            {ds && (
              <div className="pointer-events-auto mt-auto w-full">
                <SummaryBanner
                  summary={summary} scope={scope} baseDate={ds.meta.base_date} unitCost={price.unitCost}
                  priceLabel={price.fallback ? `기준값(${price.month})` : `한전 ${price.month}`}
                  hasTop={top !== null} onTop={() => top && setSelectedId(top.bld_id)}
                />
              </div>
            )}
          </div>

          {ds && selected && (
            <div className={`mt-auto flex min-h-0 w-full flex-col md:mt-0 md:h-full md:max-h-full md:w-[380px] md:shrink-0 ${sheetTall ? "h-[75dvh] max-h-[75dvh]" : "max-h-[62dvh]"}`}>
              <BuildingPanel b={selected} ds={ds} price={price} onRefreshPrice={refreshPrice} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </div>
      </div>


      {chip && !tour.current && (
        <button id="CHP-T1" type="button" onClick={runTour} className="absolute bottom-24 right-3 z-20 rounded-full bg-ink px-3 py-1.5 text-sm text-white shadow-lg">처음이세요? 둘러보기</button>
      )}
      <p aria-live="polite" className="sr-only">{live}</p>

      {toast && <p role="status" className="absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-sm text-white shadow-lg">{toast}</p>}
    </main>
  );
}
