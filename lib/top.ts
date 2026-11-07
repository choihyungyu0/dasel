// 용량 큰 N동: 이미 설치됨·제외를 뺀 대상 건물을 설치용량(kW) 내림차순으로. 점수 순위와 별개(용량 기준)
import type { Building } from "./data";

export const TOP_N = 30;

export function topByKw(buildings: Building[], n = TOP_N): Building[] {
  return buildings
    .filter((b) => b.target && b.score.tier !== "제외" && b.score.tier !== "이미 설치됨" && !b.installed && b.calc.pv_kw !== null)
    .sort((a, b) => (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0) || a.bld_id - b.bld_id)
    .slice(0, n);
}
