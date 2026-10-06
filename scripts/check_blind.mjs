// /label?blind=1 확인용: 20동만 보이고 AI 판독·점수가 숨겨지는지 본다.
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ko-KR" })).newPage();
const out = {};
for (const [k, path] of [["blind", "/label?blind=1"], ["normal", "/label"]]) {
  await page.goto(BASE + path);
  await page.waitForTimeout(7000);
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  out[k] = { head: t.match(/(눈가림|검수) 표본 \d+동/)?.[0] ?? null, counter: t.match(/\d+ \/ \d+ · 건물/)?.[0] ?? null, shows_ai: /AI 판독: /.test(t), shows_score: /\/90/.test(t) };
}
await browser.close();
console.log(JSON.stringify(out));
