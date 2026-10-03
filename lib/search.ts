// MAP-05 통합 검색: 회사명·생산품·주소·건물명 부분일치 + 초성 검색(로컬 인덱스).
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

export const chosung = (s: string) =>
  [...s].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
  }).join("");

const norm = (s: string) => s.toLowerCase().replace(/\s+|\(주\)|주식회사|㈜/g, "");
const isChosung = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);

export interface SearchItem {
  title: string;
  sub: string;
  bldId: number | null;
  lon?: number;
  lat?: number;
  kind: "회사" | "건물";
}

interface Indexed extends SearchItem {
  key: string;
  cho: string;
  extra: string;
}

export interface SearchIndex {
  items: Indexed[];
}

export function buildIndex(items: (SearchItem & { extra?: string })[]): SearchIndex {
  return { items: items.map((it) => ({ ...it, key: norm(it.title), cho: chosung(norm(it.title)), extra: norm(`${it.sub} ${it.extra ?? ""}`) })) };
}

export interface SearchResult {
  hits: SearchItem[];
  /** 일치가 없을 때의 유사 후보(최대 3) */
  similar: SearchItem[];
}

export function search(index: SearchIndex, query: string, limit = 8): SearchResult {
  const q = norm(query);
  if (!q) return { hits: [], similar: [] };
  const scored: [number, Indexed][] = [];
  for (const it of index.items) {
    let rank = -1;
    if (isChosung(q)) rank = it.cho.startsWith(q) ? 0 : it.cho.includes(q) ? 1 : -1;
    else if (it.key.startsWith(q)) rank = 0;
    else if (it.key.includes(q)) rank = 1;
    else if (it.extra.includes(q)) rank = 2;
    if (rank >= 0) scored.push([rank + (it.bldId === null ? 0.5 : 0), it]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title, "ko"));
  if (scored.length) return { hits: scored.slice(0, limit).map(([, it]) => it), similar: [] };
  const grams = new Set([...q]);
  const similar = index.items
    .map((it) => [[...new Set(it.key)].filter((c) => grams.has(c)).length / grams.size, it] as const)
    .filter(([s]) => s >= 0.5)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([, it]) => it);
  return { hits: [], similar };
}
