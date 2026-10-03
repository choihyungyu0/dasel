"use client";

import { LngLatBounds, Map as MlMap, NavigationControl, type LngLatBoundsLike, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Dataset } from "@/lib/data";

export const TIER_COLOR = { "설치 우선": "#0f6b3c", 검토: "#e07b00", 보류: "#7b8494", 제외: "#d5d9df" } as const;

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;
const SATELLITE = VWORLD_KEY
  ? { tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`], attribution: "브이월드(국토교통부)", maxzoom: 19 }
  : { tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Esri, Maxar, Earthstar Geographics", maxzoom: 19 };
export const USING_FALLBACK_IMAGERY = !VWORLD_KEY;

function bounds(coords: unknown, acc = new LngLatBounds()): LngLatBounds {
  if (Array.isArray(coords) && typeof coords[0] === "number") acc.extend(coords as [number, number]);
  else if (Array.isArray(coords)) coords.forEach((c) => bounds(c, acc));
  return acc;
}

interface Props {
  ds: Dataset;
  complexCd: string | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export default function MapView({ ds, complexCd, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = new MlMap({
      container: el.current,
      style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, ...SATELLITE } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
      bounds: bounds(ds.complexGeo.features.map((f) => (f.geometry as { coordinates: unknown }).coordinates)).toArray() as LngLatBoundsLike,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      m.addSource("complex", { type: "geojson", data: ds.complexGeo });
      m.addSource("bld", { type: "geojson", data: ds.geo, promoteId: "bld_id" });
      m.addLayer({ id: "LYR-01", type: "line", source: "complex", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [3, 2] } });
      m.addLayer({
        id: "LYR-02",
        type: "fill",
        source: "bld",
        paint: {
          "fill-color": ["match", ["get", "tier"], "설치 우선", TIER_COLOR["설치 우선"], "검토", TIER_COLOR.검토, "보류", TIER_COLOR.보류, TIER_COLOR.제외],
          "fill-opacity": ["case", ["==", ["get", "tier"], "제외"], 0.35, 0.82],
        },
      });
      m.addLayer({
        id: "bld-outline",
        type: "line",
        source: "bld",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", ["boolean", ["feature-state", "hover"], false], "#ffffff", "rgba(15,23,42,0.5)"],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, ["boolean", ["feature-state", "hover"], false], 2, 0.5],
        },
      });
      let hovered: number | null = null;
      m.on("mousemove", "LYR-02", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.id as number | undefined;
        if (hovered !== null && hovered !== id) m.setFeatureState({ source: "bld", id: hovered }, { hover: false });
        if (id !== undefined) m.setFeatureState({ source: "bld", id }, { hover: true });
        hovered = id ?? null;
        m.getCanvas().style.cursor = id === undefined ? "" : "pointer";
      });
      m.on("mouseleave", "LYR-02", () => {
        if (hovered !== null) m.setFeatureState({ source: "bld", id: hovered }, { hover: false });
        hovered = null;
        m.getCanvas().style.cursor = "";
      });
      m.on("click", (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ["LYR-02"] })[0];
        onSelectRef.current(f ? Number(f.id) : null);
      });
    });
    return () => m.remove();
  }, [ds]);

  // 산단 선택 → 해당 경계로 이동
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const feats = ds.complexGeo.features.filter((f) => !complexCd || f.properties?.complex_cd === complexCd);
    m.fitBounds(bounds(feats.map((f) => (f.geometry as { coordinates: unknown }).coordinates)), { padding: 40, duration: 800 });
  }, [ds, complexCd]);

  // 선택 건물 강조 + 이동
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (prev.current !== null) m.setFeatureState({ source: "bld", id: prev.current }, { selected: false });
      if (selectedId !== null) {
        m.setFeatureState({ source: "bld", id: selectedId }, { selected: true });
        const f = ds.geo.features.find((x) => Number(x.properties?.bld_id) === selectedId);
        if (f) m.fitBounds(bounds((f.geometry as { coordinates: unknown }).coordinates), { padding: 160, maxZoom: 17.5, duration: 1200 });
      }
      prev.current = selectedId;
    };
    if (m.isStyleLoaded() && m.getSource("bld")) apply();
    else m.once("idle", apply);
  }, [ds, selectedId]);

  return (
    <div id="MAP-01" data-tour="map" className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
