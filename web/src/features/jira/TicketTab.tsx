// A Jira ticket whole (lib/jira.ts), read live when it opens and every
// minute: what it is and where it sits (its parent, what sits in it, its
// links to others), the description and the comments; beside them its
// details, the sessions linked to it and a new one about it. On a ticket
// assigned to you: move its status (confirmed first) and comment.
// The "Tickets" tab of a session: the tickets linked to it and why (started
// from it, linked by you, its branch or title, you named it), one open whole;
// link another by its key, or unlink one that is not its own.
import { ChevronDown, Plus, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { get, post } from "@/lib/api"
import type { Card, Ticket, Transition } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { dialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { useBoardCards } from "@/features/board/state"
import { Markdown } from "@/features/conversation/Markdown"
import { StateIcon } from "@/features/session/StateIcon"
import { ago } from "@/features/session/state"
import { Anim } from "@/components/icons/animated"
import { WHY, sessionsOf, startFrom } from "./jira"
import { KindMark, TONE, TicketRefRow } from "./kinds"

const day = (at: number) => (at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—")

async function sendOrSay(path: string, body: object, done: string) {
  try {
    await post(path, body)
    toast(done)
    return true
  } catch (err) {
    toast((err as Error).message || "Jira did not take it")
    return false
  }
}

// Its status; on yours, a menu of the statuses it may move to, then "Move?".
function Status({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const [moves, setMoves] = useState<Transition[] | null>(null)
  const [picked, setPicked] = useState<Transition | null>(null)
  const [isBusy, setBusy] = useState(false)
  useEffect(() => {
    if (ticket.isMine) void get<{ transitions: Transition[] }>(`/api/jira/transitions?key=${ticket.key}`).then(r => setMoves(r.transitions), () => setMoves([]))
  }, [ticket.key, ticket.status, ticket.isMine])
  const pill = cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", TONE[ticket.tone])
  if (!ticket.isMine) return <span className={cn(pill, "w-fit")}>{ticket.status}</span>
  // Each status once: two moves to the same status are one choice.
  const choices = (moves ?? []).filter((m, i, all) => m.to !== ticket.status && all.findIndex(o => o.to === m.to) === i)
  const move = async (to: Transition) => {
    setBusy(true)
    if (await sendOrSay("/api/jira/move", { key: ticket.key, transition: to.id }, `${ticket.key} moved to ${to.to}`)) (setPicked(null), onDone())
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(pill, "w-fit hover:brightness-95")} title="Move it">{ticket.status}<ChevronDown size={12} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {!moves ? <div className="grid place-items-center p-2"><span className="spinner size-3" /></div>
            : !choices.length ? <div className="px-2 py-1.5 text-xs text-text-muted">No move open now</div>
            : choices.map(m => (
              <DropdownMenuItem key={m.id} onSelect={() => setPicked(m)}>
                <span className={cn("rounded px-1.5 text-xs font-semibold", TONE[m.tone])}>{m.to}</span>
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {picked && (
        <div className="flex flex-col gap-2 rounded-[8px] border border-line bg-surface p-2 text-xs">
          <span>Move to <b>{picked.to}</b>?</span>
          <div className="flex gap-1.5">
            <Button autoFocus className="h-6 flex-1 text-xs" disabled={isBusy} onClick={() => void move(picked)}>Move</Button>
            <Button variant="outline" className="h-6 flex-1 text-xs" disabled={isBusy} onClick={() => setPicked(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CommentBox({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const [text, setText] = useState("")
  const [isBusy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    if (await sendOrSay("/api/jira/comment", { key: ticket.key, text }, "Comment added")) (setText(""), onDone())
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-2 focus-within:border-brand">
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…" rows={2}
        onKeyDown={e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && (e.preventDefault(), void send())}
        className="min-h-[44px] resize-y bg-transparent px-1 text-[13px] outline-none" />
      <Button className="h-7 self-end text-xs" disabled={isBusy || !text.trim()} onClick={() => void send()}>Comment</Button>
    </div>
  )
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="m-0 flex items-center gap-2 text-[11.5px] font-bold tracking-[0.05em] text-text-muted uppercase">{title}{extra}</h4>
      {children}
    </section>
  )
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <><dt className="text-xs text-text-muted">{label}</dt><dd className="m-0 min-w-0 truncate text-[13px]">{children}</dd></>
)

export function TicketView({ ticketKey }: { ticketKey: string }) {
  const now = useNow()
  const cards = useBoardCards()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => get<Ticket>(`/api/jira/ticket?key=${encodeURIComponent(ticketKey)}`).then(t => (setTicket(t), setError(null)), (err: Error) => setError(err.message))
  useEffect(() => {
    setTicket(null)
    void load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [ticketKey])
  if (error && !ticket) return <p className="m-0 text-[13px] text-bad">{ticketKey}: {error}</p>
  if (!ticket) return <div className="grid min-h-40 place-items-center"><span className="spinner" /></div>
  const sessions = sessionsOf(cards, ticket.key)
  const done = ticket.children.filter(c => c.tone === "done").length
  return (
    <article className="@container flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {ticket.parent && <><TicketRefRow ticket={ticket.parent} className="-ml-1.5 w-auto max-w-[60%] text-xs" /><span className="text-faint">/</span></>}
          <KindMark kind={ticket.kind} type={ticket.type} size={18} />
          <span className="text-xs text-text-muted">{ticket.type}</span>
          <a href={ticket.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono text-xs font-semibold text-text-muted no-underline hover:text-text" title="Open in Jira">
            {ticket.key}<Anim.ArrowUpRight size={12} />
          </a>
        </div>
        <h2 className="m-0 text-lg leading-[1.3] font-semibold text-balance">{ticket.summary}</h2>
      </header>
      <div className="grid gap-5 @[680px]:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Description">
            {ticket.description ? <Markdown className="text-[13.5px]">{ticket.description}</Markdown> : <p className="m-0 text-[13px] text-faint">No description.</p>}
          </Section>
          {ticket.children.length > 0 && (
            <Section title={ticket.kind === "epic" ? "In this epic" : "Sub-tasks"} extra={<span className="font-medium tracking-normal text-faint normal-case">{done} of {ticket.children.length} done</span>}>
              <div className="h-1 overflow-hidden rounded-full bg-hover"><div className="h-full bg-work" style={{ width: `${(done / ticket.children.length) * 100}%` }} /></div>
              <div className="-mx-1.5 flex flex-col">{ticket.children.map(c => <TicketRefRow key={c.key} ticket={c} />)}</div>
            </Section>
          )}
          {ticket.links.length > 0 && (
            <Section title="Links">
              <div className="-mx-1.5 flex flex-col">{ticket.links.map(l => <TicketRefRow key={`${l.how}${l.ticket.key}`} ticket={l.ticket} note={l.how} />)}</div>
            </Section>
          )}
          <Section title={ticket.comments.length === 1 ? "1 comment" : `${ticket.comments.length} comments`}>
            <div className="flex flex-col gap-3">
              {ticket.comments.map((c, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-hover text-[11px] font-bold text-text-muted">{c.author.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-baseline gap-2 text-xs"><b className="font-semibold">{c.author}</b><span className="text-faint">{ago(c.at, now)} ago</span></div>
                    <Markdown className="text-[13px]">{c.body}</Markdown>
                  </div>
                </div>
              ))}
              {ticket.isMine && <CommentBox ticket={ticket} onDone={() => void load()} />}
            </div>
          </Section>
        </div>
        <aside className="flex flex-col gap-4 self-start rounded-[12px] border border-line bg-side p-3 @[680px]:sticky @[680px]:top-0">
          <Status ticket={ticket} onDone={() => void load()} />
          <dl className="m-0 grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1.5">
            <Fact label="Assignee">{ticket.assignee ?? <span className="text-faint">Unassigned</span>}</Fact>
            <Fact label="Reporter">{ticket.reporter ?? "—"}</Fact>
            <Fact label="Priority">{ticket.priority ?? "—"}</Fact>
            <Fact label="Sprint">{ticket.sprint ?? "—"}</Fact>
            <Fact label="Created">{day(ticket.created)}</Fact>
            <Fact label="Updated"><span title={new Date(ticket.updated).toLocaleString("en-GB")}>{ago(ticket.updated, now)} ago</span></Fact>
          </dl>
          <Section title="Sessions">
            {sessions.map(s => (
              <button key={s.id} className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-hover" onClick={() => (dialog.set(null), openSession(s.id))}
                title={WHY[s.tickets.find(t => t.key === ticket.key)?.why ?? "named"]}>
                <StateIcon card={s} size={14} /><span className="truncate">{s.title}</span>
              </button>
            ))}
            <Button variant="outline" className="h-7 gap-1 text-xs" onClick={() => void startFrom([ticket], cards)}><Plus size={13} />{sessions.length ? "New session" : "Start session"}</Button>
          </Section>
        </aside>
      </div>
    </article>
  )
}

// Links another ticket to the session by its key.
function LinkTicket({ card }: { card: Card }) {
  const [key, setKey] = useState("")
  const link = async () => {
    const k = key.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(k)) return toast("A key looks like PP-123")
    if (await sendOrSay(`/api/sessions/${encodeURIComponent(card.id)}/tickets`, { link: k }, `${k} linked`)) setKey("")
  }
  return (
    <form className="flex gap-1.5" onSubmit={e => (e.preventDefault(), void link())}>
      <Input value={key} onChange={e => setKey(e.target.value)} placeholder="Link a ticket: PP-123" className="h-7 w-[180px] font-mono text-xs" />
      <Button type="submit" variant="outline" className="h-7 text-xs" disabled={!key.trim()}>Link</Button>
    </form>
  )
}

export function TicketTab({ card }: { card: Card }) {
  const tickets = card.tickets ?? []
  const [open, setOpen] = useState<string | null>(tickets[0]?.key ?? null)
  const shown = tickets.some(t => t.key === open) ? open : (tickets[0]?.key ?? null)
  const unlink = (key: string) => void sendOrSay(`/api/sessions/${encodeURIComponent(card.id)}/tickets`, { unlink: key }, `${key} unlinked`)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
      <div className="flex flex-col gap-1">
        {tickets.map(t => (
          <div key={t.key} className={cn("group flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5", t.key === shown ? "bg-select" : "hover:bg-hover")}>
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]" onClick={() => setOpen(t.key)}>
              <KindMark kind={t.kind} size={15} />
              <span className="shrink-0 font-mono text-xs font-semibold text-text-muted">{t.key}</span>
              <span className="min-w-0 flex-1 truncate">{t.summary}</span>
              <span className="shrink-0 text-xs text-faint">{WHY[t.why]}</span>
            </button>
            <button className="grid size-5 shrink-0 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-press hover:text-text focus-visible:opacity-100" title={`Unlink ${t.key}`} onClick={() => unlink(t.key)}>
              <X size={13} />
            </button>
          </div>
        ))}
        {!tickets.length && <p className="m-0 text-[13px] text-text-muted">No ticket linked yet.</p>}
        <div className="mt-1.5"><LinkTicket card={card} /></div>
      </div>
      {shown && <div className="border-t border-line pt-4"><TicketView key={shown} ticketKey={shown} /></div>}
    </div>
  )
}
