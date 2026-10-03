"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "./Store";

const TABS: { href: string; label: string; tour?: string }[] = [
  { href: "/", label: "지도" },
  { href: "/sim", label: "시뮬레이터", tour: "nav-sim" },
  { href: "/list", label: "후보 목록" },
];

export default function AppHeader({ children, complexSelect = true }: { children?: React.ReactNode; complexSelect?: boolean }) {
  const path = usePathname();
  const { ds, complexCd, setComplexCd } = useStore();
  return (
    <header className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-white/92 px-3 py-2 shadow-sm ring-1 ring-slate-900/10 backdrop-blur">
      <h1 className="text-base font-bold tracking-tight">다셀</h1>
      <nav id="NAV-01" className="flex gap-1 whitespace-nowrap text-sm">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} data-tour={t.tour} className={`rounded-md px-2.5 py-1 ${path === t.href ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>{t.label}</Link>
        ))}
      </nav>
      {children}
      {complexSelect && ds && (
        <div id="SEG-02" data-tour="complex" className="flex max-w-full gap-1 overflow-x-auto whitespace-nowrap text-sm md:ml-auto">
          <button type="button" onClick={() => setComplexCd(null)} className={`rounded-md px-2.5 py-1 ${complexCd === null ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>전체</button>
          {ds.complexes.map((c) =>
            c.status === "조성 중" ? (
              <span key={c.complex_cd} title="대상 건물이 아직 없습니다" className="rounded-md px-2.5 py-1 text-slate-400">{c.complex_nm} <small>조성 중</small></span>
            ) : (
              <button key={c.complex_cd} type="button" onClick={() => setComplexCd(c.complex_cd)} className={`rounded-md px-2.5 py-1 ${complexCd === c.complex_cd ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>{c.complex_nm}</button>
            ),
          )}
        </div>
      )}
      <Link id="BTN-H1" data-tour="help" href="/method" title="산정 기준" aria-label="산정 기준" className={`grid size-7 place-items-center rounded-full border border-slate-300 text-sm font-semibold hover:bg-slate-100 ${complexSelect ? "" : "ml-auto"} ${path === "/method" ? "bg-slate-900 text-white" : ""}`}>?</Link>
    </header>
  );
}
