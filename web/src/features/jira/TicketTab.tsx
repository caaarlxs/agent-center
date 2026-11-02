// The "Ticket" tab (lib/jira.ts): the Jira tickets the session works on, read
// live when the tab opens and every minute: summary, status, type, priority,
// who has it, the description and the comments, and a link to Jira.
import { useEffect, useState } from "react"
import { get } from "@/lib/api"
import type { Card, Ticket } from "@/lib/api-types"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { Markdown } from "@/features/conversation/Markdown"
import { ago } from "@/features/session/state"
import { Anim } from "@/components/icons/animated"

const TONE = { todo: "bg-hover text-text-muted", doing: "bg-review-soft text-review", done: "bg-work-soft text-work" } as const

function TicketView({ ticketKey }: { ticketKey: string }) {
  const now = useNow()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const load = () => get<Ticket>(`/api/jira/ticket?key=${encodeURIComponent(ticketKey)}`).then(t => (setTicket(t), setError(null)), (err: Error) => setError(err.message))
    void load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [ticketKey])
  if (error && !ticket) return <p className="m-0 text-[13px] text-bad">{ticketKey}: {error}</p>
  if (!ticket) return <span className="spinner" />
  const facts = [ticket.type, ticket.priority && `${ticket.priority} priority`, ticket.assignee ? `with ${ticket.assignee}` : "unassigned", ticket.reporter && `by ${ticket.reporter}`].filter(Boolean)
  return (
    <article className="flex flex-col gap-3">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <a href={ticket.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold text-text-muted no-underline hover:text-text" title="Open in Jira">
            {ticket.key}<Anim.ArrowUpRight size={12} />
          </a>
          <span className={cn("rounded-md px-2 py-px text-[11.5px] font-semibold", TONE[ticket.tone])}>{ticket.status}</span>
          <span className="ml-auto text-xs text-faint" title={new Date(ticket.updated).toLocaleString("en-GB")}>updated {ago(ticket.updated, now)} ago</span>
        </div>
        <h3 className="m-0 text-base leading-[1.3] font-semibold">{ticket.summary}</h3>
        <p className="m-0 text-xs text-text-muted">{facts.join(" · ")}</p>
      </header>
      {ticket.description ? <Markdown className="text-[13px]">{ticket.description}</Markdown> : <p className="m-0 text-[13px] text-faint">No description.</p>}
      {ticket.comments.length > 0 && (
        <section className="flex flex-col gap-2.5 border-t border-line pt-3">
          <h4 className="m-0 text-[11.5px] font-bold tracking-[0.05em] text-text-muted uppercase">{ticket.comments.length === 1 ? "1 comment" : `${ticket.comments.length} comments`}</h4>
          {ticket.comments.map((c, i) => (
            <div key={i} className="rounded-[9px] border border-line bg-surface px-3 py-2">
              <div className="mb-1 flex items-baseline gap-2 text-xs"><b className="font-semibold">{c.author}</b><span className="text-faint">{ago(c.at, now)} ago</span></div>
              <Markdown className="text-[12.5px]">{c.body}</Markdown>
            </div>
          ))}
        </section>
      )}
    </article>
  )
}

export function TicketTab({ card }: { card: Card }) {
  const keys = card.tickets.map(t => t.key)
  if (!keys.length) return <p className="grid flex-1 place-items-center p-8 text-text-muted">This session names no ticket.</p>
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-5 py-4">
      {keys.map(k => <TicketView key={k} ticketKey={k} />)}
    </div>
  )
}
