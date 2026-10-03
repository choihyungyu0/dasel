"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Filters from "@/components/Filters";
import { TIER_COLOR } from "@/components/MapView";
import { useStore } from "@/components/Store";
import { toManwon } from "@/lib/calc";
import { REVIEW_BADGE } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import type { Building } from "@/lib/data";
import { DEFAULT_FILTERS } from "@/lib/filters";
import { startMiniTour } from "@/lib/tour";

const n = (v: number | null, d = 0) => (v === null ? "–" : v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));

type SortKey = "score" | "kw" | "kwh" | "ess" | "packs" | "save" | "company" | "complex";
const COLUMNS: { key: SortKey | null; label: string; num?: boolean }[] = [
  { key: null, label: "순위", num: true }, { key: "company", label: "회사" }, { key: "complex", label: "산단" }, { key: "kw", label: "kW", num: true },
  { key: "kwh", label: "연 kWh", num: true }, { key: "ess", label: "ESS kWh", num: true }, { key: "packs", label: "팩", num: true },
  { key: "save", label: "연 절감(만 원)", num: true }, { key: null, label: "게이트" }, { key: "score", label: "단계·점수" }, { key: null, label: "비교" },
];
const VALUE: Record<SortKey, (b: Building) => number | string> = {
  score: (b) => b.score.score ?? -1, kw: (b) => b.calc.pv_kw ?? -1, kwh: (b) => b.calc.pv_kwh ?? -1, ess: (b) => b.calc.ess_kwh ?? -1,
  packs: (b) => b.calc.packs ?? -1, save: (b) => b.calc.save_base ?? -1, company: (b) => b.companies[0]?.company ?? "￿", complex: (b) => b.complex_nm,
};

export default function ListPage() {
  const router = useRouter();
  const { status, reload, ds, price, filtered, setFilters, setSelectedId, compare, toggleCompare } = useStore();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(() => void startMiniTour("list"), 600);
    return () => clearTimeout(t);
  }, [status]);

  const rank = useMemo(() => new Map(filtered.map((b, i) => [b.bld_id, i + 1])), [filtered]);
  const rows = useMemo(() => {
    if (!sort) return filtered;
    const v = VALUE[sort.key];
    return [...filtered].sort((a, b) => {
      const [x, y] = [v(a), v(b)];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
      return sort.desc ? -c : c;
    });
  }, [filtered, sort]);

  const download = () => {
    if (!ds) return;
    const blob = new Blob([toCsv(filtered, price, `${ds.meta.source} ${ds.meta.base_date}`)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `다셀_설치후보_${ds.meta.built}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setToast(`${filtered.length.toLocaleString("ko-KR")}동을 내려받았어요`);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <main className="flex h-dvh flex-col gap-2 p-2 md:p-3">
      <AppHeader />
      <section className="surface bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Filters id="FLT-02" tour="list-filter" />
          <div className="flex flex-col items-end gap-1">
            <button id="BTN-07" data-tour="list-csv" type="button" onClick={download} disabled={!filtered.length} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">CSV 내려받기</button>
            <span className="badge-review">{REVIEW_BADGE}</span>
            {toast && <span role="status" className="text-xs text-slate-600">{toast}</span>}
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto surface bg-white">
        {status === "loading" && <p className="p-6 text-sm text-slate-500">공장 건물 불러오는 중</p>}
        {status === "error" && (
          <p className="p-6 text-sm">건물 데이터를 불러오지 못했어요 <button type="button" onClick={reload} className="ml-1 underline">다시 시도</button></p>
        )}
        {status === "ready" && rows.length === 0 && (
          <p className="p-6 text-sm">조건에 맞는 건물이 없어요. 단계를 넓히거나 <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="underline">필터를 해제</button>해 보세요.</p>
        )}
        {rows.length > 0 && (
          <table id="TBL-02" className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs text-slate-600">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label} scope="col" className={`px-2 py-2 font-medium ${c.num ? "text-right" : ""}`} aria-sort={c.key && sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                    {c.key ? (
                      <button type="button" onClick={() => setSort((s) => (s?.key === c.key ? (s.desc ? { key: c.key!, desc: false } : null) : { key: c.key!, desc: true }))} className="hover:underline">
                        {c.label}{sort?.key === c.key ? (sort.desc ? " ▼" : " ▲") : ""}
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.bld_id} tabIndex={0} onClick={() => { setSelectedId(b.bld_id); router.push(`/?b=${b.bld_id}`); }} onKeyDown={(e) => { if (e.key === "Enter") { setSelectedId(b.bld_id); router.push(`/?b=${b.bld_id}`); } }} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none">
                  <td className="num px-2 py-1.5 text-right text-slate-500">{rank.get(b.bld_id)}</td>
                  <td className="max-w-[240px] px-2 py-1.5">
                    <span className="block truncate font-medium">{b.companies[0]?.company ?? <span className="font-normal text-slate-400">등록공장 정보 연결 안 됨</span>}{b.companies.length > 1 && <span className="font-normal text-slate-500"> 외 {b.companies.length - 1}</span>}</span>
                    <span className="block truncate text-xs text-slate-500">{b.addr ?? "주소 정보 없음"}</span>
                  </td>
                  <td className="px-2 py-1.5">{b.complex_nm}</td>
                  <td className="num px-2 py-1.5 text-right">{n(b.calc.pv_kw, 1)}</td>
                  <td className="num px-2 py-1.5 text-right">{n(b.calc.pv_kwh)}</td>
                  <td className="num px-2 py-1.5 text-right">{n(b.calc.ess_kwh)}</td>
                  <td className="num px-2 py-1.5 text-right">{n(b.calc.packs)}</td>
                  <td className="num px-2 py-1.5 text-right">{b.calc.save_low === null ? "–" : `${n(toManwon(b.calc.save_low))}~${n(toManwon(b.calc.save_base!))}`}</td>
                  <td className="px-2 py-1.5">{b.score.gate}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: TIER_COLOR[b.score.tier] }}>{b.score.tier}</span>
                    <span className="num ml-1 text-xs text-slate-600">{b.score.score}/{b.score.max}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" aria-pressed={compare.includes(b.bld_id)} onClick={(e) => { e.stopPropagation(); if (!toggleCompare(b.bld_id)) { setToast("비교는 4동까지 담을 수 있어요"); setTimeout(() => setToast(null), 3000); } }} onKeyDown={(e) => e.stopPropagation()} className={`rounded border px-1.5 py-0.5 text-xs ${compare.includes(b.bld_id) ? "border-cell bg-cell/10 text-cell" : "border-slate-300 hover:bg-slate-100"}`}>
                      {compare.includes(b.bld_id) ? "담김" : "담기"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {ds && <p className="px-1 text-[11px] text-slate-500">{ds.meta.source} {ds.meta.base_date} · {ds.meta.factory_source} · 단가 {price.unitCost}원/kWh({price.month}{price.fallback ? ", 기준값" : ""}) · 행을 누르면 지도에서 엽니다</p>}
    </main>
  );
}
