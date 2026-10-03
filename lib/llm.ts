// LLM 호출은 이 파일 한 곳에서만 한다(서버 전용). LLM_PROVIDER·LLM_MODEL로 공급자를 바꾼다.
type Provider = "openai" | "anthropic";

const DEFAULT_MODEL: Record<Provider, string> = { openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001" };

export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

export async function complete(system: string, user: string, signal: AbortSignal): Promise<string> {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY 없음");
  const provider: Provider = process.env.LLM_PROVIDER === "openai" ? "openai" : "anthropic";
  const model = process.env.LLM_MODEL || DEFAULT_MODEL[provider];

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, max_completion_tokens: 900, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    return ((await res.json()).choices?.[0]?.message?.content ?? "").trim();
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 900, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const blocks: { type: string; text?: string }[] = (await res.json()).content ?? [];
  return blocks.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}
