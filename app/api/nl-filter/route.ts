// 말로 찾기: 문장을 필터 조건으로만 바꾼다(OpenAI, 서버 전용 키). 점수·순위 계산에는 쓰지 않는다.
// 입력 200자, IP당 분당 30회·전체 분당 120회, 요청당 8초. 예시 문장은 사전 계산 결과, 같은 문장은 24시간 캐시. 로그에는 입력 문장만 남긴다(키·응답 원문 저장 안 함).
import { NextResponse, type NextRequest } from "next/server";
import { callOpenAI, NL_MAX_CHARS, type NlResult } from "@/lib/nl";

import { clientIp, LIMIT_MSG, makeCache, makeLimiter } from "@/lib/guard";
import pre from "@/data/ai_precomputed.json";

const TIMEOUT_MS = 8_000;
const limited = makeLimiter();
const cache = makeCache<NlResult>();
const PRE = pre.nl as Record<string, NlResult>;
const FAIL = "AI 변환을 지금 쓸 수 없음 · 예시 조건으로 직접 거르기(필터 버튼) 가능";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > NL_MAX_CHARS) return NextResponse.json({ error: `1~${NL_MAX_CHARS}자로 입력해 주세요` }, { status: 400 });
  const fresh = process.env.DASEL_PRECOMPUTE === "1";
  if (!fresh && PRE[text]) return NextResponse.json({ ...PRE[text], cached: "사전 계산" });
  const hit = fresh ? undefined : cache.get(text);
  if (hit) return NextResponse.json({ ...hit, cached: "캐시" });
  if (limited(clientIp(req.headers))) return NextResponse.json({ error: LIMIT_MSG, limited: true });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: FAIL, fallback: true });
  console.log("[nl-filter]", text);
  try {
    const r = await callOpenAI(text, key, process.env.OPENAI_MODEL || "gpt-4.1", AbortSignal.timeout(TIMEOUT_MS));
    cache.set(text, r);
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: FAIL, fallback: true });
  }
}
