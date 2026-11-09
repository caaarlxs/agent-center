// Tickets a stage proposes (out of the ticket's scope, or asked for in an
// answer): the agent never creates them, you do, one by one. A new one is
// yours and is linked to a ticket of yours (never someone else's epic); a
// small piece of one of your tickets goes in it as a sub-task. One that only
// makes sense after an answer waits on that question. Each run says again what
// it proposes now: the pending ones of that stage go; what you created or
// dismissed stays, and the agent reads it so it does not propose it again.

export type NewKind = "story" | "task" | "bug" | "subtask"
export type Proposal = {
  id: string
  kind: NewKind
  summary: string
  description: string
  why: string // why it goes apart, for you
  linkTo: string | null // the ticket of yours it goes with, as the agent chose it
  question?: string | null // the question whose answer decides it: it waits while that is open
  stage?: string // the stage that proposed it: its next run says again what it proposes
  status: "proposed" | "created" | "dismissed"
  created?: string | null // its key in Jira, once created
}

const KINDS: NewKind[] = ["story", "task", "bug", "subtask"]
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const KEY = /^[A-Z][A-Z0-9]+-\d+$/

// What the agent left in "tickets", numbered by its run so the ids never repeat.
export function proposalsIn(raw: unknown, run: number, stage: string): Proposal[] {
  const list = Array.isArray(raw) ? raw : []
  return list.filter((t: any) => text(t?.summary)).map((t: any, i) => ({
    id: `R${run}-T${i + 1}`,
    kind: KINDS.includes(t.kind) ? t.kind : "task",
    summary: text(t.summary).slice(0, 250),
    description: text(t.description),
    why: text(t.why),
    linkTo: KEY.test(text(t.linkTo)) ? text(t.linkTo) : null,
    question: /^Q\d+$/.test(text(t.question)) ? text(t.question) : null,
    stage,
    status: "proposed",
  }))
}

// After a run of a stage: what you created or dismissed stays, and so do the pending ones of
// other stages; that stage's pending ones give way to what it proposes now, but never one
// with the title of a ticket you already decided.
const same = (a: string) => a.toLowerCase().replace(/\s+/g, " ")
export const isDecided = (p: Proposal) => p.status !== "proposed"
export function withProposals(before: Proposal[] = [], found: Proposal[], stage: string) {
  // One of before with no stage (older runs) counts as this stage's.
  const kept = before.filter(b => isDecided(b) || (b.stage ?? stage) !== stage)
  const decided = kept.filter(isDecided)
  return [...kept, ...found.filter(f => !decided.some(d => same(d.summary) === same(f.summary)))]
}

// It waits on a question still open: it cannot be created yet.
export const waitsOn = (p: Proposal, open: string[]) => !!p.question && open.includes(p.question)

// What the agent reads of what you decided (proposals.json), to not propose it again.
export const decidedForAgent = (all: Proposal[] = []) =>
  all.filter(isDecided).map(p => ({ summary: p.summary, kind: p.kind, status: p.status, key: p.created ?? null }))

// The tickets of yours a new one may go with: the ticket itself, unless it is not yours (a
// coordinator of yours only), and the children it coordinates.
export const ticketsOfYours = (state: { key: string; local?: boolean; children?: { key: string }[] }) =>
  [...(state.local ? [] : [state.key]), ...(state.children ?? []).map(c => c.key)]

// The one it goes with: the agent's choice when it is yours, else the first of yours.
export const anchorOf = (p: Proposal, yours: string[]) => (p.linkTo && yours.includes(p.linkTo) ? p.linkTo : (yours[0] ?? null))

// What the new ticket says in Jira: its description, and where it comes from.
export const newDescription = (p: Proposal, from: string) =>
  `${p.description}${p.why ? `\n\nPor qué va aparte: ${p.why}` : ""}\n\nPropuesto por el agente al trabajar en ${from}.`
