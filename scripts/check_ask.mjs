// 질의응답 확인: node scripts/check_ask.mjs [주소]
const BASE = process.argv[2] ?? "http://localhost:3000";
const Q = ["오창 산단 전체에 추가로 설치할 수 있는 태양광 용량은?", "설치 우선 단계 건물 중 연 절감액이 가장 큰 곳은?", "유한양행 건물이 설치 우선인 이유는?", "오창2 산단에서 검토할 만한 건물 5곳", "이 근처 아파트 시세는?"];
for (const question of Q) {
  const t = Date.now();
  const r = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, unitCost: 189.7 }) });
  const j = await r.json();
  console.log(`\n### ${r.status} ${Date.now() - t}ms verified=${j.verified} | ${question}\n${j.answer ?? j.error}`);
}
