// P0 확인·3D 캡처(배포 주소). 실행: node scripts/check_3d.mjs [주소]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
mkdirSync("screenshots/poster", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: "ko-KR" });
await ctx.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); } catch {} });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
const out = {};
await page.goto(BASE);
await page.waitForSelector("#BTN-3D");
await page.waitForTimeout(7000);
out.btn = await page.locator("#BTN-3D").innerText();
out.view = await page.evaluate(() => localStorage.getItem("dasel_view"));
await page.screenshot({ path: "screenshots/poster/pc_6_3d_overview.png" });
// 오창과학 산단만 당긴 3D 컷(포트폴리오용)
await page.locator("#SEG-02 button", { hasText: "오창과학" }).click();
await page.waitForTimeout(5000);
// 산단이 화면을 채우도록 한 단계 더 당긴다(합계 띠·메뉴는 그대로)
await page.mouse.move(820, 470);
await page.mouse.wheel(0, -420);
await page.waitForTimeout(4000);
await page.screenshot({ path: "screenshots/poster/pc_8_3d_ochang.png" });
await page.locator("#SEG-02 button", { hasText: "전체" }).click();
await page.waitForTimeout(1500);
out.packs_title = await page.locator("#CRD-00 [title*='설치 우선']").first().getAttribute("title").catch(() => null);
out.banner = (await page.locator("#CRD-00").innerText()).replace(/\s+/g, " ").slice(0, 400);
// 유한양행 선택(검색과 같은 이동)
await page.goto(`${BASE}/?b=121902`);
await page.waitForSelector("#WF2");
await page.waitForTimeout(7000);
out.sel_opacity = await page.evaluate(() => null);
await page.screenshot({ path: "screenshots/poster/pc_7_3d_selected.png" });
// 지도 클릭으로 다른 건물 선택이 되는지(3D 레이어)
await page.locator("#WF2 button[aria-label*='닫']").first().click().catch(() => {});
await page.waitForTimeout(2500);
out.after_close_panel = await page.locator("#WF2").count();
// 2D 전환
await page.locator("#BTN-3D").click();
await page.waitForTimeout(1500);
out.after_toggle = { btn: await page.locator("#BTN-3D").innerText(), view: await page.evaluate(() => localStorage.getItem("dasel_view")) };
await page.locator("#BTN-3D").click();
// 후보 목록
await page.goto(`${BASE}/list`);
await page.waitForSelector("#TBL-02");
out.list_mini_tour = await page.locator(".driver-popover").count();
const rows = await page.locator("#TBL-02 tbody tr").allInnerTexts();
out.list_first = rows.slice(0, 12).map((t) => t.split("\t").slice(0, 2).join(" ").replace(/\s+/g, " ").slice(0, 30));
out.list_installed_tail = rows.slice(-3).map((t) => t.split("\t")[0]);
await page.goto(`${BASE}/sim`);
await page.waitForSelector("#TBL-01");
await page.waitForTimeout(1500);
out.sim_mini_tour = await page.locator(".driver-popover").count();
out.sim_total = (await page.locator("#TBL-01 tbody tr:last-child").innerText()).replace(/\s+/g, " ");
await page.goto(`${BASE}/method`);
const body = await page.locator("body").innerText();
out.method_s20 = body.match(/사람 표본 20동[^\n]{0,60}/)?.[0];
out.dash = (body.match(/—/g) ?? []).length;
out.errs = errs;
await browser.close();
console.log(JSON.stringify(out, null, 1));
