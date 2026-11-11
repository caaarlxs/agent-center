// Where the tokens go, as the page shows it (lib/spend.ts): what makes a
// conversation costly, tokens and money short, and how a fresh start picks
// up the work of a long one. Pure: tested on its own.

// Past this, every step of a conversation re-reads more than it is worth:
// a new one that picks up the work costs a fraction.
export const EXPENSIVE_CONTEXT = 400_000
export const isExpensive = (context: number) => context >= EXPENSIVE_CONTEXT

export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
export const money = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : usd >= 10 ? `$${usd.toFixed(1)}` : `$${usd.toFixed(2)}`)

/** The first message of a session that picks up a long one's work, reading only what it needs. */
export const freshStart = (s: { id: string; title: string }) =>
  `Pick up the work of the session “${s.title}”, which grew too long to go on. Its conversation is in ~/.claude/projects, in the file ${s.id}.jsonl: read only its last part (the last messages are enough) to see where it stands, tell me in a few lines, and wait for what to do next.`
