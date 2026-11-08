// 상태 점검: OpenAI 연결(models 조회, 5분 캐시)·사전 계산 답변 수·배포 커밋. 키·내부 정보는 내보내지 않는다.
import { NextResponse } from "next/server";
import pre from "@/data/ai_precomputed.json";

let last: { at: number; ok: boolean } | null = null;

async function openaiOk(): Promise<boolean> {
  if (last && Date.now() - last.at < 5 * 60_000) return last.ok;
  const key = process.env.OPENAI_API_KEY;
  let ok = false;
  if (key) {
    try {
      const r = await fetch(`https://api.openai.com/v1/models/${process.env.OPENAI_MODEL || "gpt-4.1"}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
      ok = r.ok;
    } catch {
      ok = false;
    }
  }
  last = { at: Date.now(), ok };
  return ok;
}

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    openai: (await openaiOk()) ? "ok" : "error",
    cache: Object.keys(pre.nl).length + Object.keys(pre.ask).length,
    build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  });
}
