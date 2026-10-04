"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "./Store";

const TABS: { href: string; label: string; tour?: string }[] = [
  { href: "/", label: "지도" },
  { href: "/sim", label: "시뮬레이터", tour: "nav-sim" },
  { href: "/list", label: "후보 목록" },
];

export default function AppHeader({ children, complexSelect = true }: { children?: React.ReactNode; complexSelect?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const { ds, complexCd, setComplexCd, requestTour, compare } = useStore();
  const [menu, setMenu] = useState(false);
  const replay = () => {
    setMenu(false);
    if (path === "/") requestTour();
    else router.push("/?tour=1");
  };
  return (
    <header className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 surface px-2.5 py-1.5 md:gap-y-1.5 md:px-3 md:py-2">
      <h1 className="flex items-center gap-1.5 text-[17px] font-bold tracking-tight"><i aria-hidden className="cell-mark" />다셀</h1>
      <nav id="NAV-01" className="flex gap-1 whitespace-nowrap text-sm">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} data-tour={t.tour} className={`rounded-md px-2.5 py-1 ${path === t.href ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"}`}>{t.label}</Link>
        ))}
        {(compare.length > 0 || path === "/compare") && (
          <Link href="/compare" className={`rounded-md px-2.5 py-1 ${path === "/compare" ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"}`}>비교 <span className="num">{compare.length}</span></Link>
        )}
      </nav>
      {children}
      {complexSelect && ds && (
        <div id="SEG-02" data-tour="complex" className="no-scrollbar flex max-w-full gap-1 overflow-x-auto whitespace-nowrap text-sm max-md:order-3 max-md:w-full max-md:text-[13px] md:ml-auto">
          <button type="button" onClick={() => setComplexCd(null)} className={`rounded-md px-2.5 py-1 ${complexCd === null ? "bg-ink text-white" : "hover:bg-slate-100"}`}>전체</button>
          {ds.complexes.map((c) =>
            c.status === "조성 중" ? (
              <span key={c.complex_cd} title="대상 건물이 아직 없습니다" className="rounded-md px-2.5 py-1 text-slate-400">{c.complex_nm} <small>조성 중</small></span>
            ) : (
              <button key={c.complex_cd} type="button" onClick={() => setComplexCd(c.complex_cd)} className={`rounded-md px-2.5 py-1 ${complexCd === c.complex_cd ? "bg-ink text-white" : "hover:bg-slate-100"}`}>{c.complex_nm}</button>
            ),
          )}
        </div>
      )}
      <div className={`relative max-md:order-1 max-md:ml-auto ${complexSelect ? "" : "ml-auto"}`}>
        <button id="BTN-H1" data-tour="help" type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="도움말" onClick={() => setMenu((v) => !v)} className="grid size-7 place-items-center rounded-full border border-slate-300 text-sm font-semibold hover:bg-slate-100">?</button>
        {menu && (
          <div role="menu" className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg bg-white text-sm shadow-lg ring-1 ring-slate-900/10">
            <button type="button" role="menuitem" onClick={replay} className="block w-full px-3 py-2 text-left hover:bg-slate-100">둘러보기 다시 보기</button>
            <Link role="menuitem" href="/method" onClick={() => setMenu(false)} className="block px-3 py-2 hover:bg-slate-100">산정 기준</Link>
          </div>
        )}
      </div>
    </header>
  );
}
