// Whether Jira is set up (lib/jira.ts): read once, again after a change.
import { get } from "@/lib/api"
import type { Card, JiraSetup, LinkWhy, Ticket } from "@/lib/api-types"
import { createStore } from "@/lib/store"
import { openDialog } from "@/app/open-dialog"

export const jiraSetup = createStore<JiraSetup | null | undefined>(undefined)
export const loadJira = () => get<{ setup: JiraSetup | null }>("/api/jira").then(r => jiraSetup.set(r.setup), () => jiraSetup.set(null))

type Named = { key: string; summary: string; url: string }

// A new session about a ticket: its key, summary, address and description.
export const promptFor = (t: Named, description = "") =>
  [`${t.key}: ${t.summary}`, t.url, description.trim() && `Description:\n${description.trim()}`].filter(Boolean).join("\n\n")

// About several tickets: each as one alone, one after the other.
export const promptForAll = (tickets: { ticket: Named; description?: string }[]) =>
  tickets.length === 1
    ? promptFor(tickets[0]!.ticket, tickets[0]!.description)
    : `Work on these Jira tickets together:\n\n${tickets.map(t => promptFor(t.ticket, t.description)).join("\n\n---\n\n")}`

// Why a session is linked to a ticket, in words.
export const WHY: Record<LinkWhy, string> = { started: "started from it", linked: "linked by you", branch: "in its branch or title", named: "you named it" }

// The sessions linked to a ticket.
export const sessionsOf = (cards: Card[], key: string) => cards.filter(c => c.tickets?.some(t => t.key === key))

// The name of a worktree (and its branch) for some tickets: the first one's
// key and a few words of its summary, plain ("PP-3050-dato-del-registro").
export function branchFor(tickets: Named[]): string {
  const first = tickets[0]
  if (!first) return ""
  const words = first.summary.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\[[^\]]*\]/g, " ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  let name = first.key
  for (const w of words) {
    if (name.length + w.length + 1 > 48) break
    name += `-${w}`
  }
  return name
}

// A new session about some tickets: their descriptions too, and the
// repository their sessions use, in a worktree on a branch named for them;
// the session remembers it started from them.
export async function startFrom(tickets: Named[], cards: Card[]) {
  const whole = await Promise.all(tickets.map(t => get<Ticket>(`/api/jira/ticket?key=${t.key}`).catch(() => null)))
  const root = tickets.flatMap(t => sessionsOf(cards, t.key)).find(c => c.repoRoot)?.repoRoot ?? null
  const prompt = promptForAll(tickets.map((ticket, i) => ({ ticket, description: whole[i]?.description })))
  openDialog({ kind: "new", draft: { root, prompt, worktree: true, worktreeName: branchFor(tickets), tickets: tickets.map(t => t.key) } })
}
