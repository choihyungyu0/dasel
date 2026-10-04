"use client";

import { LngLatBounds, Map as MlMap, NavigationControl, type ExpressionSpecification, type LngLatBoundsLike, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/data";

export const TIER_COLOR = { "설치 우선": "#0b5d34", 검토: "#f08c00", 보류: "#7b8494", "이미 설치됨": "#1456c8", 제외: "#d5d9df" } as const;
const NONE = "#aab1bc";

export type ColorBy = "tier" | "kw" | "packs" | "age" | "gate";

/** MAP-03 색상 기준. 범례와 지도 색이 같은 정의를 쓴다. */
export const COLOR_SCALES: Record<ColorBy, { label: string; prop: string; stops: { label: string; color: string; min?: number; value?: string }[] }> = {
  tier: { label: "설치 적합도", prop: "tier", stops: [{ label: "설치 우선", color: TIER_COLOR["설치 우선"], value: "설치 우선" }, { label: "검토", color: TIER_COLOR.검토, value: "검토" }, { label: "보류", color: TIER_COLOR.보류, value: "보류" }, { label: "이미 설치됨", color: TIER_COLOR["이미 설치됨"], value: "이미 설치됨" }] },
  kw: { label: "설치용량", prop: "pv_kw", stops: [{ label: "30kW 미만", color: "#dbe9d5", min: 0 }, { label: "30~99kW", color: "#a6d49a", min: 30 }, { label: "100~199kW", color: "#5fb260", min: 100 }, { label: "200~499kW", color: "#22853f", min: 200 }, { label: "500kW 이상", color: "#084d24", min: 500 }] },
  packs: { label: "필요 팩 수", prop: "packs", stops: [{ label: "1~5개", color: "#c9dcf2", min: 1 }, { label: "6~15개", color: "#85b3e3", min: 6 }, { label: "16~30개", color: "#3d83cc", min: 16 }, { label: "31개 이상", color: "#134c94", min: 31 }] },
  age: { label: "사용승인 경과", prop: "age", stops: [{ label: "10년 미만", color: "#fde3c2", min: 0 }, { label: "10~19년", color: "#f8b36b", min: 10 }, { label: "20~29년", color: "#e07b00", min: 20 }, { label: "30년 이상", color: "#8f3c00", min: 30 }] },
  gate: { label: "안전 게이트", prop: "gate", stops: [{ label: "통과", color: "#0b5d34", value: "통과" }, { label: "조건부", color: "#f08c00", value: "조건부" }] },
};

function fillColor(by: ColorBy): ExpressionSpecification {
  const s = COLOR_SCALES[by];
  const general: ExpressionSpecification = ["==", ["get", "tier"], "제외"];
  if (s.stops[0].value !== undefined) {
    return ["case", general, TIER_COLOR.제외, ["match", ["get", s.prop], ...s.stops.flatMap((x) => [x.value!, x.color]), NONE]] as unknown as ExpressionSpecification;
  }
  return ["case", general, TIER_COLOR.제외, ["<", ["get", s.prop], s.stops[0].min!], NONE, ["step", ["get", s.prop], s.stops[0].color, ...s.stops.slice(1).flatMap((x) => [x.min!, x.color])]] as unknown as ExpressionSpecification;
}

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;
const ESRI = { tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Esri, Maxar, Earthstar Geographics", maxzoom: 19 };
const VWORLD = { tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`], attribution: "브이월드(국토교통부)", maxzoom: 19 };

function bounds(coords: unknown, acc = new LngLatBounds()): LngLatBounds {
  if (Array.isArray(coords) && typeof coords[0] === "number") acc.extend(coords as [number, number]);
  else if (Array.isArray(coords)) coords.forEach((c) => bounds(c, acc));
  return acc;
}

export interface Layers {
  complex: boolean;
  target: boolean;
  general: boolean;
  station: boolean;
  /** LYR-06 기존 태양광 설치 건물(항공영상 라벨) */
  installed: boolean;
}

interface Props {
  ds: Dataset;
  complexCd: string | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  colorBy: ColorBy;
  layers: Layers;
  /** 필터를 통과한 건물 ID. null이면 필터 없음 */
  passIds: Set<number> | null;
  flyTo: { lon: number; lat: number; n: number } | null;
  /** 패널이 가리는 영역(px) */
  padding: { top: number; right: number; bottom: number };
  onFallback: () => void;
  /** 둘러보기: 이 건물 위에 투명 앵커를 덮는다(TUR-04) */
  anchorId?: number | null;
  /** 둘러보기 중 지도 이동·확대 잠금 */
  locked?: boolean;
  onAnchorClick?: () => void;
}

const HANDLERS = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate"] as const;

export default function MapView({ ds, complexCd, selectedId, onSelect, colorBy, layers, passIds, flyTo, padding, onFallback, anchorId = null, locked = false, onAnchorClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; id: number } | null>(null);
  const [anchorBox, setAnchorBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const cb = useRef({ onSelect, onFallback });
  cb.current = { onSelect, onFallback };

  useEffect(() => {
    if (!el.current) return;
    const m = new MlMap({
      container: el.current,
      style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, ...(VWORLD_KEY ? VWORLD : ESRI) } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
      bounds: bounds(ds.complexGeo.features.map((f) => (f.geometry as { coordinates: unknown }).coordinates)).toArray() as LngLatBoundsLike,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.current = m;
    if (!VWORLD_KEY) cb.current.onFallback();
    // ST-M4: 브이월드 타일이 막히면 Esri World Imagery로 바꾼다
    let swapped = !VWORLD_KEY;
    m.on("error", (e) => {
      if (swapped || (e as { sourceId?: string }).sourceId !== "sat") return;
      swapped = true;
      m.removeLayer("sat");
      m.removeSource("sat");
      m.addSource("sat", { type: "raster", tileSize: 256, ...ESRI });
      m.addLayer({ id: "sat", type: "raster", source: "sat" }, m.getLayer("LYR-01") ? "LYR-01" : undefined);
      cb.current.onFallback();
    });
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.once("style.load", () => {
      m.addSource("complex", { type: "geojson", data: ds.complexGeo });
      m.addSource("bld", { type: "geojson", data: ds.geo, promoteId: "bld_id" });
      m.addLayer({ id: "LYR-01", type: "line", source: "complex", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [3, 2] } });
      m.addLayer({
        id: "LYR-02", type: "fill", source: "bld",
        paint: {
          "fill-color": fillColor("tier"),
          "fill-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.12, ["==", ["get", "tier"], "제외"], 0.35, 0.85],
        },
      });
      m.addLayer({
        id: "bld-outline", type: "line", source: "bld",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", ["boolean", ["feature-state", "hover"], false], "#ffffff", "rgba(15,23,42,0.5)"],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, ["boolean", ["feature-state", "hover"], false], 2, 0.5],
        },
      });
      // LYR-06: 항공영상 라벨에서 이미 태양광이 확인된 건물
      m.addLayer({ id: "LYR-06", type: "line", source: "bld", filter: ["==", ["get", "installed"], true], paint: { "line-color": "#1456c8", "line-width": 2.5, "line-dasharray": [2, 1] } });
      if (ds.stationGeo) {
        m.addSource("station", { type: "geojson", data: ds.stationGeo });
        m.addLayer({ id: "LYR-04", type: "circle", source: "station", layout: { visibility: "none" }, paint: { "circle-radius": 7, "circle-color": "#d7263d", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      }
      let hovered: number | null = null;
      m.on("mousemove", "LYR-02", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.id as number | undefined;
        if (hovered !== null && hovered !== id) m.setFeatureState({ source: "bld", id: hovered }, { hover: false });
        if (id !== undefined) m.setFeatureState({ source: "bld", id }, { hover: true });
        hovered = id ?? null;
        m.getCanvas().style.cursor = id === undefined ? "" : "pointer";
        setTip(id === undefined ? null : { x: e.point.x, y: e.point.y, id });
      });
      m.on("mouseleave", "LYR-02", () => {
        if (hovered !== null) m.setFeatureState({ source: "bld", id: hovered }, { hover: false });
        hovered = null;
        m.getCanvas().style.cursor = "";
        setTip(null);
      });
      m.on("click", (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ["LYR-02"] })[0];
        cb.current.onSelect(f ? Number(f.id) : null);
      });
      setReady(true);
    });
    return () => {
      setReady(false);
      m.remove();
    };
  }, [ds]);

  useEffect(() => {
    if (ready) map.current!.setPaintProperty("LYR-02", "fill-color", fillColor(colorBy));
  }, [ready, colorBy]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    m.setLayoutProperty("LYR-01", "visibility", vis(layers.complex));
    const show: ExpressionSpecification = ["any", ["all", layers.target, ["!=", ["get", "tier"], "제외"]], ["all", layers.general, ["==", ["get", "tier"], "제외"]]];
    m.setFilter("LYR-02", show);
    m.setFilter("bld-outline", show);
    if (m.getLayer("LYR-04")) m.setLayoutProperty("LYR-04", "visibility", vis(layers.station));
    m.setLayoutProperty("LYR-06", "visibility", vis(layers.installed));
  }, [ready, layers]);

  // 필터 밖 대상 건물은 흐리게
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const b of ds.buildings) {
      if (b.score.tier === "제외") continue;
      m.setFeatureState({ source: "bld", id: b.bld_id }, { dim: passIds !== null && !passIds.has(b.bld_id) });
    }
  }, [ready, ds, passIds]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const feats = ds.complexGeo.features.filter((f) => !complexCd || f.properties?.complex_cd === complexCd);
    m.fitBounds(bounds(feats.map((f) => (f.geometry as { coordinates: unknown }).coordinates)), { padding: 40, duration: 800 });
  }, [ready, ds, complexCd]);

  const prev = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (prev.current !== null) m.setFeatureState({ source: "bld", id: prev.current }, { selected: false });
    if (selectedId !== null) {
      m.setFeatureState({ source: "bld", id: selectedId }, { selected: true });
      const f = ds.geo.features.find((x) => Number(x.properties?.bld_id) === selectedId);
      if (f) m.fitBounds(bounds((f.geometry as { coordinates: unknown }).coordinates), { padding: { top: 60 + padding.top, left: 60, right: 60 + padding.right, bottom: 60 + padding.bottom }, maxZoom: 17.5, duration: 1200 });
    }
    prev.current = selectedId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ds, selectedId]);

  useEffect(() => {
    if (ready && flyTo) map.current!.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: 17, duration: 1200 });
  }, [ready, flyTo]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const h of HANDLERS) (locked ? m[h].disable() : m[h].enable());
  }, [ready, locked]);

  // TUR-04: 캔버스 안 건물에는 DOM이 없으므로 화면 좌표로 바꾼 투명 div를 덮는다
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || anchorId === null) {
      setAnchorBox(null);
      return;
    }
    const f = ds.geo.features.find((x) => Number(x.properties?.bld_id) === anchorId);
    if (!f) return;
    const box = bounds((f.geometry as { coordinates: unknown }).coordinates);
    const place = () => {
      const [sw, ne] = [m.project(box.getSouthWest()), m.project(box.getNorthEast())];
      setAnchorBox({ left: Math.min(sw.x, ne.x), top: Math.min(sw.y, ne.y), width: Math.abs(ne.x - sw.x), height: Math.abs(ne.y - sw.y) });
    };
    m.on("move", place);
    m.on("resize", place);
    m.fitBounds(box, { padding: { top: 60 + padding.top, left: 60, right: 60, bottom: 60 + padding.bottom }, maxZoom: 17, duration: 1200 });
    place();
    return () => {
      m.off("move", place);
      m.off("resize", place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ds, anchorId]);

  const tipB = tip ? ds.byId.get(tip.id) : null;

  return (
    <div id="MAP-01" data-tour="map" className="absolute inset-0" style={{ "--map-bottom": `${padding.bottom}px`, "--map-right": `${padding.right}px` } as React.CSSProperties}>
      <div ref={el} className="h-full w-full" />
      {tipB && tip && (
        <div role="tooltip" className="pointer-events-none absolute z-10 max-w-[240px] rounded-md bg-ink/90 px-2 py-1 text-xs text-white shadow" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <p className="truncate font-medium">{tipB.companies[0]?.company ?? tipB.name ?? tipB.addr ?? "건물"}</p>
          <p className="num text-slate-300">{tipB.score.tier === "제외" ? "일반 건물" : `${tipB.score.tier} · ${tipB.calc.pv_kw === null ? "면적 정보 없음" : `${tipB.calc.pv_kw.toLocaleString("ko-KR")}kW`}`}</p>
        </div>
      )}
      {anchorBox && (
        <button type="button" id="TUR-ANCHOR" data-tour="map-building" aria-label="적합도 1순위 건물" onClick={onAnchorClick} className="absolute cursor-pointer bg-transparent" style={anchorBox} />
      )}
    </div>
  );
}
