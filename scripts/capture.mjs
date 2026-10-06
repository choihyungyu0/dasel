// 포스터용 화면 캡처. 설치된 Chrome을 써서 배포 주소를 1920×1080, 390×844 두 크기로 찍는다.
//   node scripts/capture.mjs [기준 주소]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
const OUT = "screenshots/poster";
const SIZES = [
  { name: "pc", width: 1920, height: 1080 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];
const SCALE = 2; // 인쇄용으로 2배 밀도

const settle = (page, ms = 5000) => page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}).then(() => page.waitForTimeout(ms));
const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, " ").trim()).catch(() => null);
const all = (page, sel) => page.locator(sel).allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, " ").trim()));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const numbers = {};

for (const size of SIZES) {
  const { name, ...viewport } = size;
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: SCALE, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, locale: "ko-KR" });
  await ctx.addInitScript(() => {
    if (!location.search.includes("tour=1")) try { localStorage.setItem("dasel_tour_v1", "done"); } catch {}
  });
  const page = await ctx.newPage();
  const shot = (file) => page.screenshot({ path: `${OUT}/${name}_${file}.png` });
  const n = (numbers[name] = {});

  // 1) 지도 첫 화면
  await page.goto(BASE);
  await page.waitForSelector("#CRD-00");
  await settle(page, 7000);
  await shot("1_map");
  n["1 지도 첫 화면"] = { 합계: await all(page, "#CRD-00 dd"), 범위: await text(page, "#CRD-00 h2") };

  // 2) 1순위 건물 패널
  await page.click("#BTN-01:visible, #BTN-01M:visible");
  await page.waitForSelector("#WF2");
  await settle(page, 5000);
  await shot("2_panel");
  n["2 1순위 건물 패널"] = {
    건물: await text(page, "#WF2 header p"), 결론: await text(page, "#TXT-02"),
    태양광: await all(page, "#CRD-02 .num"), ESS: await all(page, "#CRD-03 .num"), 절감탄소: await all(page, "#CRD-04 .num"), 점수: await text(page, "#SCR-01"),
  };
  const id = await page.locator("#BTN-04").getAttribute("href").then((h) => h.split("/").pop());

  // 3) 둘러보기 3단계
  await page.goto(`${BASE}/?tour=1`);
  await page.waitForSelector(".driver-popover", { timeout: 30000 });
  for (let i = 0; i < 2; i++) {
    await page.click(".driver-popover-next-btn");
    await page.waitForTimeout(1200);
  }
  await page.waitForSelector("#TUR-ANCHOR", { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector(".driver-popover-progress-text")?.textContent === "3/8", null, { timeout: 30000 }).catch(() => {});
  await settle(page, 4000);
  await shot("3_tour_step3");
  n["3 둘러보기 3단계"] = { 진행: await text(page, ".driver-popover-progress-text"), 제목: await text(page, ".driver-popover-title"), 강조: await page.locator(".driver-active-element").getAttribute("data-tour").catch(() => null) };
  await page.keyboard.press("Escape");

  // 4) 시뮬레이터
  await page.goto(`${BASE}/sim`);
  await page.waitForSelector("#TBL-01");
  await settle(page, 2000);
  await page.screenshot({ path: `${OUT}/${name}_4_sim.png`, fullPage: name === "mobile" });
  n["4 시뮬레이터"] = { 표: await all(page, "#TBL-01 tbody tr") };

  // 5) 검토의견서 인쇄 보기
  await page.goto(`${BASE}/opinion/${id}`);
  await page.waitForSelector("#TXT-01 .whitespace-pre-wrap", { timeout: 30000 });
  await settle(page, 5000);
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: `${OUT}/${name}_5_opinion_print.png`, fullPage: true });
  n["5 검토의견서"] = { 핵심숫자: await all(page, "#WF7 dl dd"), 작성방식: await text(page, "#TXT-01 span"), 본문: await text(page, "#TXT-01 .whitespace-pre-wrap") };
  if (name === "pc") {
    const pdf = await page.pdf({ format: "A4", printBackground: true }).catch(() => null);
    if (pdf) {
      writeFileSync(`${OUT}/opinion_A4.pdf`, pdf);
      n["5 검토의견서"].PDF쪽수 = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    }
  }
  await page.emulateMedia({ media: "screen" });
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/numbers.json`, JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(numbers, null, 1));
