// 여러 화면 크기에서 첫 화면(항공영상 지도)이 얼마나 보이는지, 가로 넘침이 없는지 확인한다.
// 실행: node scripts/check_mobile.mjs [주소]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
const SIZES = [
  ["se1_320x568", 320, 568], ["a_360x640", 360, 640], ["se3_375x667", 375, 667], ["i14_390x844", 390, 844],
  ["pixel_412x915", 412, 915], ["promax_430x932", 430, 932], ["fold_344x882", 344, 882], ["land_844x390", 844, 390], ["ipad_768x1024", 768, 1024],
];
mkdirSync("screenshots/check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = {};
for (const [name, width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 768, hasTouch: true, locale: "ko-KR" });
  await ctx.addInitScript(() => { try { for (const k of ["dasel_tour_v1", "dasel_tour_sim_v1", "dasel_tour_list_v1"]) localStorage.setItem(k, "done"); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE);
  await page.waitForSelector("#CRD-00");
  await page.waitForTimeout(5000);
  const box = async (sel) => (await page.locator(sel).first().boundingBox()) ?? null;
  const panel = await box("#LGD-01"), strip = await box("#CRD-00"), header = await box("header");
  const top = Math.round((panel?.y ?? 0) + (panel?.height ?? 0)), bottom = Math.round(strip?.y ?? height);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const r = { map_free: `${bottom - top}px (${Math.round(((bottom - top) / height) * 100)}%)`, header_h: Math.round(header?.height ?? 0), overflow_x: await overflow() };
  await page.screenshot({ path: `screenshots/check/${name}_1_map.png` });
  // 건물 정보창(모바일은 하단 시트)
  await page.goto(`${BASE}/?b=121902`);
  await page.waitForSelector("#WF2");
  await page.waitForTimeout(4000);
  const sheet = await box("#WF2");
  r.sheet = sheet ? `top ${Math.round(sheet.y)}px · 지도 ${Math.round((sheet.y / height) * 100)}% 보임` : null;
  r.sheet_overflow_x = await overflow();
  await page.screenshot({ path: `screenshots/check/${name}_2_panel.png` });
  for (const path of ["/list", "/sim", "/method"]) {
    await page.goto(BASE + path);
    await page.waitForTimeout(2500);
    r[`overflow${path}`] = await overflow();
  }
  r.errs = errs;
  out[name] = r;
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
