// What a ticket's stages show besides what their runs left: what GitHub says
// of each PR now (merged, open, a draft, with conflicts), and the test data a
// test in staging made (scenario.json), in a few lines.

export type PrState = { state: "OPEN" | "MERGED" | "CLOSED"; isDraft: boolean; isConflicting: boolean }
type Sh = (cmd: string[], options?: { timeoutMs?: number }) => Promise<{ ok: boolean; out: string }>

const STATES = ["OPEN", "MERGED", "CLOSED"]
export function prStateOf(raw: unknown): PrState | null {
  const pr = raw as { state?: string; isDraft?: boolean; mergeable?: string; mergeStateStatus?: string } | null
  if (!pr || !STATES.includes(pr.state ?? "")) return null
  return { state: pr.state as PrState["state"], isDraft: !!pr.isDraft, isConflicting: pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY" }
}

// Read at most every two minutes a PR; a merged or closed one, once.
const OPEN_MS = 120_000
const read = new Map<string, { at: number; value: PrState | null }>()
export async function prStates(urls: string[], sh: Sh, now = Date.now()): Promise<Record<string, PrState>> {
  const out: Record<string, PrState> = {}
  await Promise.all([...new Set(urls)].map(async url => {
    const was = read.get(url)
    const isFresh = was && (now - was.at < OPEN_MS || (was.value && was.value.state !== "OPEN"))
    const value = isFresh ? was.value : await sh(["gh", "pr", "view", url, "--json", "state,isDraft,mergeable,mergeStateStatus"], { timeoutMs: 20_000 })
      .then(r => (r.ok ? prStateOf(JSON.parse(r.out)) : null), () => null)
    if (!isFresh) read.set(url, { at: now, value })
    if (value) out[url] = value
  }))
  return out
}

// The test data of a test in staging: the accounts it used and what it made, each by its name.
export type Scenario = { accounts: string[]; pieces: { id: string; model: string; name: string | null }[] }
export function scenarioOf(raw: unknown): Scenario | null {
  const data = raw as { accounts?: Record<string, string[]>; pieces?: { id?: string; model?: string; vars?: { name?: string } }[] } | null
  if (!data || (!data.accounts && !data.pieces)) return null
  const accounts = Object.entries(data.accounts ?? {}).map(([who, traits]) => (traits.length ? `${who}: ${traits.join(", ")}` : who))
  const pieces = (data.pieces ?? []).filter(p => p.id).map(p => ({ id: p.id!, model: p.model ?? "", name: p.vars?.name ?? null }))
  return { accounts, pieces }
}
