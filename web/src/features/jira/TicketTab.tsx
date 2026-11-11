// A Jira ticket whole (lib/jira.ts), read live when it opens and every
// minute: what it is and where it sits (its parent, what sits in it, its
// links to others), the description and the comments; beside them its
// details, the sessions linked to it (link another, or unlink one) and a
// new one about it. On a ticket
// assigned to you: move its status (confirmed first) and comment.
// The "Tickets" tab of a session: the tickets linked to it and why (started
// from it, linked by you, its branch or title, you named it), one open whole;
// link another by its key, or unlink one that is not its own.
import { BotAvatar } from "bot-avatars"
import { ChevronDown, Link2, Plus, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "@/lib/notify"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { get } from "@/lib/api"
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
import { WHY, keptTicket, loadTicket, sessionsOf, startFrom } from "./jira"
import { KindMark, TONE, TicketRefRow } from "./kinds"
import { Pipeline } from "./Pipeline"
import { TicketTree } from "./TicketTree"
import { readComment } from "./comment"
import { sendWithFeedback } from "./feedback"

const day = (at: number) => (at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—")

const sendOrSay = async (path: string, body: object, done: string) => (await sendWithFeedback(path, body, done, "Jira did not take it")) !== null

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

const LONG_CHARS = 700 // a comment longer than this shows folded first

// A comment: who wrote it (the pipeline's, as Agent Center, its title on its
// own) and when; a long one folded under a fade until you open it.
function Comment({ author, at, body, now }: { author: string; at: number; body: string; now: number }) {
  const { isAgent, title, text } = readComment(body)
  const isLong = text.length > LONG_CHARS
  const [isOpen, setOpen] = useState(false)
  return (
    <li className="flex gap-2.5 border-t border-line py-3.5 first:border-t-0 first:pt-1">
      {isAgent ? <BotAvatar type="droid" state="default" size={24} className="shrink-0" aria-hidden />
        : <span className="grid size-6 shrink-0 place-items-center rounded-full bg-hover text-[11px] font-bold text-text-muted">{author.slice(0, 1)}</span>}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2 text-xs">
          <b className="font-semibold">{isAgent ? "Agent Center" : author}</b>
          {isAgent && <span className="text-faint">as {author}</span>}
          <span className="text-faint">{ago(at, now)} ago</span>
        </div>
        {title && <p className="m-0 mb-1.5 text-[13.5px] font-semibold">{title}</p>}
        <div className={cn(isLong && !isOpen && "max-h-[200px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]")}>
          <Markdown className="text-[13px]">{text}</Markdown>
        </div>
        {isLong && (
          <button className="mt-1 text-xs font-semibold text-text-muted transition-colors duration-120 hover:text-text" onClick={() => setOpen(v => !v)} aria-expanded={isOpen}>
            {isOpen ? "Show less" : "Show all"}
          </button>
        )}
      </div>
    </li>
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

// Its shape while it loads, so the dialog does not grow under the eye.
const TicketSkeleton = () => (
  <div className="@container flex animate-pulse flex-col gap-4" aria-busy>
    <div className="h-3.5 w-40 rounded bg-hover" />
    <div className="h-6 w-3/4 rounded bg-hover" />
    <div className="grid gap-5 @[680px]:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex flex-col gap-2.5">{[96, 88, 92, 70, 84, 60].map((w, i) => <div key={i} className="h-3 rounded bg-hover" style={{ width: `${w}%` }} />)}</div>
      <div className="h-56 rounded-[12px] bg-hover" />
    </div>
  </div>
)

export function TicketView({ ticketKey }: { ticketKey: string }) {
  const now = useNow()
  const cards = useBoardCards()
  // The one read on hover, if any, at once; then fresh from Jira (unless it
  // was read a moment ago).
  const [ticket, setTicket] = useState<Ticket | null>(() => keptTicket(ticketKey))
  const [error, setError] = useState<string | null>(null)
  const load = (maxAgeMs = 0) => loadTicket(ticketKey, maxAgeMs).then(t => (setTicket(t), setError(null)), (err: Error) => setError(err.message))
  useEffect(() => {
    setTicket(keptTicket(ticketKey))
    void load(5_000)
    const timer = setInterval(() => void load(), 60_000)
    return () => clearInterval(timer)
  }, [ticketKey])
  if (error && !ticket) return <p className="m-0 text-[13px] text-bad">{ticketKey}: {error}</p>
  if (!ticket) return <TicketSkeleton />
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
          <Pipeline ticket={ticket} onTaken={() => void load()} />
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
            <ol className="m-0 flex list-none flex-col p-0">
              {ticket.comments.map((c, i) => <Comment key={i} author={c.author} at={c.at} body={c.body} now={now} />)}
            </ol>
            {ticket.isMine && <CommentBox ticket={ticket} onDone={() => void load()} />}
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
              <div key={s.id} className="group -mx-1.5 flex min-w-0 items-center gap-1 rounded-md pr-1 hover:bg-hover">
                <button className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left text-[13px]" onClick={() => (dialog.set(null), openSession(s.id))}
                  title={WHY[s.tickets.find(t => t.key === ticket.key)?.why ?? "named"]}>
                  <StateIcon card={s} size={14} /><span className="truncate">{s.title}</span>
                </button>
                <button className="grid size-5 shrink-0 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-press hover:text-text focus-visible:opacity-100" title={`Unlink from ${s.title}`}
                  onClick={() => void linkTo(s, { unlink: ticket.key })}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className="flex gap-1.5">
              <Button variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => void startFrom([ticket], cards)}><Plus size={13} />{sessions.length ? "New" : "Start session"}</Button>
              <LinkSession ticketKey={ticket.key} cards={cards.filter(c => !sessions.includes(c))} />
            </div>
          </Section>
        </aside>
      </div>
    </article>
  )
}

// Links a ticket to a session, or unlinks it, as the person says.
const linkTo = (card: Card, change: { link: string } | { unlink: string }) =>
  sendOrSay(`/api/sessions/${encodeURIComponent(card.id)}/tickets`, change, "link" in change ? `${change.link} linked to ${card.title}` : `${change.unlink} unlinked from ${card.title}`)

// Links the ticket to a session you pick: the latest first, narrowed by words.
function LinkSession({ ticketKey, cards }: { ticketKey: string; cards: Card[] }) {
  const [words, setWords] = useState("")
  const wanted = words.trim().toLowerCase()
  const shown = cards.filter(c => !wanted || `${c.title} ${c.repo}`.toLowerCase().includes(wanted)).sort((a, b) => b.lastActivity - a.lastActivity).slice(0, 30)
  return (
    <DropdownMenu onOpenChange={() => setWords("")}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-7 flex-1 gap-1 text-xs"><Link2 size={13} />Link</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        <Input autoFocus value={words} onChange={e => setWords(e.target.value)} onKeyDown={e => e.key !== "Escape" && e.key !== "ArrowDown" && e.stopPropagation()}
          placeholder="Find a session…" className="mb-1 h-7 text-xs" />
        <div className="max-h-[280px] overflow-auto">
          {shown.map(c => (
            <DropdownMenuItem key={c.id} onSelect={() => void linkTo(c, { link: ticketKey })} className="gap-2">
              <StateIcon card={c} size={14} /><span className="min-w-0 flex-1 truncate">{c.title}</span><span className="shrink-0 text-xs text-faint">{c.repo}</span>
            </DropdownMenuItem>
          ))}
          {!shown.length && <div className="px-2 py-1.5 text-xs text-text-muted">No session</div>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Links another ticket to the session by its key.
function LinkTicket({ card }: { card: Card }) {
  const [key, setKey] = useState("")
  const link = async () => {
    const k = key.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(k)) return toast("A key looks like PP-123")
    if (await linkTo(card, { link: k })) setKey("")
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
  const [open, setOpen] = useState<string | null>(null) // any ticket of the tree; null: the first linked
  const shown = open ?? tickets[0]?.key ?? null
  const unlink = (key: string) => (key === open && setOpen(null), void linkTo(card, { unlink: key }))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-5 py-4">
      <TicketTree card={card} shown={shown} onPick={setOpen} onUnlink={unlink} footer={<LinkTicket card={card} />} />
      {shown && <TicketView key={shown} ticketKey={shown} />}
    </div>
  )
}
