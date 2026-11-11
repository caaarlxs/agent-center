// Where the tokens go, as the page shows it (lib/spend.ts): what makes a
// conversation costly, and tokens and money short. Pure: tested on its own.

// Past this, every step of a conversation re-reads more than it is worth:
// a new one that picks up the work costs a fraction.
export const EXPENSIVE_CONTEXT = 400_000
export const isExpensive = (context: number) => context >= EXPENSIVE_CONTEXT

export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
export const money = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : usd >= 10 ? `$${usd.toFixed(1)}` : `$${usd.toFixed(2)}`)
