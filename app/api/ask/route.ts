// 질의응답: 다셀 계산 결과만 근거로 gpt-4.1이 답한다. 근거에 없는 숫자·금지 표현이 나오면 1회 다시 쓰게 하고, 그래도 안 되면 답하지 않는다.
// 질문 300자, IP당 분당 30회·전체 분당 120회, 요청당 8초. 예시 질문은 사전 계산 답변, 같은 질문은 24시간 캐시. 로그에는 질문만 남긴다(키·응답 원문 저장 안 함).
import { NextResponse, type NextRequest } from "next/server";
import { ASK_MAX_CHARS, ASK_SYSTEM, buildContext, checkAnswer, listAnswer, type AskData } from "@/lib/ask";
import type { Building } from "@/lib/data";
import { clientIp, LIMIT_MSG, makeCache, makeLimiter } from "@/lib/guard";
import pre from "@/data/ai_precomputed.json";

type Ans = { answer: string; verified: boolean; source?: string };
const TIMEOUT_MS = 8_000;
const limited = makeLimiter();
const memo = makeCache<Ans>();
const PRE = pre.ask as Record<string, Ans>;
const PRE_PRICE = 189.7;
const FAIL = "지금은 답변을 만들 수 없음 · 왼쪽 예시 질문은 즉시 답변 가능";
let cache: Promise<[AskData, Record<string, string>, Record<string, Building["extra"]>]> | null = null;

function load(origin: string) {
  const get = (p: string) => fetch(`${origin}${p}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(p))));
  cache ??= Promise.all([get("/data/buildings.json"), get("/data/labels.json").then((j) => j.labels).catch(() => ({})), get("/data/extra.json").then((j) => j.extra).catch(() => ({}))]);
  return cache.catch((e) => {
    cache = null;
    throw e;
  });
}

async function chat(messages: { role: string; content: string }[], key: string, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1", temperature: 0, max_completion_tokens: 600, messages }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  return ((await res.json()).choices?.[0]?.message?.content ?? "").trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const q = typeof body?.question === "string" ? body.question.trim() : "";
  const unitCost = Number(body?.unitCost) >= 100 && Number(body?.unitCost) <= 300 ? Number(body.unitCost) : 189.7;
  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-6)
    .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 800) }));
  if (!q || q.length > ASK_MAX_CHARS) return NextResponse.json({ error: `1~${ASK_MAX_CHARS}자로 입력해 주세요` }, { status: 400 });
  const fresh = process.env.DASEL_PRECOMPUTE === "1";
  const plain = history.length === 0;
  if (!fresh && plain && unitCost === PRE_PRICE && PRE[q]?.verified) return NextResponse.json({ ...PRE[q], source: `${PRE[q].source} · 사전 계산 답변` });
  const mkey = `${unitCost}|${q}`;
  const hit = !fresh && plain ? memo.get(mkey) : undefined;
  if (hit) return NextResponse.json({ ...hit, source: `${hit.source} · 캐시 답변` });
  if (limited(clientIp(req.headers))) return NextResponse.json({ error: LIMIT_MSG, limited: true });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: FAIL, fallback: true });
  console.log("[ask]", q);
  try {
    const [data, labels, extra] = await load(req.nextUrl.origin);
    const direct = listAnswer(data, labels, extra, unitCost, q);
    if (direct) return NextResponse.json({ answer: direct, verified: true, source: `${data.meta.source} ${data.meta.base_date} · 다셀 계산 결과 목록(모델 미사용) · 단가 ${unitCost}원/kWh` } satisfies Ans);
    const context = buildContext(data, labels, extra, unitCost, q);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const messages = [{ role: "system", content: `${ASK_SYSTEM}\n\n${context}` }, ...history, { role: "user", content: q }];
    let answer = await chat(messages, key, signal);
    let problems = checkAnswer(answer, context);
    if (problems.length) {
      answer = await chat([...messages, { role: "assistant", content: answer }, { role: "user", content: `다시 써라. 문제: ${problems.join(" / ")}. [자료]에 적힌 숫자만 그대로 쓴다.` }], key, signal);
      problems = checkAnswer(answer, context);
    }
    if (problems.length) return NextResponse.json({ answer: "다셀 자료로 검증된 답을 만들지 못함 · 질문을 더 구체적으로(회사명, 산단, 단계) 다시 입력해 주세요", verified: false });
    const ok: Ans = { answer, verified: true, source: `${data.meta.source} ${data.meta.base_date} · ${data.meta.factory_source ?? ""} · 단가 ${unitCost}원/kWh` };
    if (plain) memo.set(mkey, ok);
    return NextResponse.json(ok);
  } catch {
    return NextResponse.json({ error: FAIL, fallback: true });
  }
}
