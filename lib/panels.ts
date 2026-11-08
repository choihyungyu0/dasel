// 지붕 위 패널 배치 예시(화면 표시용). 계산식은 바꾸지 않는다: 장수 상한 = 설치용량 ÷ 패널 1장 kW.
// 지붕의 긴 변 방향으로 패널 행(가로 2m × 깊이 1m)을 깔고 행 사이 0.6m 통로를 둔다. 가장자리 1.5m는 비운다.
// 칸이 상한보다 많으면 행을 건너뛰어(간격을 넓혀) 지붕 전체에 고르게 퍼뜨리고, 남는 장수는 가장자리 행부터 뺀다.
// 반환 순서 = 남쪽 행부터(깔리는 애니메이션 순서).
import type { Feature, Polygon, Position } from "geojson";

export const PANEL_KW = 0.4;
export const PANEL_W = 2;
export const PANEL_H = 1;
export const AISLE = 0.6;
export const INSET = 1.5;
const GAP = 0.12;

type XY = [number, number];

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

function outer(geom: { type: string; coordinates: unknown }): Position[] | null {
  if (geom.type === "Polygon") return (geom.coordinates as Position[][])[0];
  if (geom.type === "MultiPolygon") {
    const rings = (geom.coordinates as Position[][][]).map((p) => p[0]);
    return rings.sort((a, b) => b.length - a.length)[0] ?? null;
  }
  return null;
}

/** 패널 사각형들(남쪽 행부터). cap = floor(kW ÷ 0.4) */
export function layoutPanels(geom: { type: string; coordinates: unknown } | null | undefined, kw: number | null): Feature<Polygon>[] {
  if (!geom || !kw || kw <= 0) return [];
  const ring0 = outer(geom);
  if (!ring0 || ring0.length < 4) return [];
  const f = frame(ring0);
  const flat = ring0.map(f.to);
  // 긴 변 방향을 x축으로 돌린다
  let ang = 0, best = 0;
  for (let i = 1; i < flat.length; i++) {
    const [dx, dy] = [flat[i][0] - flat[i - 1][0], flat[i][1] - flat[i - 1][1]];
    const len = Math.hypot(dx, dy);
    if (len > best) [best, ang] = [len, Math.atan2(dy, dx)];
  }
  const [c, s] = [Math.cos(-ang), Math.sin(-ang)];
  const rot = ([x, y]: XY): XY => [x * c - y * s, x * s + y * c];
  const unrot = ([x, y]: XY): XY => [x * c + y * s, -x * s + y * c];
  const ring = flat.map(rot);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  // 행마다 들어가는 칸
  const rows: XY[][] = [];
  for (let y = y0 + INSET; y + PANEL_H <= y1 - INSET; y += PANEL_H + AISLE) {
    const row: XY[] = [];
    for (let x = x0 + INSET; x + PANEL_W <= x1 - INSET; x += PANEL_W) {
      const corners: XY[] = [[x, y], [x + PANEL_W, y], [x + PANEL_W, y + PANEL_H], [x, y + PANEL_H]];
      if (corners.every((p) => inside(p, ring) && edgeDist(p, ring) >= INSET)) row.push([x, y]);
    }
    if (row.length) rows.push(row);
  }
  const cap = Math.floor(kw / PANEL_KW);
  const total = (rs: XY[][]) => rs.reduce((a, r) => a + r.length, 0);
  // 칸이 남으면 행을 건너뛰어 고르게(상한을 채우는 가장 넓은 간격)
  let chosen = rows;
  for (let step = 2; step <= rows.length; step++) {
    const off = Math.floor(((rows.length - 1) % step) / 2);
    const pick = rows.filter((_, i) => i % step === off);
    if (total(pick) >= cap) chosen = pick;
    else break;
  }
  // 그래도 많으면 가장자리 행부터 뺀다(바깥쪽 행 → 안쪽)
  chosen = chosen.map((r) => [...r]);
  let extra = total(chosen) - cap;
  for (let k = 0; extra > 0 && chosen.length; k++) {
    const i = k % 2 === 0 ? 0 : chosen.length - 1;
    const cut = Math.min(extra, chosen[i].length);
    chosen[i].splice(0, cut);
    extra -= cut;
    if (!chosen[i].length) chosen.splice(i, 1);
  }

  const cells = chosen.flat().map(([x, y]) => {
    const quad = ([[x + GAP, y + GAP], [x + PANEL_W - GAP, y + GAP], [x + PANEL_W - GAP, y + PANEL_H - GAP], [x + GAP, y + PANEL_H - GAP], [x + GAP, y + GAP]] as XY[]).map((p) => f.from(unrot(p)));
    return { quad, south: unrot([x + PANEL_W / 2, y + PANEL_H / 2])[1] };
  });
  return cells
    .sort((a, b) => a.south - b.south)
    .map(({ quad }, i) => ({ type: "Feature", id: i, properties: { i }, geometry: { type: "Polygon", coordinates: [quad] } }));
}
