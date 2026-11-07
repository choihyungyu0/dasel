// 말로 찾기: 문장을 필터 조건으로만 바꾼다(OpenAI, 서버 전용 키). 점수·순위 계산에는 쓰지 않는다.
// 입력 200자, IP당 분당 10회, 요청당 8초. 로그에는 입력 문장만 남긴다(키·응답 원문 저장 안 함).
import { NextResponse, type NextRequest } from "next/server";
import { callOpenAI, NL_MAX_CHARS } from "@/lib/nl";

const TIMEOUT_MS = 8_000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > NL_MAX_CHARS) return NextResponse.json({ error: `1~${NL_MAX_CHARS}자로 입력해 주세요` }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "잠시 뒤 다시 입력해 주세요(분당 10회)" }, { status: 429 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "다시 입력해 주세요" }, { status: 503 });
  console.log("[nl-filter]", text);
  try {
    const r = await callOpenAI(text, key, process.env.OPENAI_MODEL || "gpt-4.1", AbortSignal.timeout(TIMEOUT_MS));
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "다시 입력해 주세요" }, { status: 502 });
  }
}
