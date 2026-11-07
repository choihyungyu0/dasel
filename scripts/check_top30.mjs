// 용량 큰 30동 시나리오 확인·캡처: node scripts/check_top30.mjs [주소]
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: "ko-KR" });
await c.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); } catch {} });
const p = await c.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await p.goto(BASE);
await p.waitForSelector("#BTN-TOP30");
await p.waitForTimeout(6000);
await p.click("#BTN-TOP30");
const mid = [];
for (const t of [1500, 3700]) { await p.waitForTimeout(t === 1500 ? 1500 : 2200); mid.push((await p.locator("#CRD-00").innerText()).replace(/\s+/g, " ").slice(0, 160)); }
await p.waitForSelector("#BOX-TOP30", { timeout: 10000 });
await p.waitForTimeout(800);
await p.screenshot({ path: "screenshots/poster/pc_10_top30.png" });
const box = await p.locator("#BOX-TOP30").innerText();
const banner = (await p.locator("#CRD-00").innerText()).replace(/\s+/g, " ");
await p.click("#BTN-TOP30-LIST");
await p.waitForURL(/list/);
await p.waitForTimeout(2500);
const rows = await p.locator("tbody tr").count();
const kws = await p.locator("tbody tr td:nth-child(4)").allInnerTexts();
console.log(JSON.stringify({ mid, box, banner: banner.slice(0, 400), rows, kws: kws.slice(0, 5).concat("…", kws.slice(-2)), url: p.url(), errs }, null, 1));
await b.close();
