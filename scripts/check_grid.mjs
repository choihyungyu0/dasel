// 1단계(배전 여유) 화면 확인용(배포 주소).
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

await page.goto(`${BASE}/?b=121902`);
await page.waitForSelector("#WF2");
await page.waitForTimeout(4000);
const out = { grid: await txt("#GRD-01"), score: await txt("#CRD-04"), legend: (await page.locator("body").innerText()).match(/[^\n]*점 만점[^\n]*/)?.[0] ?? null };
await page.screenshot({ path: "screenshots/check/grid.png" });
await page.goto(`${BASE}/method`);
out.method = (await page.locator("body").innerText()).match(/[^\n]*배전 여유[^\n]{0,120}/g)?.slice(0, 3);
out.errs = errs;
await browser.close();
console.log(JSON.stringify(out, null, 1));
