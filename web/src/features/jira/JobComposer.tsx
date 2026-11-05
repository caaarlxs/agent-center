// A job for a specialist, written where its cards go. What you paste (a
// ticket, its link, PR links: any of them, as many times as you like) turns
// into rows at once; the board looks them up: the ticket's title, each PR's,
// and what you left out (the ticket the PRs name, the open PRs that name the
// ticket or its children). Untick what it should not take; Enter sends it, Esc lets it go.
import { useEffect, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { get } from "@/lib/api"
import { cn } from "@/lib/utils"
import { repoDot } from "@/features/session/state"
import type { Resolved } from "@server/jobs"
import type { AgentStage } from "@server/pipeline"
import { act } from "./Pipeline"
import { SPECIALISTS, addToDraft, jobToSend, sendText, type Draft } from "./jobs-board"

const LOOKUP_MS = 350

// The draft, looked up a moment after it last changed.
function useResolved(stage: AgentStage, draft: Draft) {
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [isLooking, setLooking] = useState(false)
  useEffect(() => {
    if (!draft.ticket && !draft.prs.length) return setResolved(null)
    let isCurrent = true
    setLooking(true)
    const query = new URLSearchParams([["stage", stage], ...(draft.ticket ? [["ticket", draft.ticket]] : []), ...draft.prs.map(p => ["pr", p])])
    const timer = setTimeout(() => void get<Resolved>(`/api/jobs/resolve?${query}`)
      .then(r => isCurrent && setResolved(r), () => isCurrent && setResolved(null))
      .finally(() => isCurrent && setLooking(false)), LOOKUP_MS)
    return () => ((isCurrent = false), clearTimeout(timer))
  }, [stage, draft.ticket, draft.prs.join(" ")])
  return { resolved, isLooking }
}

const Remove = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} aria-label={label} className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-text"><X size={12} /></button>
)

function TicketRow({ ticket, summary, isNamed, onRemove }: { ticket: string; summary: string | null; isNamed: boolean; onRemove: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md bg-side px-2 py-1.5" title={isNamed ? "Named in the PRs" : undefined}>
      <span className={cn("shrink-0 font-mono text-[11.5px] font-semibold", isNamed ? "text-text-muted" : "text-brand")}>{ticket}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-muted">{summary ?? ""}</span>
      {!isNamed && <Remove label={`Remove ${ticket}`} onClick={onRemove} />}
    </li>
  )
}

function PrRow({ pr, isOn, onToggle }: { pr: Resolved["prs"][number]; isOn: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1" title={pr.isFound ? "Names the ticket" : undefined}>
        <input type="checkbox" checked={isOn} onChange={onToggle} className="size-3.5 shrink-0 cursor-pointer accent-(--brand)" />
        <i className="size-[7px] shrink-0 rounded-[2px]" style={{ background: repoDot(pr.repo) }} />
        <span className={cn("shrink-0 text-[12px] font-semibold", isOn ? "text-text" : "text-faint")}>{pr.repo} #{pr.number}</span>
        <span className={cn("min-w-0 flex-1 truncate text-[12px]", isOn ? "text-text-muted" : "text-faint")}>{pr.title}</span>
      </label>
    </li>
  )
}

export function JobComposer({ stage, onDone }: { stage: AgentStage; onDone: () => void }) {
  const takesPrs = stage === "review"
  const [text, setText] = useState("")
  const [draft, setDraft] = useState<Draft>({ ticket: null, prs: [] })
  const [dropped, setDropped] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const { resolved, isLooking } = useResolved(stage, draft)
  const sent = jobToSend(draft, resolved, dropped)
  const isEmpty = !draft.ticket && !draft.prs.length
  const canSend = !isLooking && !resolved?.error && (takesPrs ? sent.prs.length > 0 : !!resolved?.ticket)
  const add = (pasted: string) => {
    const next = addToDraft(draft, pasted, takesPrs)
    setError(next.error)
    if (!next.error) (setDraft(next.draft), setText(""))
  }
  const send = async () => {
    if (!canSend) return
    if (await act("/api/jobs/start", { stage, ...sent }, `${SPECIALISTS.find(s => s.stage === stage)?.name}: on it`)) onDone()
  }
  const paste = (e: ClipboardEvent<HTMLInputElement>) => (e.preventDefault(), add(`${text} ${e.clipboardData.getData("text")}`))
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return onDone()
    if (e.key === "Enter") return void (e.preventDefault(), text.trim() ? add(text) : send())
    if (e.key === "Backspace" && !text && draft.prs.length) setDraft(d => ({ ...d, prs: d.prs.slice(0, -1) }))
  }
  const toggle = (url: string) => setDropped(d => (d.includes(url) ? d.filter(u => u !== url) : [...d, url]))
  const ticket = resolved?.ticket ?? (draft.ticket ? { key: draft.ticket, summary: null, isNamed: false } : null)
  const status = error ?? resolved?.error ?? (resolved && takesPrs && !resolved.prs.length ? `No open PR names ${resolved.ticket?.key ?? "the ticket"}` : null)
  return (
    <div className="flex flex-none flex-col gap-2 rounded-[10px] border border-line-strong bg-surface p-2.5 shadow-card">
      <input autoFocus value={text} onChange={e => (setText(e.target.value), setError(null))} onPaste={paste} onKeyDown={key}
        onBlur={() => isEmpty && !text.trim() && onDone()}
        placeholder={takesPrs ? (isEmpty ? "Paste PR links or a ticket" : "Paste more") : "Paste a ticket"} aria-label={takesPrs ? "PR links or a ticket" : "A ticket"}
        className="h-7 bg-transparent px-0.5 text-[13px] outline-none placeholder:text-faint" />
      {(ticket || draft.prs.length > 0 || (resolved?.prs.length ?? 0) > 0) && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {ticket && <TicketRow ticket={ticket.key} summary={ticket.summary} isNamed={ticket.isNamed} onRemove={() => setDraft(d => ({ ...d, ticket: null }))} />}
          {(resolved?.prs ?? []).map(p => <PrRow key={p.url} pr={p} isOn={!dropped.includes(p.url)} onToggle={() => toggle(p.url)} />)}
        </ul>
      )}
      <div className="flex min-h-6 items-center gap-2">
        {isLooking ? <Shimmer as="span" duration={1.6} className="min-w-0 flex-1 truncate text-[11.5px] [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">Looking up</Shimmer>
          : <span className="min-w-0 flex-1 truncate text-[11.5px] text-bad">{status}</span>}
        {!isEmpty && (
          <button disabled={!canSend} onClick={() => void send()}
            className="h-6 shrink-0 rounded-md bg-text px-2 text-[11.5px] font-semibold text-surface transition-[opacity,transform] duration-100 active:scale-[0.97] disabled:opacity-30">
            {sendText(stage, sent.prs.length)}
          </button>
        )}
      </div>
    </div>
  )
}
