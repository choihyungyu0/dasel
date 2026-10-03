// 빈칸 보완 2~6단계 화면 확인용(배포 주소).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
mkdirSync("screenshots/check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
await ctx.addInitScript(() => { try { for (const k of ["dasel_tour_v1", "dasel_tour_sim_v1", "dasel_tour_list_v1"]) localStorage.setItem(k, "done"); } catch {} });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
const txt = (sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, " ").trim()).catch(() => null);
const out = {};

await page.goto(`${BASE}/?b=121902`);
await page.waitForSelector("#WF2");
await page.waitForTimeout(4000);
out.pay = await txt("#TBL-PAY");
await page.locator("#SUB-01 input").check();
out.sub = await txt("#SUB-01");
out.chips = await txt("#BDG-01");
out.tier = await txt("#CRD-05");
out.legend = (await page.locator("body").innerText()).match(/이미 설치됨[^\n]*/g);
await page.screenshot({ path: "screenshots/check/fill_panel.png" });

await page.goto(`${BASE}/sim`);
await page.waitForSelector("#TBL-01");
const before = await txt("#TBL-01 tbody tr:last-child");
await page.locator("#SUB-02 input").check();
out.sim = { before, after: await txt("#TBL-01 tbody tr:last-child") };

await page.goto(`${BASE}/label`);
await page.waitForTimeout(5000);
out.label = await txt("header p");

await page.goto(`${BASE}/list`);
await page.waitForSelector("#TBL-02");
out.list_tiers = await page.locator("#TBL-02 tbody tr").allInnerTexts().then((a) => a.filter((t) => t.includes("이미 설치됨")).length + " / " + a.length);

await page.goto(`${BASE}/method`);
const body = await page.locator("body").innerText();
out.method = ["검수 전", "Mann-Whitney", "제2026-92호", "525,000", "15124189"].map((k) => [k, body.includes(k)]);
out.banned = ["안전 보장", "설치 가능 확정", "화재 위험 없음", "AI가 판단"].filter((k) => body.includes(k));
out.errs = errs;
await browser.close();
console.log(JSON.stringify(out, null, 1));
