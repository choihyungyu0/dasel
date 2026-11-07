// 질의응답 화면 캡처: node scripts/check_ask_ui.mjs [주소]
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch({ channel: "chrome" });
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: "ko-KR" });
const p = await c.newPage();
await p.goto(`${BASE}/ask`);
await p.waitForSelector("#INP-ASK");
await p.waitForTimeout(1500);
await p.locator("aside button", { hasText: "유한양행" }).click();
await p.waitForFunction(() => document.querySelectorAll("#ASK-THREAD .whitespace-pre-wrap").length >= 2, null, { timeout: 40000 });
await p.fill("#INP-ASK", "오창 산단 전체에 추가로 설치할 수 있는 태양광 용량은?");
await p.click("#BTN-ASK");
await p.waitForFunction(() => document.querySelectorAll("#ASK-THREAD .whitespace-pre-wrap").length >= 4, null, { timeout: 40000 });
await p.waitForTimeout(800);
await p.screenshot({ path: "screenshots/poster/pc_13_ask.png" });
console.log(await p.locator("#ASK-THREAD").innerText());
await b.close();
