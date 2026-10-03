// P1 화면 확인용(배포 주소): 조건 바꾸기, 비교, 미니 투어, ESS 차익·공간.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
mkdirSync("screenshots/check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
await ctx.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); } catch {} });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
const txt = (sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, " ").trim()).catch(() => null);
const out = {};

// 미니 투어(시뮬레이터)
await page.goto(`${BASE}/sim`);
await page.waitForSelector("#TBL-01");
await page.waitForSelector(".driver-popover", { timeout: 8000 }).catch(() => {});
out.sim_tour = [await txt(".driver-popover-progress-text"), await txt(".driver-popover-title")];
await page.keyboard.press("Escape");
await page.reload();
await page.waitForSelector("#TBL-01");
await page.waitForTimeout(2000);
out.sim_tour_again = await page.locator(".driver-popover").count();

// 미니 투어(목록) + 담기
await page.goto(`${BASE}/list`);
await page.waitForSelector("#TBL-02");
await page.waitForSelector(".driver-popover", { timeout: 8000 }).catch(() => {});
out.list_tour = [await txt(".driver-popover-progress-text"), await txt(".driver-popover-title")];
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
for (let i = 0; i < 5; i++) await page.locator("#TBL-02 tbody tr").nth(i).getByRole("button", { name: /담기|담김/ }).click();
out.list_fifth = await txt("[role=status]");
out.nav_compare = await txt("#NAV-01 a:last-child");

// 비교 화면
await page.goto(`${BASE}/compare`);
await page.waitForSelector("#TBL-03");
out.compare_cols = await page.locator("#TBL-03 thead th").count();
out.compare_rows = await page.locator("#TBL-03 tbody tr").allInnerTexts().then((a) => a.slice(0, 3).map((t) => t.replace(/\s+/g, " ")));
out.compare_bold = await page.locator("#TBL-03 td.font-bold").count();
await page.screenshot({ path: "screenshots/check/compare.png" });
await page.reload();
await page.waitForSelector("#TBL-03");
out.compare_after_reload = (await page.locator("#TBL-03 thead th").count()) - 1;

// 패널: 조건 바꾸기
await page.goto(`${BASE}/?b=121902`);
await page.waitForSelector("#WF2");
await page.waitForTimeout(4000);
out.panel_ess_save = await txt("#TXT-ESS");
out.panel_space = await page.locator("#CRD-03 dl div").last().innerText().then((t) => t.replace(/\s+/g, " "));
out.kw_before = await txt("#CRD-02 .num");
await page.locator("#PNL-07 summary").click();
const t0 = Date.now();
await page.locator("#SLD-B1").fill("40");
await page.waitForFunction((prev) => document.querySelector("#CRD-02 .num")?.textContent?.replace(/\s+/g, " ").trim() !== prev, out.kw_before, { timeout: 3000 }).catch(() => {});
out.adjust_ms = Date.now() - t0;
out.kw_after = await txt("#CRD-02 .num");
out.delta = await txt("#PNL-07 p.num");
await page.locator("#BTN-05").click();
await page.waitForTimeout(300);
out.link = await txt("#WF2 footer [role=status]");
await page.screenshot({ path: "screenshots/check/panel_adjust.png" });
await page.getByRole("button", { name: "기본값으로" }).click();
out.kw_reset = await txt("#CRD-02 .num");

// 조건이 담긴 링크로 열기
await page.goto(`${BASE}/?b=121902&s=u40.a10.p192.4.h2.k60.sa70.sx90`);
await page.waitForSelector("#WF2");
await page.waitForTimeout(3000);
out.link_restore = { kw: await txt("#CRD-02 .num"), open: await page.locator("#PNL-07").getAttribute("open") !== null };
out.tray = await txt("#TRY-01");
await page.evaluate(() => localStorage.removeItem("dasel_compare_v1"));

out.errs = errs;
await browser.close();
console.log(JSON.stringify(out, null, 1));
