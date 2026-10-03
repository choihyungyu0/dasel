// AI-02: 건물 ID와 단가만 받아 서버에서 사실표를 다시 계산한 뒤 의견서를 만든다.
// 생성문은 숫자·금지어·분량 검사를 통과해야 하며, 실패하면 1회 재생성 후 기본 양식으로 대체한다.
import { NextResponse, type NextRequest } from "next/server";
import { enrich, type RawBuilding } from "@/lib/data";
import { complete, llmConfigured } from "@/lib/llm";
import { buildFacts, SYSTEM_PROMPT, templateOpinion, verify, withSources, type Facts } from "@/lib/opinion";

const TIMEOUT_MS = 10_000;

interface Data {
  meta: { source: string; base_date: string; built: string; factory_source?: string; register_source?: string };
  buildings: RawBuilding[];
}

let cache: Promise<Data> | null = null;
function load(origin: string): Promise<Data> {
  cache ??= fetch(`${origin}/data/buildings.json`).then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error("data"))));
  return cache.catch((e) => {
    cache = null;
    throw e;
  });
}

const reply = (facts: Facts, text: string, source: "llm" | "template") =>
  NextResponse.json({ facts, text, source, verified: source === "llm", createdAt: new Date().toISOString() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = Number(body?.bld_id);
  const unitCost = Number(body?.unitCost);
  const month = String(body?.month ?? "").slice(0, 7);
  if (!Number.isInteger(id) || !(unitCost >= 100 && unitCost <= 300) || !/^\d{4}\.\d{2}$/.test(month)) {
    return NextResponse.json({ error: "요청 값을 확인해 주세요" }, { status: 400 });
  }

  const data = await load(req.nextUrl.origin).catch(() => null);
  const raw = data?.buildings.find((b) => b.bld_id === id);
  if (!data || !raw) return NextResponse.json({ error: "건물을 찾지 못했어요" }, { status: 404 });

  const b = enrich(raw, data.meta.built.replaceAll("-", ""), unitCost);
  const sources = [
    `${data.meta.source} ${data.meta.base_date}`,
    b.reg_match ? data.meta.register_source : null,
    b.companies.length ? data.meta.factory_source : null,
    "한국전력공사 전력데이터 개방포털",
    "Global Solar Atlas",
  ].filter((x): x is string => Boolean(x));
  const facts = buildFacts(b, { unitCost, month, fallback: body?.fallback === true }, sources);
  if (!facts) return NextResponse.json({ error: "계산 결과가 없는 건물이에요" }, { status: 422 });

  if (!llmConfigured()) return reply(facts, templateOpinion(facts), "template");
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const user = JSON.stringify(facts);
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = withSources(await complete(SYSTEM_PROMPT, user, signal), facts);
      if (verify(text, facts).ok) return reply(facts, text, "llm");
    }
  } catch {
    // 시간 초과·호출 실패는 기본 양식으로 대체한다
  }
  return reply(facts, templateOpinion(facts), "template");
}
