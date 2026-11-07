// 지붕 위 패널 배치 예시(화면 표시용). 계산식은 바꾸지 않는다: 장수 상한 = 설치용량 ÷ 패널 1장 kW.
// 지붕 도형을 가장자리에서 INSET만큼 안쪽으로 줄인 영역에 남향(가로 2m × 세로 1m) 패널을 채우고 중앙부터 상한까지 고른다.
import type { Feature, Polygon, Position } from "geojson";

export const PANEL_KW = 0.4;
export const PANEL_W = 2;
export const PANEL_H = 1;
export const INSET = 1.5;
const GAP = 0.12;

type XY = [number, number];

/** 경위도 ↔ 건물 중심 기준 평면 미터 */
function frame(ring: Position[]) {
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const ky = 111_320, kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return { to: (p: Position): XY => [(p[0] - lon0) * kx, (p[1] - lat0) * ky], from: ([x, y]: XY): Position => [lon0 + x / kx, lat0 + y / ky] };
}

function inside([x, y]: XY, ring: XY[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function edgeDist([x, y]: XY, ring: XY[]): number {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

/** 다각형 바깥 고리. MultiPolygon이면 가장 큰 것 */
function outer(geom: { type: string; coordinates: unknown }): Position[] | null {
  if (geom.type === "Polygon") return (geom.coordinates as Position[][])[0];
  if (geom.type === "MultiPolygon") {
    const rings = (geom.coordinates as Position[][][]).map((p) => p[0]);
    return rings.sort((a, b) => b.length - a.length)[0] ?? null;
  }
  return null;
}

/** 패널 사각형들(중앙에서 가까운 순). cap = floor(kW ÷ 0.4) */
export function layoutPanels(geom: { type: string; coordinates: unknown } | null | undefined, kw: number | null): Feature<Polygon>[] {
  if (!geom || !kw || kw <= 0) return [];
  const ring0 = outer(geom);
  if (!ring0 || ring0.length < 4) return [];
  const f = frame(ring0);
  const ring = ring0.map(f.to);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cells: { c: XY; d: number }[] = [];
  for (let y = y0 + INSET; y + PANEL_H <= y1 - INSET; y += PANEL_H) {
    for (let x = x0 + INSET; x + PANEL_W <= x1 - INSET; x += PANEL_W) {
      const corners: XY[] = [[x, y], [x + PANEL_W, y], [x + PANEL_W, y + PANEL_H], [x, y + PANEL_H]];
      if (corners.every((p) => inside(p, ring) && edgeDist(p, ring) >= INSET)) cells.push({ c: [x, y], d: Math.hypot(x + PANEL_W / 2, y + PANEL_H / 2) });
    }
  }
  const cap = Math.floor(kw / PANEL_KW);
  return cells
    .sort((a, b) => a.d - b.d)
    .slice(0, cap)
    .map(({ c: [x, y] }, i) => ({
      type: "Feature",
      id: i,
      properties: { i },
      geometry: { type: "Polygon", coordinates: [[[x + GAP, y + GAP], [x + PANEL_W - GAP, y + GAP], [x + PANEL_W - GAP, y + PANEL_H - GAP], [x + GAP, y + PANEL_H - GAP], [x + GAP, y + GAP]].map((p) => f.from(p as XY))] },
    }));
}
