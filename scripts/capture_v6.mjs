// v6 캡처 5장을 배포본에서 한 번에(1600×900). 접속 횟수를 줄이려고 한 브라우저에서 차례로 찍는다.
// 실행: node scripts/capture_v6.mjs [주소]
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "https://dasel-weld.vercel.app";
const D = process.argv[3] ?? "screenshots/poster";
const b = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: "ko-KR" });
await c.addInitScript(() => { try { localStorage.setItem("dasel_tour_v1", "done"); } catch {} });
const p = await c.newPage();
const out = { errs: [] };
p.on("pageerror", (e) => out.errs.push(String(e).slice(0, 200)));
// 9·11: 유한양행 패널·AI 판독 근거
await p.goto(`${BASE}/?b=121902`);
await p.waitForSelector("#TXT-PANEL", { timeout: 60000 });
await p.waitForTimeout(7000);
out.panel = await p.locator("#TXT-PANEL").innerText();
  out.banner = (await p.locator("#CRD-00").innerText()).replace(/s+/g, " ");
await p.screenshot({ path: `${D}/pc_9_panels.png` });
await p.click("#TAB-AI-BTN");
await p.waitForSelector("#TAB-AI img, #TAB-AI");
await p.waitForTimeout(2500);
await p.screenshot({ path: `${D}/pc_11_evidence.png` });
// 10: 용량 큰 30동(같은 페이지에서 패널 닫고 시작)
await p.click("button[aria-label='패널 닫기']");
await p.waitForTimeout(2500);
await p.click("#BTN-TOP30");
await p.waitForSelector("#BOX-TOP30", { timeout: 15000 });
await p.waitForTimeout(1500);
out.box = await p.locator("#BOX-TOP30").innerText();
  out.legend = await p.locator("#LGD-LIT").innerText();
await p.screenshot({ path: `${D}/pc_10_top30.png` });
// 12: 목록에서 말로 찾기(화면 안 이동)
await p.click("#BTN-TOP30-RESET");
await p.click("header a[href='/list']");
await p.waitForSelector("#INP-NL");
await p.waitForTimeout(1500);
await p.fill("#INP-NL", "오창과학 200kW 이상 내진설계 적용 공장");
await p.click("#BTN-NL");
await p.waitForSelector("#NL-CHIPS", { timeout: 15000 });
await p.waitForTimeout(1200);
out.chips = await p.locator("#NL-CHIPS").innerText();
await p.screenshot({ path: `${D}/pc_12_nl_chips.png` });
// 13: 질의응답
await p.click("header a[href='/ask']");
await p.waitForSelector("#INP-ASK");
await p.click("aside button:has-text('유한양행')");
await p.waitForFunction(() => document.querySelectorAll("#ASK-THREAD .whitespace-pre-wrap").length >= 2, null, { timeout: 40000 });
await p.fill("#INP-ASK", "용량 큰 30동은 전체의 몇 %?");
await p.click("#BTN-ASK");
await p.waitForFunction(() => document.querySelectorAll("#ASK-THREAD .whitespace-pre-wrap").length >= 4, null, { timeout: 40000 });
await p.waitForTimeout(800);
out.ask = (await p.locator("#ASK-THREAD").innerText()).slice(0, 900);
await p.screenshot({ path: `${D}/pc_13_ask.png` });
console.log(JSON.stringify(out, null, 1));
await b.close();
