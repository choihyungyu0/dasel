// 질의응답 3건 확인: node scripts/check_ask3.mjs [주소]
const BASE = process.argv[2] ?? "http://localhost:3000";
for (const question of ["유한양행 건물이 설치 우선인 이유는?", "용량 큰 30동은 전체의 몇 %?", "오창2 검토 건물 5곳"]) {
  const r = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, unitCost: 189.7 }) });
  const j = await r.json();
  console.log(`\n### ${r.status} verified=${j.verified} | ${question}\n${j.answer ?? j.error}`);
}
