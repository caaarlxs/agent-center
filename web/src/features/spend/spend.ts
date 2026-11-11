// Where the tokens go, as the page shows it (lib/spend.ts): what makes a
// conversation costly, and tokens and money short. Pure: tested on its own.

// Past this, every step of a conversation re-reads more than it is worth:
// a new one that picks up the work costs a fraction.
export const EXPENSIVE_CONTEXT = 400_000
export const isExpensive = (context: number) => context >= EXPENSIVE_CONTEXT

// An hour idle, the cache has expired: the next step writes the whole context
// to it again, many times what a step re-reads. Worth a word from a smaller size.
export const COLD_AFTER_MS = 3600_000
export const COLD_CONTEXT = 200_000

/** Why a conversation is costly now: cold (its next step writes the cache again), each step re-reads a lot, or neither. */
export function costlyNow(context: number, lastAt: number, now: number): "cold" | "steps" | null {
  if (context >= COLD_CONTEXT && lastAt > 0 && now - lastAt >= COLD_AFTER_MS) return "cold"
  return isExpensive(context) ? "steps" : null
}

// Hidden with ×: the step note until the conversation grows this much more;
// the cold note until it goes cold again (a newer last step).
export const AGAIN_AFTER = 150_000
type Seen = { context: number; modelAt: number }
/** The key the note is hidden under, and what it keeps: the context, or the last step. */
export const hideKey = (why: "cold" | "steps", id: string) => (why === "cold" ? `cold:${id}` : id)
export const hideValue = (why: "cold" | "steps", u: Seen) => (why === "cold" ? u.modelAt : u.context)
export function isHidden(why: "cold" | "steps", at: number | undefined, u: Seen) {
  if (at === undefined) return false
  return why === "cold" ? at === u.modelAt : u.context < at + AGAIN_AFTER
}

export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
export const money = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : usd >= 10 ? `$${usd.toFixed(1)}` : `$${usd.toFixed(2)}`)
