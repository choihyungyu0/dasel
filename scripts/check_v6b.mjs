// v6 마무리 확인: 질의응답 3건(회사 여러 동·목록 개수) + 말로 찾기 3회 반복. node scripts/check_v6b.mjs [주소]
const BASE = process.argv[2] ?? "http://localhost:3000";
const post = (p, body) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => [r.status, await r.json()]);
for (const question of ["유한양행 건물이 설치 우선인 이유는?", "미래나노텍 건물 점수는?", "오창2 검토 건물 5곳"]) {
  const [s, j] = await post("/api/ask", { question, unitCost: 189.7 });
  console.log(`\n### ${s} verified=${j.verified} | ${question}\n${j.answer ?? j.error}`);
}
console.log("\n### 말로 찾기 3회: 상위 30동 설치 우선");
for (let i = 0; i < 3; i++) {
  const [s, j] = await post("/api/nl-filter", { text: "상위 30동 설치 우선" });
  const f = j.filters ?? {};
  const on = Object.fromEntries(Object.entries(f).filter(([, v]) => !(v === 0 || v === null || (Array.isArray(v) && !v.length))));
  console.log(s, JSON.stringify({ complex: j.complex, ...on, ignored: j.ignored }));
}
