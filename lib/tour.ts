// 둘러보기(T-MAIN). 단계 문구·순서는 STEPS만 고치면 된다(TUR-01).
import type { Driver, PopoverDOM, Side } from "driver.js";

export const TOUR_KEY = "dasel_tour_v1";
const DONE = "done";

export interface TourStep {
  /** data-tour 값 */
  target: string;
  title: string;
  body: string;
  side: Side;
  /** click: 강조 영역을 직접 눌러야 다음으로(10초 뒤 '다음' 표시) */
  advance: "next" | "click";
  /** 이 단계에 필요한 화면 상태 */
  needs: "map" | "anchor" | "panel";
}

export const STEPS: TourStep[] = [
  { target: "search", title: "우리 공장 찾기", body: "회사명이나 주소를 넣으면 그 건물로 바로 갑니다.", side: "bottom", advance: "next", needs: "map" },
  { target: "summary", title: "산단 전체 합계", body: "오창 4개 산단 공장 지붕을 모두 더한 값입니다. 조건을 바꾸면 같이 바뀝니다.", side: "top", advance: "next", needs: "map" },
  { target: "map-building", title: "색이 진할수록 먼저 볼 건물", body: "강조된 건물을 직접 눌러 보세요.", side: "right", advance: "click", needs: "anchor" },
  { target: "card-pv", title: "지붕 태양광", body: "지붕 면적으로 계산한 설치 용량과 1년 발전량입니다.", side: "left", advance: "next", needs: "panel" },
  { target: "card-ess", title: "재사용 배터리", body: "필요한 재사용 배터리 팩 수입니다. 1MWh 이하로 나눠 설치하는 기준입니다.", side: "left", advance: "next", needs: "panel" },
  { target: "card-gate", title: "설치 조건", body: "위험물시설 거리, 구조, 사용 연수를 봤습니다. 최종 판단은 현장 구조검토입니다.", side: "left", advance: "next", needs: "panel" },
  { target: "card-money", title: "절감액과 탄소", body: "청주 산업용 전기요금 실제 평균단가(한전)로 계산합니다. 범위로 보여줍니다.", side: "left", advance: "next", needs: "panel" },
  { target: "nav-sim", title: "조건 바꿔 보기", body: "이용률, 단가, 배터리 등급을 바꿔 산단 전체를 다시 계산합니다. 둘러보기는 ? 에서 다시 볼 수 있습니다.", side: "bottom", advance: "next", needs: "map" },
];

const CLICK_WAIT_MS = 10_000;
const FIND_TRIES = 5;
const FIND_GAP_MS = 300;

let memoryDone = false;

/** null = 저장소를 쓸 수 없음(시크릿 창 등) */
export function tourDone(): boolean | null {
  try {
    return localStorage.getItem(TOUR_KEY) === DONE || memoryDone;
  } catch {
    return memoryDone ? true : null;
  }
}

function markDone() {
  memoryDone = true;
  try {
    localStorage.setItem(TOUR_KEY, DONE);
  } catch {
    // 저장이 막혀 있으면 이번 방문 동안만 기억한다
  }
}

/** 화면이 투어에 맞춰 바꿔 줘야 하는 상태 */
export interface TourHost {
  topId: number | null;
  mobile: boolean;
  select: (id: number | null) => void;
  setAnchor: (id: number | null) => void;
  setLocked: (on: boolean) => void;
  setSheetTall: (on: boolean) => void;
  announce: (text: string) => void;
  onEnd: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

async function find(target: string, tries = FIND_TRIES): Promise<HTMLElement | null> {
  for (let i = 0; i < tries; i++) {
    const el = q(target);
    if (el && el.getClientRects().length) return el;
    await sleep(FIND_GAP_MS);
  }
  return null;
}

export interface TourHandle {
  /** 지도에서 강조 건물을 눌렀을 때 호출 */
  buildingClicked: () => void;
  stop: () => void;
}

export async function startTour(host: TourHost): Promise<TourHandle | null> {
  // TUR-10: 강조할 대상이 3개 미만이면 시작하지 않는다
  if (STEPS.filter((s) => s.needs === "map" && q(s.target)).length < 3) return null;
  let driverFn: typeof import("driver.js").driver;
  try {
    driverFn = (await import("driver.js")).driver;
  } catch {
    return null; // 라이브러리를 못 불러와도 서비스는 그대로 동작한다
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let current = -1;
  let clickUnlocked = false;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let ended = false;

  async function prepare(i: number) {
    const s = STEPS[i];
    host.setSheetTall(s.needs === "panel");
    if (s.needs === "panel") {
      host.setAnchor(null);
      host.select(host.topId);
    } else {
      host.select(null);
      host.setAnchor(s.needs === "anchor" ? host.topId : null);
      if (s.needs === "anchor") await sleep(reduced ? 300 : 1400); // 1순위 건물로 이동하는 동안 기다린다
    }
  }

  async function go(from: number, dir: 1 | -1) {
    if (busy || ended) return;
    busy = true;
    try {
      for (let i = from + dir; ; i += dir) {
        if (i < 0) return;
        if (i >= STEPS.length) return end();
        await prepare(i);
        // 지도 속 건물 앵커는 지도 로딩이 끝나야 생기므로 더 오래 기다린다
        let el = await find(STEPS[i].target, STEPS[i].needs === "anchor" ? 25 : FIND_TRIES);
        // TUR-04: 앵커를 못 잡으면 지도 전체를 강조하고 '다음'으로 넘긴다
        if (!el && STEPS[i].needs === "anchor") el = q("map");
        if (!el) {
          console.warn(`[tour] 대상 없음: ${STEPS[i].target}`);
          continue;
        }
        if (STEPS[i].needs === "panel") {
          el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
          await sleep(reduced ? 0 : 250);
        }
        current = i;
        clickUnlocked = STEPS[i].advance !== "click" || el.dataset.tour !== STEPS[i].target;
        d.drive(i);
        host.announce(`${i + 1}/${STEPS.length} ${STEPS[i].title}. ${STEPS[i].body}`);
        return;
      }
    } finally {
      busy = false;
    }
  }

  function render(popover: PopoverDOM) {
    clearTimeout(clickTimer);
    const skip = document.createElement("button");
    skip.type = "button";
    skip.id = "BTN-T3";
    skip.textContent = "건너뛰기";
    skip.className = "dasel-tour-skip";
    skip.addEventListener("click", end);
    popover.footerButtons.prepend(skip);
    popover.previousButton.id = "BTN-T1";
    popover.nextButton.id = "BTN-T2";
    popover.progress.id = "IND-T1";
    if (!clickUnlocked) {
      popover.nextButton.style.display = "none";
      clickTimer = setTimeout(() => {
        clickUnlocked = true;
        popover.nextButton.style.display = "";
      }, CLICK_WAIT_MS);
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") end();
  };

  // 건너뛰기·Esc·완료 모두 여기로 온다. driver.js의 종료 훅에만 기대지 않는다.
  function end() {
    if (ended) return;
    ended = true;
    clearTimeout(clickTimer);
    removeEventListener("keydown", onKey);
    markDone(); // 중간에 끝내도 본 것으로 기록한다
    host.setAnchor(null);
    host.setLocked(false);
    host.setSheetTall(false);
    host.select(null);
    d.destroy();
    host.onEnd();
  }

  const d: Driver = driverFn({
    overlayColor: "rgb(17,24,39)",
    overlayOpacity: 0.62,
    stagePadding: 8,
    stageRadius: 10,
    animate: !reduced,
    smoothScroll: false,
    allowClose: false,
    overlayClickBehavior: "none",
    allowKeyboardControl: true,
    showProgress: true,
    progressText: "{{current}}/{{total}}",
    prevBtnText: "이전",
    nextBtnText: "다음",
    doneBtnText: "시작하기",
    popoverClass: "dasel-tour",
    showButtons: ["previous", "next"],
    onPopoverRender: render,
    onNextClick: () => {
      if (clickUnlocked) void go(current, 1);
    },
    onPrevClick: () => void go(current, -1),
    onDestroyed: () => end(),
    steps: STEPS.map((s) => ({
      element: () => q(s.target) ?? q("map") ?? document.body,
      disableActiveInteraction: s.advance !== "click",
      popover: { title: s.title, description: s.body, side: host.mobile ? (s.needs === "panel" ? "top" : "bottom") : s.side, align: "center" },
    })),
  });

  addEventListener("keydown", onKey);
  host.setLocked(true);
  await go(-1, 1);
  if (current < 0) {
    d.destroy();
    return null;
  }
  return {
    buildingClicked: () => {
      if (current >= 0 && STEPS[current].advance === "click") {
        clickUnlocked = true;
        void go(current, 1);
      }
    },
    stop: end,
  };
}

/** TUR-08 페이지별 미니 투어(첫 진입 1회). 대상이 없으면 그 단계는 건너뛴다. */
export interface MiniStep {
  target: string;
  title: string;
  body: string;
  side: Side;
}

export const MINI_TOURS: Record<"sim" | "list", { key: string; steps: MiniStep[] }> = {
  sim: {
    key: "dasel_tour_sim_v1",
    steps: [
      { target: "sim-sliders", title: "조건", body: "값을 움직이면 바로 다시 계산됩니다.", side: "right" },
      { target: "sim-result", title: "산단별 결과", body: "기본값보다 늘거나 준 만큼 함께 보여줍니다.", side: "top" },
      { target: "sim-reset", title: "저장과 초기화", body: "지금 조건을 링크로 복사하거나 처음 값으로 되돌립니다.", side: "left" },
    ],
  },
  list: {
    key: "dasel_tour_list_v1",
    steps: [
      { target: "list-filter", title: "걸러 보기", body: "지도와 같은 조건이 걸려 있습니다.", side: "bottom" },
      { target: "list-csv", title: "내려받기", body: "지금 목록을 엑셀에서 열 수 있는 파일로 받습니다.", side: "left" },
    ],
  },
};

export async function startMiniTour(name: keyof typeof MINI_TOURS): Promise<void> {
  const { key, steps } = MINI_TOURS[name];
  try {
    if (localStorage.getItem(key) === DONE) return;
  } catch {
    return; // 저장소를 못 쓰면 매번 뜨지 않게 아예 시작하지 않는다
  }
  const found = steps.filter((st) => q(st.target));
  if (!found.length) return;
  let driverFn: typeof import("driver.js").driver;
  try {
    driverFn = (await import("driver.js")).driver;
  } catch {
    return;
  }
  const done = () => {
    try {
      localStorage.setItem(key, DONE);
    } catch {
      // 무시
    }
  };
  const d = driverFn({
    overlayColor: "rgb(17,24,39)",
    overlayOpacity: 0.62,
    stagePadding: 8,
    stageRadius: 10,
    animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    showProgress: true,
    progressText: "{{current}}/{{total}}",
    prevBtnText: "이전",
    nextBtnText: "다음",
    doneBtnText: "확인",
    popoverClass: "dasel-tour",
    onDestroyed: done,
    steps: found.map((st) => ({ element: `[data-tour="${st.target}"]`, popover: { title: st.title, description: st.body, side: st.side, align: "center" as const } })),
  });
  done(); // 중간에 닫아도 다시 띄우지 않는다
  d.drive();
}
