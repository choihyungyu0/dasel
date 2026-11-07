// 말로 찾기 실제 호출 10건(로컬 서버). 입력 문장과 변환 조건만 출력한다.
const BASE = process.argv[2] ?? "http://localhost:3000";
const S = ["오창과학 200kW 이상 내진설계 적용 공장", "복수 입주 아닌 설치 우선 건물", "법인 소유 500kW 이상", "1MW 넘는 철근콘크리트 공장", "오창2 검토 단계 중 게이트 통과", "최근 증축한 적 없는 다소비 업종", "100kW 이상 300kW 이하 국공유지", "ESS 500kWh 이상 내진 미적용", "오창5 최우선 공장", "유한양행 근처 맛집"];
for (const text of S) {
  const t = Date.now();
  const r = await fetch(`${BASE}/api/nl-filter`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  const j = await r.json();
  const f = j.filters ?? {};
  const on = Object.fromEntries(Object.entries(f).filter(([, v]) => !(v === 0 || v === null || (Array.isArray(v) && !v.length))));
  console.log(`${r.status} ${Date.now() - t}ms | ${text} → ${JSON.stringify({ complex: j.complex, ...on, ignored: j.ignored })}`);
}
