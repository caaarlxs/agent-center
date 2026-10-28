// How full a session's context is: the share, its tone (amber from 65%, red
// from 85%) and the tokens written short ("173k").
export type Tone = "ok" | "ask" | "bad"

export function usageOf(usage: { context: number; window: number }): { pct: number; tone: Tone; tokens: string; window: string } {
  const pct = Math.min(100, Math.round((usage.context / usage.window) * 100))
  const short = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
  return { pct, tone: pct >= 85 ? "bad" : pct >= 65 ? "ask" : "ok", tokens: short(usage.context), window: short(usage.window) }
}
