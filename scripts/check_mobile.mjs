// 모바일 첫 화면 확인용: 지도가 얼마나 보이는지 캡처한다. 실행: node scripts/check_mobile.mjs [주소]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
mkdirSync("screenshots/check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = {};
for (const [name, width, height] of [["m390", 390, 844], ["m360", 360, 640]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  await ctx.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector("#CRD-00");
  await page.waitForTimeout(6000);
  const box = async (sel) => (await page.locator(sel).first().boundingBox()) ?? null;
  const header = await box("header"), panel = await box("#LGD-01"), strip = await box("#CRD-00");
  const top = Math.round((panel?.y ?? 0) + (panel?.height ?? 0)), bottom = Math.round(strip?.y ?? height);
  out[name] = { header_h: Math.round(header?.height ?? 0), free_map_px: bottom - top, free_ratio: Math.round(((bottom - top) / height) * 100) + "%", overflow_x: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
  await page.screenshot({ path: `screenshots/check/${name}_closed.png` });
  await page.locator("#CRD-00 button[aria-expanded]").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/check/${name}_open.png` });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
