"use client";

import { LngLatBounds, Map as MlMap, type LngLatBoundsLike } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
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

/** 검토의견서 상단 항공영상 썸네일. 지도가 뜨지 않으면 아무것도 그리지 않는다(지도 없이 인쇄). */
export default function Thumb({ feature }: { feature: Feature }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    let m: MlMap;
    try {
      m = new MlMap({
        container: el.current,
        interactive: false,
        attributionControl: { compact: false },
        canvasContextAttributes: { preserveDrawingBuffer: true }, // 인쇄에 캔버스가 찍히도록
        style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19, ...TILES } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
        bounds: extend((feature.geometry as { coordinates: unknown }).coordinates, new LngLatBounds()).toArray() as LngLatBoundsLike,
        fitBoundsOptions: { padding: 50, maxZoom: 18 },
      });
    } catch {
      setFailed(true);
      return;
    }
    m.once("style.load", () => {
      m.addSource("b", { type: "geojson", data: feature });
      m.addLayer({ id: "b", type: "line", source: "b", paint: { "line-color": "#ffffff", "line-width": 3 } });
    });
    return () => m.remove();
  }, [feature]);

  if (failed) return null;
  return (
    <div className="h-[52mm] w-full overflow-hidden rounded-lg">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
