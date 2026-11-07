// K-AWARDS 시연 영상 녹화(배포본). 실행: node scripts/demo/record.mjs → screenshots/demo/raw.webm, scenes.json
// 서비스 코드는 건드리지 않는다. 커서·클릭 효과·자막은 이 스크립트에서만 주입한다.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = "https://dasel-weld.vercel.app";
const OUT = "screenshots/demo";
mkdirSync(`${OUT}/scenes`, { recursive: true });

const overlay = () => {
  const boot = () => {
    if (document.getElementById("__demo_cur")) return;
    const st = document.createElement("style");
    st.textContent = `#__demo_cur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;border:2px solid #000;pointer-events:none;left:-50px;top:-50px;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.__demo_rip{position:fixed;z-index:2147483646;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #0b5d33;background:rgba(11,93,51,.25);pointer-events:none;animation:__rip .5s ease-out forwards}
@keyframes __rip{to{transform:scale(4.5);opacity:0}}
#__demo_cap{position:fixed;z-index:2147483645;left:50%;bottom:150px;transform:translateX(-50%);background:rgba(0,0,0,.72);color:#fff;font:700 30px 'Malgun Gothic','Noto Sans KR',sans-serif;padding:14px 30px;border-radius:14px;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}`;
    document.head.appendChild(st);
    const cur = document.createElement("div");
    cur.id = "__demo_cur";
    const cap = document.createElement("div");
    cap.id = "__demo_cap";
    document.body.append(cur, cap);
    addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__demo_rip";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    window.__cap = (t) => {
      cap.style.opacity = "0";
      setTimeout(() => { if (t) { cap.textContent = t; cap.style.opacity = "1"; } }, 300);
    };
    if (window.__lastXY) { cur.style.left = window.__lastXY[0] + "px"; cur.style.top = window.__lastXY[1] + "px"; }
  };
  if (document.body) boot(); else addEventListener("DOMContentLoaded", boot);
};

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "ko-KR", acceptDownloads: true, recordVideo: { dir: `${OUT}/raw`, size: { width: 1920, height: 1080 } } });
await ctx.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); localStorage.setItem("dasel_view", "3d"); } catch {} });
await ctx.addInitScript(overlay);
const page = await ctx.newPage();
const T0 = Date.now();
const now = () => +((Date.now() - T0) / 1000).toFixed(2);
const scenes = [];
const log = {};
let mark = null;
const begin = (name) => { mark = { name, start: now() }; };
const end = () => { mark.end = now(); scenes.push(mark); };
const wait = (ms) => page.waitForTimeout(ms);
const cap = (t) => page.evaluate((x) => window.__cap?.(x), t);
let pos = [960, 540];
async function move(x, y, steps = 35) {
  await page.mouse.move(x, y, { steps });
  pos = [x, y];
  await page.evaluate((p) => (window.__lastXY = p), pos);
}
async function click(x, y) { await move(x, y); await wait(400); await page.mouse.down(); await page.mouse.up(); }
async function clickEl(loc) { const b = await loc.boundingBox(); await click(b.x + b.width / 2, b.y + b.height / 2); }
async function hoverEl(loc) { const b = await loc.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2); }
const tourShown = () => page.locator(".driver-popover").isVisible().catch(() => false);

// ---- 준비: 지도·3D·항공영상이 다 그려질 때까지 기다린다(편집에서 잘라 냄)
await page.goto(BASE);
await page.waitForSelector("#BTN-3D");
await page.waitForLoadState("networkidle").catch(() => {});
await wait(9000);
if (await tourShown()) throw new Error("둘러보기 팝업이 떴습니다(녹화 실패)");

// 1. 첫 화면 3D
begin("1_3d");
await cap("오창 산단 3,425동 전수 계산");
await move(1100, 520);
await page.keyboard.down("Control"); // ctrl 드래그 = 회전
await page.mouse.down();
await move(1000, 520, 40);
await page.mouse.up();
await page.keyboard.up("Control");
log.bearing = await page.evaluate(() => null);
await wait(600);
await cap("초록 설치 우선 · 파랑 이미 설치(AI 판독)");
for (const [x, y] of [[60, 131], [115, 131], [160, 131], [255, 131]]) { await move(x, y, 20); await wait(450); }
await wait(800);
end();

// 2. 합계 띠
begin("2_sum");
const sumText = (await page.locator("#CRD-00").innerText()).replace(/\s+/g, " ");
log.sum = sumText;
await cap("추가 41.2MW · 연 88~112억 절감");
await move(330, 1032);
await wait(1500);
await move(1215, 1032);
await wait(2000);
end();
await wait(1200);

// 2b. 둘러보기: '?' → 다시 보기 → 사람처럼 '다음'을 눌러 끝까지(건물 단계는 강조 건물을 직접 클릭)
begin("2b_tour");
await cap("처음 방문자용 둘러보기");
await clickEl(page.locator("header button", { hasText: "?" }).first());
await wait(500);
await clickEl(page.getByRole("menuitem", { name: "둘러보기 다시 보기" }));
log.tourSteps = [];
for (let i = 0; i < 12; i++) {
  const pop = page.locator(".driver-popover");
  if (!(await pop.isVisible().catch(() => false))) { await wait(1200); if (!(await pop.isVisible().catch(() => false))) break; }
  await wait(1300);
  log.tourSteps.push(await page.locator(".driver-popover-title").innerText().catch(() => "?"));
  const next = page.locator("#BTN-T2");
  if (await next.isVisible().catch(() => false)) {
    await clickEl(next);
  } else {
    const a = page.locator('[data-tour="map-building"]');
    await clickEl(a);
  }
  await wait(900);
}
await wait(1500);
end();
await wait(800);

// 3. 검색
begin("3_search");
await cap("회사명으로 바로 찾기");
await clickEl(page.locator("#INP-01"));
await page.keyboard.type("유한양행", { delay: 120 });
await wait(1500);
const first = page.locator("ul li button").filter({ hasText: "유한양행" }).first();
await hoverEl(first);
await wait(400);
await page.mouse.down(); await page.mouse.up();
end();

// 4. 건물 이동(카메라 이동을 끊지 않는다)
begin("4_building");
await cap("선택 건물 위로 이동, 지붕 사진 확인");
await page.waitForSelector("#TXT-02");
await wait(4500);
const sum2 = page.locator("#TXT-02");
log.panel = await sum2.innerText();
await cap("657kW · 재사용 팩 28개 · 설치 우선");
await hoverEl(sum2);
await page.screenshot({ path: `${OUT}/thumb.png` });
await wait(2200);
const formula = page.getByText(/㎡ × .* ÷ .* = .*kW/).first();
await formula.scrollIntoViewIfNeeded();
await wait(500);
await cap("계산식·출처 공개");
await hoverEl(formula);
await wait(2000);
const chip = page.getByText(/복수 입주|최근 증축 허가|내진설계/).first();
if (await chip.count()) {
  await chip.scrollIntoViewIfNeeded();
  await wait(400);
  await cap("설치 걸림돌 함께 표시");
  await hoverEl(chip);
  await wait(2000);
  log.chip = await chip.innerText();
}
end();
await wait(1000);

// 5. 조건 바꾸기
begin("5_adjust");
const sumEl = page.locator("summary", { hasText: "이 건물 조건 바꾸기" });
await sumEl.scrollIntoViewIfNeeded();
await clickEl(sumEl);
await wait(600);
await cap("조건 변경 즉시 재계산");
const sl = page.locator("#SLD-B1");
await sl.scrollIntoViewIfNeeded();
await wait(400);
const box = await sl.boundingBox();
const xAt = (v) => box.x + 8 + ((v - 30) / 40) * (box.width - 16);
const yy = box.y + box.height / 2;
log.before = await page.locator("#TXT-02").innerText();
await move(xAt(50), yy);
await wait(400);
await page.mouse.down();
await move(xAt(55), yy, 30);
await wait(500);
await move(xAt(60), yy, 30);
await page.mouse.up();
await wait(2500);
log.after = await page.locator("#TXT-02").innerText();
log.util = await sl.inputValue();
end();
await wait(1000);

// 6. 검토의견서
begin("6_opinion_click");
await cap("건물별 검토의견서 A4 자동 작성");
await clickEl(page.locator("#BTN-04"));
end();
await page.waitForURL(/opinion/);
await page.getByText("■ 결론").first().waitFor({ timeout: 60000 }).catch(() => {});
await wait(1500);
begin("6_opinion");
await cap("건물별 검토의견서 A4 자동 작성");
await move(960, 600);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 180); await wait(700); }
await wait(800);
end();
await wait(1000);

// 7. 후보 목록
await page.goto(`${BASE}/list`);
await page.waitForSelector("#BTN-07");
await wait(2500);
if (await tourShown()) throw new Error("미니 둘러보기 팝업이 떴습니다(녹화 실패)");
begin("7_list");
await cap("설치 후보 목록 · CSV로 방문 계획");
await move(700, 300);
await clickEl(page.locator("#FLT-02 button", { hasText: /^설치 우선$/ }).first());
await wait(1500);
await move(700, 600, 30);
await wait(1200);
const dl = page.waitForEvent("download").catch(() => null);
await clickEl(page.locator("#BTN-07"));
const d = await dl;
if (d) await d.saveAs(`${OUT}/candidates.csv`);
await wait(1500);
end();

// 8. 비교
begin("8_compare");
await cap("최대 4동 나란히 비교");
const add = page.locator("tbody button", { hasText: "담기" });
for (let i = 0; i < 3; i++) { await clickEl(add.nth(i)); await wait(350); }
await clickEl(page.locator("header a", { hasText: "비교" }).first());
await page.waitForURL(/compare/);
await wait(2500);
end();
await wait(800);

// 9. 2D 전환
await page.goto(BASE);
await page.waitForSelector("#BTN-3D");
await wait(8000);
begin("9_2d");
await cap("2D·3D 전환, 모바일 지원");
await clickEl(page.locator("#BTN-3D"));
await wait(1800);
await clickEl(page.locator("#BTN-3D"));
await wait(2000);
await page.screenshot({ path: `${OUT}/thumb_last.png` });
end();

const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), `${OUT}/raw.webm`);
writeFileSync(`${OUT}/scenes.json`, JSON.stringify({ scenes, log }, null, 1));
console.log(JSON.stringify({ scenes, log }, null, 1));
