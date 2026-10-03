"use client";

import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/data";
import { buildIndex, search, type SearchItem } from "@/lib/search";

export default function SearchBox({ ds, onPick }: { ds: Dataset; onPick: (item: SearchItem) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const index = useMemo(() => {
    // 같은 필지에 여러 동이 걸리면 지붕이 가장 큰 동으로 이동한다
    const largest = (ids: number[]) => ids.reduce<number | null>((best, id) => (best === null || (ds.byId.get(id)?.roof.roof_m2 ?? 0) > (ds.byId.get(best)?.roof.roof_m2 ?? 0) ? id : best), null);
    const companies: (SearchItem & { extra?: string })[] = ds.factories.map((f) => ({
      title: f.company, sub: `${f.complex ?? "산단 외"} · ${f.addr}`, extra: f.product ?? "", bldId: largest(f.bld_ids), lon: f.lon, lat: f.lat, kind: "회사",
    }));
    const named = ds.buildings.filter((b) => b.name).map((b) => ({ title: b.name!, sub: `${b.complex_nm} · ${b.addr ?? ""}`, bldId: b.bld_id, kind: "건물" as const }));
    return buildIndex([...companies, ...named]);
  }, [ds]);
  const result = useMemo(() => search(index, q), [index, q]);
  const list = result.hits.length ? result.hits : result.similar;
  const pick = (it: SearchItem) => {
    onPick(it);
    setQ(it.title);
    setOpen(false);
  };

  return (
    <div className="relative w-full md:w-72">
      <input
        id="INP-01" data-tour="search" type="search" value={q} maxLength={50} placeholder="회사명·주소 검색" aria-label="회사명·주소 검색"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && result.hits[0]) pick(result.hits[0]); if (e.key === "Escape") setOpen(false); }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-900"
      />
      {open && q.trim() && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg bg-white text-sm shadow-lg ring-1 ring-slate-900/10">
          {result.hits.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-600">산단 밖이거나 등록공장이 아닐 수 있어요{result.similar.length > 0 && " · 비슷한 이름"}</p>
          )}
          <ul>
            {list.map((it, i) => (
              <li key={`${it.title}-${i}`}>
                <button type="button" onClick={() => pick(it)} className="block w-full px-3 py-1.5 text-left hover:bg-slate-100">
                  <span className="font-medium">{it.title}</span>
                  {it.bldId === null && <span className="ml-1 text-[11px] text-slate-400">건물 연결 안 됨</span>}
                  <span className="block truncate text-xs text-slate-500">{it.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
