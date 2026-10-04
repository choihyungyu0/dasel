"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/components/Store";
import { LABELS, parseLabelCsv, toLabelCsv, type Label } from "@/lib/labels";

const LabelMap = dynamic(() => import("@/components/LabelMap"), { ssr: false });

const STORE_KEY = "dasel_labels_v1";
const HINT: Record<Label, string> = {
  설치: "지붕에 태양광 패널(짙은 남색·검정 격자)이 보인다",
  미설치: "지붕 전체가 보이고 패널이 없다",
  불명: "그림자·해상도·공사 중 등으로 판단할 수 없다",
};
const COLOR: Record<Label, string> = { 설치: "bg-tier-go text-white", 미설치: "bg-ink text-white", 불명: "bg-slate-300 text-ink" };

interface Saved {
  labeler: string;
  imageYear: string;
  labels: Record<string, Label>;
}

function load(): Saved {
  try {
    return { labeler: "", imageYear: "", labels: {}, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") };
  } catch {
    return { labeler: "", imageYear: "", labels: {} };
  }
}

/** VAL-01 라벨링 화면: 30kW 이상 대상 건물을 점수 순으로 항공영상 확대해 기존 태양광 설치 여부를 표시한다. */
export default function LabelPage() {
  const { status, ds } = useStore();
  const [saved, setSaved] = useState<Saved>({ labeler: "", imageYear: "", labels: {} });
  const [ready, setReady] = useState(false);
  const [at, setAt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  // AI 판독(참고용). 사람이 확인해 눌러야 라벨로 기록된다
  const [draft, setDraft] = useState<Record<string, Label>>({});
  // 사람 검수 표본: AI '설치' 전부 + '미설치' 무작위 50동
  const [queue, setQueue] = useState<Set<number> | null>(null);
  const [onlyQueue, setOnlyQueue] = useState(true);
  useEffect(() => {
    fetch("/data/label_draft.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.labels && setDraft(d.labels))
      .catch(() => {});
    fetch("/data/label_queue.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.ids) && setQueue(new Set<number>(d.ids)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSaved(load());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      setNote("이 브라우저에는 저장할 수 없어요. 끝낼 때 꼭 CSV로 내려받아 주세요");
    }
  }, [saved, ready]);

  // 대상: 30kW 이상 대상 건물, 점수 높은 순(동점이면 용량 큰 순)
  const list = useMemo(
    () =>
      (ds?.buildings ?? [])
        .filter((b) => b.score.tier !== "제외" && b.calc.pv_kw !== null && !b.calc.small && (!onlyQueue || !queue || queue.has(b.bld_id)))
        .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0) || (b.calc.pv_kw ?? 0) - (a.calc.pv_kw ?? 0)),
    [ds, queue, onlyQueue],
  );
  const b = list[at] ?? null;
  const feature = useMemo(() => (b ? (ds?.geo.features.find((f) => Number(f.properties?.bld_id) === b.bld_id) ?? null) : null), [ds, b]);
  const done = list.filter((x) => saved.labels[x.bld_id]).length;
  const counts = LABELS.map((l) => [l, list.filter((x) => saved.labels[x.bld_id] === l).length] as const);

  const go = useCallback((i: number) => setAt(Math.max(0, Math.min(list.length - 1, i))), [list.length]);
  const mark = useCallback(
    (label: Label) => {
      if (!b) return;
      if (!saved.labeler.trim()) return setNote("먼저 라벨러 이름을 적어 주세요");
      setNote(null);
      setSaved((s) => ({ ...s, labels: { ...s.labels, [b.bld_id]: label } }));
      go(at + 1);
    },
    [b, saved.labeler, at, go],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "1") mark("설치");
      else if (e.key === "2") mark("미설치");
      else if (e.key === "3") mark("불명");
      else if (e.key === "Enter" && b && draft[b.bld_id]) mark(draft[b.bld_id]);
      else if (e.key === "ArrowLeft") go(at - 1);
      else if (e.key === "ArrowRight") go(at + 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [mark, go, at, b, draft]);

  const download = () => {
    const rows = list.filter((x) => saved.labels[x.bld_id]).map((x) => ({ bld_id: x.bld_id, label: saved.labels[x.bld_id], labeler: saved.labeler, image_year: saved.imageYear }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toLabelCsv(rows)], { type: "text/csv;charset=utf-8" }));
    a.download = `existing_pv_${saved.labeler.trim() || "labeler"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNote(`${rows.length}동을 내려받았어요. data/labels 폴더에 넣어 주세요`);
  };

  const upload = async (f: File) => {
    const { rows, skipped } = parseLabelCsv(await f.text());
    setSaved((s) => ({
      labeler: s.labeler || rows[0]?.labeler || "",
      imageYear: s.imageYear || rows[0]?.image_year || "",
      labels: { ...s.labels, ...Object.fromEntries(rows.map((r) => [r.bld_id, r.label])) },
    }));
    setNote(`${rows.length}동을 불러왔어요${skipped ? ` · 형식이 맞지 않는 ${skipped}줄은 건너뛰었어요` : ""}`);
  };

  if (status !== "ready" || !ds) return <main className="p-6 text-sm text-slate-500">{status === "error" ? "건물 데이터를 불러오지 못했어요" : "공장 건물 불러오는 중"}</main>;

  return (
    <main className="flex h-dvh flex-col gap-2 p-2 md:flex-row md:p-3">
      <section className="surface relative min-h-[45dvh] flex-1 overflow-hidden">{feature && <LabelMap feature={feature} />}</section>

      <section className="surface flex w-full flex-col gap-3 bg-white p-4 md:w-[360px]">
        <header>
          <div className="flex items-center justify-between">
            <h1 className="text-[15px] font-semibold">기존 태양광 설치 라벨링</h1>
            <Link href="/" className="text-xs underline">지도로</Link>
          </div>
          <p className="mt-1 text-xs text-slate-600">{onlyQueue && queue ? `검수 표본 ${list.length}동(AI 판독 '설치' 전부 + '미설치' 무작위 50동)` : `30kW 이상 대상 건물 ${list.length}동`}을 점수 순으로 봅니다. 노란 외곽선 안 지붕에 패널이 있는지 표시해 주세요.</p>
          {queue && (
            <button type="button" onClick={() => { setOnlyQueue(!onlyQueue); setAt(0); }} className="mt-1 rounded border border-slate-300 px-2 py-0.5 text-[11px]">
              {onlyQueue ? "전체 건물 보기" : "검수 표본만 보기"}
            </button>
          )}
        </header>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="block">
            라벨러
            <input value={saved.labeler} onChange={(e) => setSaved({ ...saved, labeler: e.target.value })} maxLength={20} placeholder="이름 또는 이니셜" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="block">
            영상 촬영연도
            <input value={saved.imageYear} onChange={(e) => setSaved({ ...saved, imageYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="예: 2025" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
        </div>

        {b && (
          <div className="rounded-lg bg-slate-100 p-3">
            <p className="num text-xs text-slate-500">{at + 1} / {list.length} · 건물 {b.bld_id}</p>
            <p className="truncate text-sm font-semibold">{b.companies[0]?.company ?? b.name ?? "등록공장 정보 연결 안 됨"}</p>
            <p className="truncate text-xs text-slate-600">{b.addr ?? "주소 정보 없음"}</p>
            <p className="num mt-1 text-xs text-slate-600">{b.calc.pv_kw?.toLocaleString("ko-KR")}kW · {b.score.tier} {b.score.score}/{b.score.max}</p>
            <p className="mt-1 text-xs">
              현재 표시: <strong>{saved.labels[b.bld_id] ?? "없음"}</strong>
            </p>
            {draft[b.bld_id] && (
              <p className="mt-1 rounded bg-white px-2 py-1 text-xs">
                AI 판독: <strong>{draft[b.bld_id]}</strong> <span className="text-slate-500">— 맞으면 Enter, 다르면 직접 고르세요</span>
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {LABELS.map((l, i) => (
            <button key={l} type="button" title={HINT[l]} onClick={() => mark(l)} className={`rounded-lg px-2 py-3 text-sm font-semibold ${COLOR[l]} ${b && saved.labels[b.bld_id] === l ? "ring-2 ring-cell ring-offset-2" : ""}`}>
              {l}
              <span className="block text-[11px] font-normal opacity-80">단축키 {i + 1}</span>
            </button>
          ))}
        </div>
        <ul className="space-y-0.5 text-[11px] text-slate-600">
          {LABELS.map((l) => <li key={l}><strong>{l}</strong> — {HINT[l]}</li>)}
        </ul>

        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => go(at - 1)} disabled={at === 0} className="rounded-md border border-slate-300 px-2.5 py-1 disabled:opacity-40">이전 ←</button>
          <button type="button" onClick={() => go(at + 1)} disabled={at >= list.length - 1} className="rounded-md border border-slate-300 px-2.5 py-1 disabled:opacity-40">다음 →</button>
          <button type="button" onClick={() => go(Math.max(0, list.findIndex((x) => !saved.labels[x.bld_id])))} className="rounded-md border border-slate-300 px-2.5 py-1">표시 안 한 곳으로</button>
        </div>

        <div className="mt-auto space-y-2 border-t border-slate-200 pt-3">
          <p className="num text-xs text-slate-600">진행 {done} / {list.length} · {counts.map(([l, c]) => `${l} ${c}`).join(" · ")}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={download} disabled={!done} className="rounded-md bg-ink px-2.5 py-1 text-white disabled:opacity-40">CSV 내려받기</button>
            <button type="button" onClick={() => file.current?.click()} className="rounded-md border border-slate-300 px-2.5 py-1">CSV 불러오기</button>
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          {note && <p role="status" className="text-xs text-slate-700">{note}</p>}
          <p className="text-[11px] text-slate-500">AI 판독은 참고용이며 사람이 누른 것만 기록됩니다. 표시는 이 브라우저에 자동 저장됩니다. 파일 형식: bld_id, label, labeler, image_year</p>
        </div>
      </section>
    </main>
  );
}
