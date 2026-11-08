// OpenAI 키 점검: 유효성(models 조회 1회)과 응답 시간(짧은 호출 3회). 키 문자열은 출력하지 않는다.
// 실행: node scripts/check_openai.mjs  (.env.local의 OPENAI_API_KEY 사용)
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const key = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
const model = env.OPENAI_MODEL || "gpt-4.1";
if (!key) { console.log("키 없음"); process.exit(1); }
const h = { authorization: `Bearer ${key}`, "content-type": "application/json" };

const m = await fetch(`https://api.openai.com/v1/models/${model}`, { headers: h });
console.log(`키 유효성: ${m.ok ? "정상" : `오류 ${m.status}`} (모델 ${model})`);
const ms = [];
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model, max_completion_tokens: 5, messages: [{ role: "user", content: "ok" }] }) });
  ms.push(Date.now() - t);
  if (!r.ok) console.log(`호출 ${i + 1}: 오류 ${r.status}`);
  const rl = ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-limit-tokens"].map((k) => `${k.replace("x-ratelimit-", "")}=${r.headers.get(k)}`);
  if (i === 0) console.log(`분당 한도: ${rl.join(", ")}`);
}
console.log(`응답 시간(ms): ${ms.join(", ")} · 평균 ${Math.round(ms.reduce((a, b) => a + b) / ms.length)}`);
