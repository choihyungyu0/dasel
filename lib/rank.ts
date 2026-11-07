// 후보 목록 순위: '이미 설치됨'은 순위 번호를 받지 않고 맨 아래로 간다(방문 목록으로 오해하지 않게).
import type { Building } from "./data";

/** 들어온 순서(점수 순)를 유지한 채 이미 설치된 건물만 뒤로 보낸다 */
export function rankOrder(list: Building[]): Building[] {
  return [...list.filter((b) => b.score.tier !== "이미 설치됨"), ...list.filter((b) => b.score.tier === "이미 설치됨")];
}

/** 건물 ID → 순위(1부터). 이미 설치됨·제외 건물은 없음 */
export function rankMap(list: Building[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of list) if (b.score.tier !== "이미 설치됨" && b.score.tier !== "제외") m.set(b.bld_id, m.size + 1);
  return m;
}

export const INSTALLED_RANK = "설치됨";
