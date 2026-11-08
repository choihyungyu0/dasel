// 예시 질문 5개·말로 찾기 예시 3개를 미리 계산해 data/ai_precomputed.json에 저장(빌드 전에 실행, 결과는 커밋).
// 로컬 서버를 DASEL_PRECOMPUTE=1로 띄운 뒤 실행: node scripts/precompute_ai.mjs [http://localhost:3100]
// 질의응답은 서버의 숫자 검사를 통과한 답(verified)만 저장. 단가 189.7원 고정 기준.
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
const src = readFileSync("lib/ask.ts", "utf8");
const ASK = JSON.parse(src.match(/ASK_EXAMPLES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
const NL = JSON.parse(readFileSync("lib/nl.ts", "utf8").match(/NL_EXAMPLES = (\[.*?\]);/)[1]);
const out = { generated: new Date().toISOString(), nl: {}, ask: {} };
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

for (const text of NL) {
  const j = await post("/api/nl-filter", { text });
  if (j.filters) out.nl[text] = { complex: j.complex, filters: j.filters, sort: j.sort, ignored: j.ignored };
  console.log("nl", text, j.filters ? "저장" : `실패 ${j.error}`);
}
for (const q of ASK) {
  let j;
  for (let k = 0; k < 2 && !j?.verified; k++) j = await post("/api/ask", { question: q, unitCost: 189.7, history: [] });
  if (j?.verified && j.answer) out.ask[q] = { answer: j.answer, verified: true, source: j.source };
  console.log("ask", q, j?.verified ? "저장" : `실패 ${j?.error ?? j?.answer}`);
}
writeFileSync("data/ai_precomputed.json", JSON.stringify(out, null, 1));
