// The "Tickets" view (lib/jira.ts): your Jira tickets in columns by status,
// as the board shows sessions. A filter (yours, the ones you reported, the
// open sprint) and words narrow them. Each ticket shows its type, priority,
// sprint and last change, and the sessions working on it (its key in their
// branch or title, or named in what they say) with their state and PRs; a click opens it whole (and
// what you may do on it), "Start session" begins one about it.
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { get } from "@/lib/api"
import type { Card, Ticket, TicketFilter, TicketRow } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { StateIcon } from "@/features/session/StateIcon"
import { ago } from "@/features/session/state"
import { Anim } from "@/components/icons/animated"
import { promptFor } from "./jira"

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "reported", label: "Reported by me" },
  { value: "sprint", label: "Open sprint" },
]
const ORDER = { todo: 0, doing: 1, done: 2 } as const
const DOT = { todo: "bg-faint", doing: "bg-review", done: "bg-work" } as const
const seg = (isOn: boolean) => cn("h-6 rounded-[5px] px-2.5 text-[12.5px] font-[550]", isOn ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-text-muted hover:text-text")

// The columns: each status once, in the order of the team's board (`order`:
// status ids), the rest after it: to do, then in progress, then done.
type Column = { status: string; statusId: string; tone: TicketRow["tone"]; tickets: TicketRow[] }
export function columnsOf(tickets: TicketRow[], order: string[] = []): Column[] {
  const out = new Map<string, Column>()
  for (const t of tickets) {
    const col = out.get(t.status) ?? { status: t.status, statusId: t.statusId, tone: t.tone, tickets: [] }
    col.tickets.push(t)
    out.set(t.status, col)
  }
  const at = (c: Column) => (order.includes(c.statusId) ? order.indexOf(c.statusId) : order.length + ORDER[c.tone])
  return [...out.values()].sort((a, b) => at(a) - at(b) || ORDER[a.tone] - ORDER[b.tone])
}

// A new session about a ticket: its description too, and the repository its sessions use.
export async function startFrom(t: TicketRow, sessions: Card[]) {
  const whole = await get<Ticket>(`/api/jira/ticket?key=${t.key}`).catch(() => null)
  const root = sessions[0]?.repoRoot ?? null
  openDialog({ kind: "new", draft: { root, prompt: promptFor(t, whole?.description ?? ""), worktree: false, suggestion: { from: t.key, taskId: null } } })
}

function TicketCard({ ticket, sessions }: { ticket: TicketRow; sessions: Card[] }) {
  const now = useNow()
  const prs = sessions.flatMap(s => s.prs ?? [])
  const facts = [ticket.type, ticket.priority, ticket.sprint].filter(Boolean).join(" · ")
  return (
    <article className="group flex cursor-pointer flex-col gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5 hover:border-line-strong"
      onClick={() => openDialog({ kind: "ticket", key: ticket.key })}>
      <header className="flex items-center gap-2 text-xs">
        <a href={ticket.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 font-mono font-semibold text-text-muted no-underline hover:text-text" title="Open in Jira">
          {ticket.key}<Anim.ArrowUpRight size={11} />
        </a>
        <span className="min-w-0 flex-1 truncate text-faint">{facts}</span>
        <span className="shrink-0 text-faint" title={new Date(ticket.updated).toLocaleString("en-GB")}>{ago(ticket.updated, now)}</span>
      </header>
      <h3 className="m-0 line-clamp-2 text-[13.5px] leading-[1.3] font-semibold">{ticket.summary}</h3>
      {(sessions.length > 0 || prs.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {sessions.map(s => (
            <button key={s.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-hover px-1.5 py-0.5 text-xs hover:bg-press" title={`${s.title} — open the session`}
              onClick={e => (e.stopPropagation(), openSession(s.id))}>
              <StateIcon card={s} size={14} /><span className="truncate">{s.title}</span>
            </button>
          ))}
          {prs.map(pr => (
            <a key={pr.url} href={pr.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={pr.title}
              className="inline-flex items-center gap-1 rounded-md bg-hover px-1.5 py-0.5 text-xs text-text-muted no-underline hover:text-text">
              <Anim.GitPullRequest size={11} />#{pr.number}
            </a>
          ))}
        </div>
      )}
      <footer className="flex items-center gap-2">
        {ticket.assignee && <span className="min-w-0 truncate text-xs text-text-muted">{ticket.assignee}</span>}
        <span className="flex-1" />
        <Button variant="ghost" className="h-6 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={e => (e.stopPropagation(), void startFrom(ticket, sessions))}>
          {sessions.length ? "New session" : "Start session"}
        </Button>
      </footer>
    </article>
  )
}

export function Tickets({ cards }: { cards: Card[] }) {
  const [filter, setFilter] = useState<TicketFilter>("mine")
  const [words, setWords] = useState("")
  const [asked, setAsked] = useState("")
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Words are asked for once you stop typing.
  useEffect(() => {
    const timer = setTimeout(() => setAsked(words), 400)
    return () => clearTimeout(timer)
  }, [words])
  useEffect(() => {
    let alive = true
    const load = () => get<{ tickets: TicketRow[]; order: string[] }>(`/api/jira/search?${new URLSearchParams({ filter, q: asked })}`)
      .then(r => alive && (setTickets(r.tickets), setOrder(r.order), setError(null)), (err: Error) => alive && setError(err.message))
    void load()
    const timer = setInterval(load, 120_000)
    return () => ((alive = false), clearInterval(timer))
  }, [filter, asked])
  const sessionsOf = useMemo(() => {
    const by = new Map<string, Card[]>()
    for (const c of cards) for (const t of c.tickets ?? []) by.set(t.key, [...(by.get(t.key) ?? []), c])
    return (key: string) => by.get(key) ?? []
  }, [cards])
  const columns = columnsOf(tickets ?? [], order)
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-5 pt-3.5 pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <span role="group" aria-label="Which tickets" className="inline-flex rounded-md bg-press p-0.5">
          {FILTERS.map(f => <button key={f.value} className={seg(filter === f.value)} onClick={() => setFilter(f.value)}>{f.label}</button>)}
        </span>
        <Input value={words} onChange={e => setWords(e.target.value)} placeholder="Search tickets…" className="h-8 w-[240px]" />
        {tickets && <span className="text-xs text-faint">{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}</span>}
      </div>
      {error && !tickets ? <p className="grid flex-1 place-items-center text-text-muted">{error}</p>
        : !tickets ? <p className="grid flex-1 place-items-center"><span className="spinner" /></p>
        : !tickets.length ? <p className="grid flex-1 place-items-center text-text-muted">No tickets here.</p>
        : (
          <div className="grid min-h-0 flex-1 auto-cols-[minmax(270px,1fr)] grid-flow-col gap-3 overflow-x-auto">
            {columns.map(col => (
              <section key={col.status} className="dots-veil flex min-h-0 flex-col rounded-[12px] bg-side px-2 pt-2.5 pb-2">
                <h2 className="mx-1.5 mb-2.5 flex items-center gap-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">
                  <i className={cn("size-[7px] rounded-full", DOT[col.tone])} />{col.status}<span className="ml-auto font-medium text-faint">{col.tickets.length}</span>
                </h2>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  {col.tickets.map(t => <TicketCard key={t.key} ticket={t} sessions={sessionsOf(t.key)} />)}
                </div>
              </section>
            ))}
          </div>
        )}
    </div>
  )
}
