// 라벨링 초안용: /label 화면을 넘기며 후보 건물의 항공영상 확대 이미지를 한 장씩 저장한다.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
const OUT = "screenshots/label_tiles";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 640 }, locale: "ko-KR" })).newPage();
await page.goto(`${BASE}/label`);
await page.waitForSelector("canvas");
await page.waitForTimeout(5000);
const map = page.locator("main > section").first();
const info = page.locator("main section:nth-of-type(2) .rounded-lg.bg-slate-100 p").first();
const index = [];
const total = Number((await info.innerText()).match(/\/ (\d+)/)[1]);
for (let i = 0; i < total; i++) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(700);
  const id = (await info.innerText()).match(/건물 (\d+)/)[1];
  await map.screenshot({ path: `${OUT}/${String(i + 1).padStart(3, "0")}_${id}.jpg`, type: "jpeg", quality: 82 });
  index.push({ n: i + 1, bld_id: Number(id) });
  await page.keyboard.press("ArrowRight");
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
await browser.close();
console.log("saved", index.length);
