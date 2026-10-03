// v1.5 화면 확인용(배포 주소). 라벨링 화면 캡처와 패널·시뮬레이터 값을 찍어 본다.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
mkdirSync("screenshots/check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR", acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); } catch {} });
const page = await ctx.newPage();
const txt = (sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, " ").trim()).catch(() => null);
const out = {};

// 라벨링 화면
await page.goto(`${BASE}/label`);
await page.waitForSelector("canvas");
await page.waitForTimeout(6000);
out.label_first = await txt("main section:nth-of-type(2) .rounded-lg.bg-slate-100");
await page.keyboard.press("1");
await page.waitForTimeout(300);
out.without_name = await txt("[role=status]");
await page.fill('input[placeholder="이름 또는 이니셜"]', "test");
await page.fill('input[placeholder="예: 2025"]', "2025");
await page.keyboard.press("Tab");
await page.locator("body").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("1");
await page.waitForTimeout(1500);
await page.keyboard.press("2");
await page.waitForTimeout(1500);
await page.keyboard.press("3");
await page.waitForTimeout(4000);
out.progress = await txt("p.num.text-xs.text-slate-600 >> nth=-1");
out.now = await txt("main section:nth-of-type(2) .rounded-lg.bg-slate-100");
await page.screenshot({ path: "screenshots/check/label.png" });
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV 내려받기" }).click()]);
out.csv_name = dl.suggestedFilename();
const stream = await dl.createReadStream();
let csv = "";
for await (const chunk of stream) csv += chunk.toString("utf8");
out.csv = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
await page.reload();
await page.waitForSelector("canvas");
await page.waitForTimeout(1500);
out.after_reload = await txt("p.num.text-xs.text-slate-600 >> nth=-1");
await page.evaluate(() => localStorage.removeItem("dasel_labels_v1"));

// 패널(1순위 건물)
await page.goto(`${BASE}/?b=121902`);
await page.waitForSelector("#WF2");
await page.waitForTimeout(5000);
out.ess = await txt("#CRD-03");
out.money = await txt("#CRD-04");
out.chips = await page.locator("#BDG-01 li").allInnerTexts();
await page.screenshot({ path: "screenshots/check/panel.png" });

// 시뮬레이터 옥내 전환
await page.goto(`${BASE}/sim`);
await page.waitForSelector("#TBL-01");
await page.waitForTimeout(2500);
out.sim_default = await txt("#TBL-01 tbody tr:last-child");
await page.getByRole("button", { name: "옥내" }).click();
await page.waitForTimeout(600);
out.sim_indoor = { row: await txt("#TBL-01 tbody tr:last-child"), url: await page.evaluate(() => location.search), soc: await page.locator("#SLD-07").inputValue() };
await page.screenshot({ path: "screenshots/check/sim.png" });

await browser.close();
console.log(JSON.stringify(out, null, 1));
