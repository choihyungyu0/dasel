"use client";

import { LngLatBounds, Map as MlMap, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Feature } from "geojson";

const KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;
const TILES = KEY
  ? { tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${KEY}/Satellite/{z}/{y}/{x}.jpeg`], attribution: "브이월드(국토교통부)" }
  : { tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Esri, Maxar, Earthstar Geographics" };

function extend(coords: unknown, acc: LngLatBounds): LngLatBounds {
  if (Array.isArray(coords) && typeof coords[0] === "number") acc.extend(coords as [number, number]);
  else if (Array.isArray(coords)) coords.forEach((c) => extend(c, acc));
  return acc;
}

/** 라벨링용 항공영상 확대 지도. 지붕이 보이도록 건물은 채우지 않고 외곽선만 그린다. */
export default function LabelMap({ feature }: { feature: Feature }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const latest = useRef(feature);
  latest.current = feature;

  const show = (m: MlMap, f: Feature) => {
    (m.getSource("b") as GeoJSONSource | undefined)?.setData(f);
    m.fitBounds(extend((f.geometry as { coordinates: unknown }).coordinates, new LngLatBounds()), { padding: 90, maxZoom: 19, duration: 0 });
  };

  useEffect(() => {
    if (!el.current) return;
    const m = new MlMap({
      container: el.current,
      style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19, ...TILES } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
      center: [127.43, 36.72],
      zoom: 15,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.once("style.load", () => {
      m.addSource("b", { type: "geojson", data: latest.current });
      m.addLayer({ id: "b-halo", type: "line", source: "b", paint: { "line-color": "#0e2233", "line-width": 5 } });
      m.addLayer({ id: "b", type: "line", source: "b", paint: { "line-color": "#ffe45c", "line-width": 2.5 } });
      show(m, latest.current);
    });
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (m?.getSource("b")) show(m, feature);
  }, [feature]);

  return <div ref={el} className="h-full w-full" />;
}
