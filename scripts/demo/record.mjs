// K-AWARDS 시연 영상 녹화(배포본, v6). 실행: node scripts/demo/record.mjs [main|ask]
// 배포본 접속은 실행 1회당 page.goto 1번. 이후 이동은 화면 안 링크 클릭(클라이언트 이동)만.
// 서비스 코드는 건드리지 않는다. 커서·클릭 효과·자막은 이 스크립트에서만 주입한다.
// 결과: screenshots/demo/raw_<mode>.webm, scenes_<mode>.json(장면 시각·OpenAI 응답 시간)
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const MODE = process.argv[2] ?? "main";
const BASE = "https://dasel-weld.vercel.app";
const OUT = "screenshots/demo";
mkdirSync(`${OUT}/raw`, { recursive: true });

const overlay = () => {
  const boot = () => {
    if (document.getElementById("__demo_cur")) return;
    const st = document.createElement("style");
    st.textContent = `#__demo_cur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;border:2px solid #000;pointer-events:none;left:-50px;top:-50px;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.__demo_rip{position:fixed;z-index:2147483646;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #0b5d33;background:rgba(11,93,51,.25);pointer-events:none;animation:__rip .5s ease-out forwards}
@keyframes __rip{to{transform:scale(4.5);opacity:0}}
#__demo_cap{position:fixed;z-index:2147483645;left:50%;bottom:40px;transform:translateX(-50%);background:rgba(0,0,0,.72);color:#fff;font:700 30px 'Malgun Gothic','Noto Sans KR',sans-serif;padding:12px 28px;border-radius:12px;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}`;
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
      setTimeout(() => { if (t) { cap.textContent = t; cap.style.opacity = "1"; } }, 200);
    };
  };
  if (document.body) boot(); else addEventListener("DOMContentLoaded", boot);
};

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
// 첫 방문자: localStorage 비운 새 컨텍스트, dasel_view 설정 안 함
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "ko-KR", recordVideo: { dir: `${OUT}/raw`, size: { width: 1920, height: 1080 } } });
await ctx.addInitScript(overlay);
const page = await ctx.newPage();
const T0 = Date.now();
const now = () => +((Date.now() - T0) / 1000).toFixed(2);
const scenes = [];
const log = { mode: MODE };
let mark = null;
const begin = (name) => { mark = { name, start: now() }; };
const end = () => { mark.end = now(); scenes.push(mark); };
const wait = (ms) => page.waitForTimeout(ms);
const cap = (t) => page.evaluate((x) => window.__cap?.(x), t);
async function move(x, y, steps = 20) { await page.mouse.move(x, y, { steps }); }
async function click(x, y) { await move(x, y); await wait(250); await page.mouse.down(); await page.mouse.up(); }
async function clickEl(loc) { await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); await click(b.x + b.width / 2, b.y + b.height / 2); }
async function type(t) { await page.keyboard.type(t, { delay: 70 }); }

async function askScene() {
  begin("9_ask");
  await cap("계산 결과 근거 질의응답 · 숫자 자동 검산");
  const q = page.getByRole("button", { name: "유한양행 건물이 설치 우선인 이유는?" }).first();
  await clickEl(q);
  const t = Date.now();
  await page.locator("#ASK-THREAD div.justify-start").first().waitFor({ timeout: 30000 });
  log.askMs = Date.now() - t;
  log.askText = (await page.locator("#ASK-THREAD div.justify-start").first().innerText()).slice(0, 400);
  await wait(4000); // 답변 뒤 4초 유지
  await page.screenshot({ path: `${OUT}/rep_ask.png` });
  end();
}

if (MODE === "ask") {
  await page.goto(`${BASE}/ask`);
  await page.getByRole("button", { name: "유한양행 건물이 설치 우선인 이유는?" }).first().waitFor();
  await wait(2500);
  log.price = await page.locator("dl").first().innerText();
  await askScene();
} else {
  // ---- 접속(1회). 로딩 구간은 편집에서 잘라 낸다
  begin("1_tour");
  await page.goto(BASE);
  await page.waitForSelector("#BTN-3D");
  await page.locator(".driver-popover").waitFor({ timeout: 30000 });
  await wait(6000); // 지도·타일 그리기
  mark.start = now() - 0.3;
  await cap("처음 방문 시 둘러보기 자동 안내");
  log.tourSteps = [];
  for (let i = 0; i < 4; i++) {
    await wait(900);
    log.tourSteps.push(await page.locator(".driver-popover-title").innerText().catch(() => "?"));
    await clickEl(page.locator("#BTN-T2"));
  }
  await wait(900);
  log.tourSteps.push(await page.locator(".driver-popover-title").innerText().catch(() => "?"));
  await wait(500);
  await clickEl(page.locator("#BTN-T3"));
  await wait(800);
  if (await page.locator(".driver-popover").isVisible().catch(() => false)) { await page.keyboard.press("Escape"); await wait(600); }
  log.tourClosed = !(await page.locator(".driver-popover").isVisible().catch(() => false));
  end();
  log.price = await page.locator("#TXT-PRICE").first().innerText();
  log.health = await page.evaluate(() => fetch("/api/health").then((r) => r.json()).catch((e) => String(e)));
  log.sum = (await page.locator("#CRD-00").innerText()).replace(/\s+/g, " ");

  // 2. 3D 회전
  begin("2_3d");
  await cap("오창 산단 3,425동 전수 계산");
  await move(1150, 560);
  await page.mouse.down({ button: "right" });
  await move(980, 560, 60);
  await page.mouse.up({ button: "right" });
  await wait(1200);
  end();

  // 3. 용량 큰 30동 시나리오(1.0배속)
  begin("3_top30");
  await cap("용량 큰 30동 = 추가 용량의 50.4%");
  await clickEl(page.locator("#BTN-TOP30"));
  log.top30btn = await page.locator("#BTN-TOP30").evaluateAll((e) => e.map((x) => [x.offsetParent !== null, x.disabled, x.getBoundingClientRect().y]));
  await page.locator("#BOX-TOP30").waitFor({ timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: `${OUT}/fail.png` }); console.log(JSON.stringify(log)); throw e; });
  await wait(6800);
  log.top30 = (await page.locator("#BOX-TOP30").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: `${OUT}/rep_top30.png` });
  await wait(500);
  end();
  await clickEl(page.locator("#BTN-TOP30-RESET"));
  await wait(1500);

  // 4. 말로 찾기
  begin("4_nl");
  await cap("말로 찾기 · AI가 조건으로 변환");
  await clickEl(page.locator("#INP-NL"));
  await type("오창과학 200kW 이상 내진설계 적용 공장");
  await wait(250);
  await clickEl(page.locator("#BTN-NL"));
  const t = Date.now();
  await page.locator("#NL-CHIPS span.rounded-full").first().waitFor({ timeout: 15000 });
  log.nlMs = Date.now() - t;
  await wait(400);
  log.chips = await page.locator("#NL-CHIPS").innerText();
  await page.screenshot({ path: `${OUT}/rep_nl.png` });
  await wait(1800);
  // 칩 모두 해제 → 주변 건물이 원래 단계 색으로
  await clickEl(page.locator("#NL-CHIPS button", { hasText: "모두 해제" }));
  await wait(900);
  end();

  // 5. 1순위 건물 → 비행 → 패널(1.0배속)
  begin("5_building");
  await clickEl(page.locator("#BTN-01"));
  await page.waitForSelector("#TXT-PANEL");
  const kw = (await page.locator("#TXT-PANEL").innerText()).match(/([\d,.]+)\s*kW/)?.[1]?.replace(/\.0$/, "");
  log.panel = await page.locator("#TXT-PANEL").innerText();
  await cap(`지붕 위 패널 배치 · ${kw}kW`);
  await wait(5500);
  await page.screenshot({ path: `${OUT}/rep_panels.png` });
  await page.screenshot({ path: `${OUT}/thumb.png` });
  end();

  // 6. AI 판독 근거
  begin("6_ai");
  await cap("AI 판독 근거 공개");
  await clickEl(page.locator("#TAB-AI-BTN"));
  await wait(3500);
  await page.screenshot({ path: `${OUT}/rep_ai.png` });
  end();

  // 7. 조건 변경
  begin("7_adjust");
  await cap("조건 변경 즉시 재계산");
  await clickEl(page.locator("#TAB-CALC-BTN"));
  await wait(300);
  await clickEl(page.locator("#PNL-07 summary"));
  await wait(400);
  const sl = page.locator("#SLD-B1");
  await sl.scrollIntoViewIfNeeded();
  const box = await sl.boundingBox();
  const xAt = (v) => box.x + 8 + ((v - 30) / 40) * (box.width - 16);
  const yy = box.y + box.height / 2;
  log.before = await page.locator("#TXT-02").innerText();
  await move(xAt(50), yy);
  await wait(250);
  await page.mouse.down();
  await move(xAt(60), yy, 40);
  await page.mouse.up();
  await wait(1500);
  log.after = await page.locator("#TXT-02").innerText();
  log.util = await sl.inputValue();
  end();

  // 8. 검토의견서
  begin("8_opinion");
  await cap("건물별 검토의견서 자동 작성");
  await clickEl(page.locator("#BTN-04"));
  await page.waitForURL(/opinion/);
  await page.getByText("■ 결론").first().waitFor({ timeout: 30000 }).catch(() => {});
  await wait(700);
  await move(960, 600);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 200); await wait(450); }
  end();

  // 9. 질의응답(뒤로 가기 → 헤더 탭, 새 접속 없음)
  await page.goBack();
  await page.waitForSelector("#BTN-3D");
  await wait(500);
  await clickEl(page.locator("header a", { hasText: "질의응답" }).first());
  await page.waitForURL(/\/ask/);
  await page.getByRole("button", { name: "유한양행 건물이 설치 우선인 이유는?" }).first().waitFor();
  await wait(1500);
  await askScene();
}

const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), `${OUT}/raw_${MODE}.webm`);
writeFileSync(`${OUT}/scenes_${MODE}.json`, JSON.stringify({ scenes, log }, null, 1));
console.log(JSON.stringify({ scenes, log }, null, 1));
