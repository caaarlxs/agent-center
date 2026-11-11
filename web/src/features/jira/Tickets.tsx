// The "Tickets" view (lib/jira.ts): your Jira tickets on the columns of your
// team's board, all of them and all as wide, optionally in a
// row per ticket on top (an epic, else a story), so what sits in what shows. A filter (yours, the ones you
// reported, the open sprint), words, or "No session" (none works on it yet)
// narrow them. Each ticket shows its
// kind, priority, sprint and last change, its parent, and the sessions
// linked to it with their state and PRs, and on yours a note when a PR is
// ahead of it (open, or merged) with its move; a click opens it whole, "Session"
// begins one about it, and a tick (or ⌘-click) picks several to begin one
// about them all.
import { ChevronDown, Plus, RefreshCw, X } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/lib/notify"
import { get, post } from "@/lib/api"
import type { BoardColumn, Card, TicketFilter, TicketRef, TicketRow, Transition } from "@/lib/api-types"
import { createStore, persistedStore } from "@/lib/store"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { StateIcon } from "@/features/session/StateIcon"
import { ago } from "@/features/session/state"
import { Anim } from "@/components/icons/animated"
import { WHY, prefetchTicket, startFrom } from "./jira"
import { KindMark } from "./kinds"
import { type SyncHint, syncHint } from "./sync"

// Bumped when the board moves a ticket, so the view asks Jira again.
const ticketsChanged = createStore(0)

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "reported", label: "Reported by me" },
  { value: "sprint", label: "Open sprint" },
  { value: "all", label: "All" },
]
type Grouping = "status" | "epic"
const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "status", label: "Columns" },
  { value: "epic", label: "By parent" },
]
const GROUPING_KEY = "ac.ticketsGrouping"
const ORDER = { todo: 0, doing: 1, done: 2 } as const
const DOT = { todo: "bg-faint", doing: "bg-review", done: "bg-work" } as const
const seg = (isOn: boolean) => cn("h-6 rounded-[5px] px-2.5 text-[12.5px] font-[550]", isOn ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-text-muted hover:text-text")

// The columns: the board's, in its order, each with the tickets of its
// statuses (an empty one too); then a column per status the board lacks, to
// do, then in progress, then done. An empty column's tone comes from its place.
export type Column = { name: string; tone: TicketRow["tone"]; statusIds: string[]; tickets: TicketRow[] }
export function columnsOf(tickets: TicketRow[], board: BoardColumn[] = []): Column[] {
  const cols: Column[] = board.map((c, i) => ({ name: c.name, statusIds: c.statusIds, tone: i === 0 ? "todo" : i === board.length - 1 ? "done" : "doing", tickets: [] }))
  const extra = new Map<string, Column>()
  for (const t of tickets) {
    let col = cols.find(c => c.statusIds.includes(t.statusId)) ?? extra.get(t.status)
    if (!col) extra.set(t.status, (col = { name: t.status, statusIds: [t.statusId], tone: t.tone, tickets: [] }))
    if (!col.tickets.length) col.tone = t.tone
    col.tickets.push(t)
  }
  return [...cols, ...[...extra.values()].sort((a, b) => ORDER[a.tone] - ORDER[b.tone])]
}

// A row per ticket on top: the highest one each ticket sits in (its epic,
// else its parent, a story), with its tickets (and itself), the most first.
// An epic, or a ticket others sit in, heads its own row; one with nothing
// above it and nothing in it goes last.
export type Lane = { head: TicketRef | null; tickets: TicketRow[] }
const refTo = (t: TicketRow): TicketRef => ({ key: t.key, summary: t.summary, type: t.type, kind: t.kind, status: t.status, tone: t.tone, url: t.url })
export function lanesOf(tickets: TicketRow[]): Lane[] {
  const above = (t: TicketRow) => t.epic ?? t.parent
  const heads = new Set(tickets.map(t => above(t)?.key))
  const lanes = new Map<string, Lane>()
  for (const t of tickets) {
    const head = above(t) ?? (t.kind === "epic" || heads.has(t.key) ? refTo(t) : null)
    const lane = lanes.get(head?.key ?? "") ?? { head, tickets: [] }
    lane.tickets.push(t)
    lanes.set(head?.key ?? "", lane)
  }
  return [...lanes.values()].sort((a, b) => Number(!a.head) - Number(!b.head) || b.tickets.length - a.tickets.length)
}

// A ticket of yours behind its PR: the PR, and its move to the column it
// should be in, confirmed first.
function SyncNote({ ticket, hint }: { ticket: TicketRow; hint: SyncHint }) {
  const [isAsking, setAsking] = useState(false)
  const [isBusy, setBusy] = useState(false)
  const move = async () => {
    setBusy(true)
    try {
      const { transitions } = await get<{ transitions: Transition[] }>(`/api/jira/transitions?key=${ticket.key}`)
      const to = transitions.find(t => hint.column.statusIds.includes(t.toId))
      if (!to) throw new Error(`Jira does not let ${ticket.key} go to ${hint.column.name} from here`)
      await post("/api/jira/move", { key: ticket.key, transition: to.id })
      toast(`${ticket.key} moved to ${to.to}`)
      ticketsChanged.set(ticketsChanged.get() + 1)
    } catch (err) {
      toast((err as Error).message || "Jira did not take it")
    }
    setBusy(false)
    setAsking(false)
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-[8px] bg-ask-soft px-2 py-1 text-xs text-ask" onClick={e => e.stopPropagation()}>
      <Anim.GitPullRequest size={12} />
      <span className="min-w-0 flex-1">#{hint.pr.number} {hint.isMerged ? "merged" : "open"}</span>
      {isAsking ? (
        <>
          <button className="rounded px-1.5 font-semibold hover:bg-ask/15" disabled={isBusy} onClick={() => void move()}>{isBusy ? "Moving in Jira…" : `Move to ${hint.column.name}`}</button>
          <button className="rounded px-1.5 hover:bg-ask/15" disabled={isBusy} onClick={() => setAsking(false)}>Cancel</button>
        </>
      ) : (
        <button className="rounded px-1.5 font-semibold hover:bg-ask/15" onClick={() => setAsking(true)} title={`Move ${ticket.key} to ${hint.column.name}`}>→ {hint.column.name}</button>
      )}
    </div>
  )
}

function TicketCard({ ticket, sessions, hint, isPicked, isPicking, above, onPick }: {
  ticket: TicketRow; sessions: Card[]; hint: SyncHint | null; isPicked: boolean; isPicking: boolean; above?: string; onPick: () => void
}) {
  const now = useNow()
  const prs = sessions.flatMap(s => s.prs ?? [])
  const facts = [ticket.type, ticket.priority, ticket.sprint].filter(Boolean).join(" · ")
  // A sub-task's story, or a story's epic, when its row does not say it already.
  const parent = ticket.parent && ticket.parent.key !== above ? ticket.parent : null
  const why = (s: Card) => s.tickets.find(t => t.key === ticket.key)?.why
  return (
    <article className={cn("group flex cursor-pointer flex-col gap-1.5 rounded-[10px] border bg-surface px-3 py-2.5", isPicked ? "border-brand ring-2 ring-brand-soft" : "border-line hover:border-line-strong")}
      onPointerEnter={() => prefetchTicket(ticket.key)}
      onClick={e => (e.metaKey || e.ctrlKey || e.shiftKey || isPicking ? onPick() : openDialog({ kind: "ticket", key: ticket.key }))}>
      <header className="flex items-center gap-1.5 text-xs">
        <KindMark kind={ticket.kind} type={ticket.type} size={15} />
        <a href={ticket.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-0.5 font-mono font-semibold text-text-muted no-underline hover:text-text" title="Open in Jira">
          {ticket.key}<Anim.ArrowUpRight size={11} />
        </a>
        <span className="min-w-0 flex-1 truncate text-faint">{facts}</span>
        <span className="shrink-0 text-faint" title={new Date(ticket.updated).toLocaleString("en-GB")}>{ago(ticket.updated, now)}</span>
        <button role="checkbox" aria-checked={isPicked} aria-label={`Pick ${ticket.key}`} onClick={e => (e.stopPropagation(), onPick())}
          className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border text-white", isPicked ? "border-brand bg-brand" : "border-line-strong bg-surface", !isPicked && !isPicking && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
          {isPicked && <Anim.Check size={11} />}
        </button>
      </header>
      {parent && (
        <button className="-mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 text-left text-xs text-text-muted hover:bg-hover" title={`In ${parent.key} · ${parent.summary}`}
          onClick={e => (e.stopPropagation(), openDialog({ kind: "ticket", key: parent.key }))}>
          <KindMark kind={parent.kind} type={parent.type} size={12} /><span className="shrink-0 font-mono">{parent.key}</span><span className="truncate">{parent.summary}</span>
        </button>
      )}
      <h3 className="m-0 line-clamp-2 text-[13.5px] leading-[1.3] font-semibold">{ticket.summary}</h3>
      {(sessions.length > 0 || prs.length > 0) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {sessions.map(s => (
            <button key={s.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-hover px-1.5 py-0.5 text-xs hover:bg-press" title={`${s.title} (${WHY[why(s) ?? "named"]}) — open the session`}
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
      {hint && <SyncNote ticket={ticket} hint={hint} />}
      <footer className="flex items-center gap-2">
        {ticket.assignee && <span className="min-w-0 truncate text-xs text-text-muted">{ticket.assignee}</span>}
        <span className="flex-1" />
        <Button variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-text-muted hover:text-text" title="Start a new session about this ticket"
          onClick={e => (e.stopPropagation(), void startFrom([ticket], sessions))}>
          <Plus size={13} />Session
        </Button>
      </footer>
    </article>
  )
}

function ColumnHead({ col }: { col: Column }) {
  return (
    <h2 className="sticky top-0 z-10 m-0 flex items-center gap-2 bg-bg px-1.5 pt-0.5 pb-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase" title={col.name}>
      <i className={cn("size-[7px] shrink-0 rounded-full", DOT[col.tone])} />
      <span className="truncate">{col.name}</span><span className="ml-auto font-medium text-faint">{col.tickets.length}</span>
    </h2>
  )
}

// The tickets on the board's columns, in a row per ticket on top when asked.
type Picking = { picked: string[]; onPick: (key: string) => void }
// The rows folded (by their head's key, "none" for the last row): kept in this browser.
const foldedLanes = persistedStore<string[]>("ticketLanesFolded", [])
const laneKey = (lane: Lane) => lane.head?.key ?? "none"
const toggleLane = (key: string) => {
  const folded = foldedLanes.get()
  foldedLanes.set(folded.includes(key) ? folded.filter(k => k !== key) : [...folded, key])
}

function TicketBoard({ tickets, board, grouping, cards, picking }: { tickets: TicketRow[]; board: BoardColumn[]; grouping: Grouping; cards: Card[]; picking: Picking }) {
  const sessionsByKey = useMemo(() => {
    const by = new Map<string, Card[]>()
    for (const c of cards) for (const t of c.tickets ?? []) by.set(t.key, [...(by.get(t.key) ?? []), c])
    return by
  }, [cards])
  const isByEpic = grouping === "epic"
  const columns = columnsOf(tickets, board)
  const lanes: Lane[] = isByEpic ? lanesOf(tickets) : [{ head: null, tickets }]
  const folded = foldedLanes.use()
  // Every column as wide as the others, the empty ones too.
  const template = `repeat(${columns.length}, minmax(250px, 1fr))`
  const minWidth = columns.length * 262
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid gap-x-3" style={{ gridTemplateColumns: template, minWidth, gridTemplateRows: isByEpic ? undefined : "auto 1fr", minHeight: isByEpic ? undefined : "100%" }}>
        {columns.map((col, i) => <ColumnHead key={i} col={col} />)}
        {lanes.map(lane => (
          <Fragment key={laneKey(lane)}>
            {isByEpic && <LaneHead lane={lane} isFolded={folded.includes(laneKey(lane))} />}
            {!(isByEpic && folded.includes(laneKey(lane))) && columns.map((col, i) => {
              const here = lane.tickets.filter(t => col.statusIds.includes(t.statusId))
              return (
                <section key={i} className={cn("dots-veil flex min-h-0 flex-col gap-2 rounded-[12px] bg-side p-2", isByEpic && !here.length && "min-h-10")}>
                  {here.map(t => (
                    <TicketCard key={t.key} ticket={t} sessions={sessionsByKey.get(t.key) ?? []} hint={syncHint(t, sessionsByKey.get(t.key) ?? [], columns)} isPicked={picking.picked.includes(t.key)} isPicking={picking.picked.length > 0}
                      above={isByEpic ? lane.head?.key : undefined} onPick={() => picking.onPick(t.key)} />
                  ))}
                </section>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// A row's head: its chevron folds the row (its tickets hide, the count stays);
// a click on the ticket opens it.
function LaneHead({ lane, isFolded }: { lane: Lane; isFolded: boolean }) {
  return (
    <div className="col-span-full flex items-center gap-1 pt-3 pb-2 first:pt-0">
      <button onClick={() => toggleLane(laneKey(lane))} aria-expanded={!isFolded} title={isFolded ? "Unfold this row" : "Fold this row"}
        className="sticky left-0 grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text">
        <ChevronDown className={cn("size-3.5 transition-transform duration-150", isFolded && "-rotate-90")} />
      </button>
      <button className="sticky left-7 flex min-w-0 items-center gap-2 rounded-md px-1 text-left text-[13px] font-semibold hover:bg-hover" disabled={!lane.head}
        onClick={() => lane.head && openDialog({ kind: "ticket", key: lane.head.key })}>
        {lane.head ? <><KindMark kind={lane.head.kind} type={lane.head.type} size={15} /><span className="font-mono text-xs text-text-muted">{lane.head.key}</span><span className="truncate">{lane.head.summary}</span></> : <span className="text-text-muted">Nothing above</span>}
        <span className="text-xs font-medium text-faint">{lane.tickets.length}</span>
      </button>
    </div>
  )
}

// The tickets picked, and a session about them all.
function PickedBar({ tickets, picked, cards, onClear }: { tickets: TicketRow[]; picked: string[]; cards: Card[]; onClear: () => void }) {
  const rows = picked.map(k => tickets.find(t => t.key === k)).filter((t): t is TicketRow => !!t)
  return (
    <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[12px] border border-line bg-raised py-1.5 pr-1.5 pl-3.5 shadow-lg">
      <span className="text-[13px] font-semibold">{picked.length} {picked.length === 1 ? "ticket" : "tickets"}</span>
      <span className="max-w-[260px] truncate font-mono text-xs text-text-muted">{picked.join(", ")}</span>
      <Button className="h-7 gap-1 text-xs" onClick={() => void startFrom(rows, cards).then(onClear)}><Plus size={13} />Start session</Button>
      <Button variant="ghost" className="size-7 px-0" title="Clear (Esc)" onClick={onClear}><X size={14} /></Button>
    </div>
  )
}

const Segments = <T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <span role="group" aria-label={label} className="inline-flex rounded-md bg-press p-0.5">
    {options.map(o => <button key={o.value} className={seg(value === o.value)} onClick={() => onChange(o.value)}>{o.label}</button>)}
  </span>
)

// Your tickets from Jira for a filter and some words: again every two
// minutes, when you come back to the window (after a while), when the board
// moves one, and when you ask.
const STALE_MS = 15_000
function useTicketSearch(filter: TicketFilter, words: string) {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const [board, setBoard] = useState<BoardColumn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [asked, setAsked] = useState(0)
  const changed = ticketsChanged.use()
  useEffect(() => {
    let alive = true
    let at = 0
    const load = () => {
      at = Date.now()
      setLoading(true)
      get<{ tickets: TicketRow[]; columns: BoardColumn[] }>(`/api/jira/search?${new URLSearchParams({ filter, q: words })}`)
        .then(r => alive && (setTickets(r.tickets), setBoard(r.columns), setError(null)), (err: Error) => alive && setError(err.message))
        .finally(() => alive && setLoading(false))
    }
    const onBack = () => document.visibilityState === "visible" && Date.now() - at > STALE_MS && load()
    load()
    const timer = setInterval(load, 120_000)
    window.addEventListener("focus", onBack)
    document.addEventListener("visibilitychange", onBack)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener("focus", onBack)
      document.removeEventListener("visibilitychange", onBack)
    }
  }, [filter, words, changed, asked])
  return { tickets, board, error, isLoading, reload: () => setAsked(n => n + 1) }
}

function readGrouping(): Grouping {
  try {
    return localStorage.getItem(GROUPING_KEY) === "epic" ? "epic" : "status"
  } catch {
    return "status"
  }
}

export function Tickets({ cards }: { cards: Card[] }) {
  const [filter, setFilter] = useState<TicketFilter>("mine")
  const [grouping, setGrouping] = useState<Grouping>(readGrouping)
  const [words, setWords] = useState("")
  const [asked, setAsked] = useState("")
  const { tickets, board, error, isLoading, reload } = useTicketSearch(filter, asked)
  const [picked, setPicked] = useState<string[]>([])
  const [isUnstarted, setUnstarted] = useState(false)
  // Words are asked for once you stop typing.
  useEffect(() => {
    const timer = setTimeout(() => setAsked(words), 400)
    return () => clearTimeout(timer)
  }, [words])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && picked.length && (e.stopPropagation(), setPicked([]))
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [picked.length])
  const group = (g: Grouping) => {
    setGrouping(g)
    try {
      localStorage.setItem(GROUPING_KEY, g)
    } catch {}
  }
  const started = useMemo(() => new Set(cards.flatMap(c => (c.tickets ?? []).map(t => t.key))), [cards])
  const shown = tickets && (isUnstarted ? tickets.filter(t => !started.has(t.key)) : tickets)
  const pick = (key: string) => setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]))
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 px-5 pt-3.5 pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segments label="Which tickets" options={FILTERS} value={filter} onChange={setFilter} />
        <Input value={words} onChange={e => setWords(e.target.value)} placeholder="Search or PP-1234…" className="h-8 w-[240px]" />
        <button className={cn("h-7 rounded-md border px-2.5 text-[12.5px] font-[550]", isUnstarted ? "border-brand bg-brand-soft text-brand-text" : "border-line text-text-muted hover:text-text")}
          aria-pressed={isUnstarted} onClick={() => setUnstarted(v => !v)} title="Only the tickets no session works on">No session</button>
        {shown && <span className="text-xs text-faint">{shown.length} {shown.length === 1 ? "ticket" : "tickets"}</span>}
        <Button variant="ghost" className="size-7 px-0 text-text-muted" title="Reload from Jira" disabled={isLoading} onClick={reload}>
          <RefreshCw size={14} className={cn(isLoading && "animate-spin")} />
        </Button>
        <span className="flex-1" />
        <Segments label="Group tickets" options={GROUPINGS} value={grouping} onChange={group} />
      </div>
      {error && !shown ? <p className="grid flex-1 place-items-center text-text-muted">{error}</p>
        : !shown ? <p className="grid flex-1 place-items-center"><span className="spinner" /></p>
        : !shown.length ? <p className="grid flex-1 place-items-center text-text-muted">No tickets here.</p>
        : <TicketBoard tickets={shown} board={board} grouping={grouping} cards={cards} picking={{ picked, onPick: pick }} />}
      {picked.length > 0 && <PickedBar tickets={tickets ?? []} picked={picked} cards={cards} onClear={() => setPicked([])} />}
    </div>
  )
}
