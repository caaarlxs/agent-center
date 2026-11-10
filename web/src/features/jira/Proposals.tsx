// Tickets the stages proposed (lib/proposals.ts): a short list in the
// ticket's section; one opens as it will be in Jira (its fields, and its
// description formatted), where you change it, dismiss it or create it.
// Nothing is created alone. One that waits on a question shows in it.
import { ChevronRight, TicketPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { post } from "@/lib/api"
import { dialog } from "@/app/open-dialog"
import { Markdown } from "@/features/conversation/Markdown"
import type { PipelineState } from "@server/pipeline"
import { KINDS, PRIORITIES, anchorOf, newDescription, ticketsOfYours, waitsOn, type Edit, type Proposal } from "@server/proposals"
import { changed, useConfirm } from "./confirm"

const KIND_WORD: Record<Proposal["kind"], string> = { bug: "Bug", story: "Story", task: "Task", subtask: "Sub-task" }
const Kind = ({ kind }: { kind: Proposal["kind"] }) => <span className="shrink-0 rounded-[4px] bg-hover px-1.5 text-[11px] font-semibold text-text-muted">{KIND_WORD[kind]}</span>

// One proposal a row: its type, title, priority and where it goes; a click opens it.
function Row({ p, anchor, onOpen }: { p: Proposal; anchor: string | null; onOpen: () => void }) {
  return (
    <li>
      <button className="flex w-full min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover" onClick={onOpen}>
        <Kind kind={p.kind} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-text">{p.summary}</span>
        <span className="shrink-0 text-[11.5px] text-faint tabular-nums">{[p.priority, p.status === "created" ? p.created : anchor].filter(Boolean).join(" · ")}</span>
        <ChevronRight size={13} className="shrink-0 text-faint" />
      </button>
    </li>
  )
}

export function Proposed({ state }: { state: PipelineState }) {
  const [openId, setOpenId] = useState<string | null>(null)
  // One that waits on a question still open shows in that question, not here.
  const open = state.status === "needs-info" ? state.questions.map(q => q.id) : []
  const shown = (state.proposals ?? []).filter(p => p.status !== "dismissed" && !waitsOn(p, open))
  const yours = ticketsOfYours(state)
  const picked = shown.find(p => p.id === openId)
  if (!shown.length) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-text-muted"><TicketPlus size={13} />Proposed tickets<span className="font-normal text-faint">{shown.length}</span></span>
      <ul className="-mx-2 m-0 flex list-none flex-col p-0">
        {shown.map(p => <Row key={p.id} p={p} anchor={anchorOf(p, yours)} onOpen={() => setOpenId(p.id)} />)}
      </ul>
      {picked && <ProposalDialog ticketKey={state.key} p={picked} anchor={anchorOf(picked, yours)} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// The tickets an answer would bring: they wait in their question until you answer it; each opens to read.
export function TicketsIfAgreed({ ticketKey, tickets }: { ticketKey: string; tickets: Proposal[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const picked = tickets.find(t => t.id === openId)
  return (
    <div className="flex flex-col gap-1 rounded-[8px] bg-surface px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted"><TicketPlus size={12} />With this proposal, also these tickets</span>
      <ul className="-mx-2 m-0 flex list-none flex-col p-0">
        {tickets.map(t => <Row key={t.id} p={t} anchor={t.linkTo} onOpen={() => setOpenId(t.id)} />)}
      </ul>
      {picked && <ProposalDialog ticketKey={ticketKey} p={picked} anchor={picked.linkTo} isWaiting onClose={() => setOpenId(null)} />}
    </div>
  )
}

type Reply = { created?: string; warning?: string | null }
const DONE: Record<"create" | "dismiss" | "edit", (r: Reply) => string> = {
  dismiss: () => "Dismissed", edit: () => "Saved", create: r => [`${r.created} created`, r.warning].filter(Boolean).join(". "),
}
async function send(ticketKey: string, p: Proposal, action: keyof typeof DONE, edit: Edit = {}) {
  try {
    toast(DONE[action](await post<Reply>("/api/pipeline/proposal", { key: ticketKey, id: p.id, action, ...edit })))
    changed()
    return true
  } catch (err) {
    toast((err as Error).message || "It did not work")
    return false
  }
}

// A proposal as it will be in Jira: its fields above, its description as Jira shows it (what
// the board sends: yours, why it goes apart and where it comes from); or the form to change it.
function ProposalDialog({ ticketKey, p, anchor, isWaiting = false, onClose }: { ticketKey: string; p: Proposal; anchor: string | null; isWaiting?: boolean; onClose: () => void }) {
  const [isEditing, setEditing] = useState(false)
  const act = async (action: keyof typeof DONE, edit?: Edit) => (await send(ticketKey, p, action, edit)) && (action === "edit" ? setEditing(false) : onClose())
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,900px)] w-[min(820px,calc(100vw-32px))] flex-col gap-4">
        <header className="flex flex-col gap-2 pr-8">
          <span className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Kind kind={p.kind} />
            {p.priority && <span className="font-semibold">{p.priority}</span>}
            <span className="text-faint">{p.kind === "subtask" ? "Inside" : "Linked to"} {anchor ?? "—"} · assigned to you</span>
          </span>
          <DialogTitle className="m-0 text-[17px] leading-[1.35] font-[620]">{p.summary}</DialogTitle>
        </header>
        {isEditing ? <Editor p={p} onCancel={() => setEditing(false)} onSave={edit => void act("edit", edit)} />
          : <Markdown isDocument className="-mx-1 min-h-0 flex-1 overflow-auto px-1 text-[13.5px]">{newDescription(p, ticketKey)}</Markdown>}
        {!isEditing && (
          <footer className="flex items-center gap-3 border-t border-line pt-3">
            {p.status === "created" ? <button className="font-mono text-xs font-semibold text-brand hover:underline" onClick={() => dialog.set({ kind: "ticket", key: p.created! })}>{p.created}</button>
              : isWaiting ? <span className="text-xs text-text-muted">It waits for your answer to {p.question}</span>
              : <Actions canCreate={!!anchor} onDismiss={() => void act("dismiss")} onEdit={() => setEditing(true)} onCreate={() => void act("create")} />}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Dismiss it, change it, or create it (a second click confirms).
function Actions({ canCreate, onDismiss, onEdit, onCreate }: { canCreate: boolean; onDismiss: () => void; onEdit: () => void; onCreate: () => void }) {
  const [isAsking, confirm] = useConfirm()
  return (
    <>
      <button className="text-xs font-semibold text-faint hover:text-text" onClick={onDismiss}>Dismiss</button>
      <span className="ml-auto flex items-center gap-2">
        <Button variant="outline" className="h-8 text-xs" onClick={onEdit}>Edit</Button>
        <Button variant={isAsking ? "destructive" : "default"} className="h-8 text-xs" disabled={!canCreate} onClick={() => confirm(onCreate)}>{isAsking ? "Sure? Create in Jira" : "Create in Jira"}</Button>
      </span>
    </>
  )
}

// Its title, type, priority and description (Markdown, as the team's template).
const SELECT = "h-8 rounded-md border border-line bg-surface px-2 text-xs text-text"
function Editor({ p, onCancel, onSave }: { p: Proposal; onCancel: () => void; onSave: (edit: Edit) => void }) {
  const [summary, setSummary] = useState(p.summary)
  const [kind, setKind] = useState(p.kind)
  const [priority, setPriority] = useState(p.priority ?? "")
  const [description, setDescription] = useState(p.description)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Input value={summary} onChange={e => setSummary(e.target.value)} aria-label="Title" className="h-9 text-[13.5px]" />
      <div className="flex gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as Proposal["kind"])} aria-label="Type" className={SELECT}>
          {KINDS.map(k => <option key={k} value={k}>{KIND_WORD[k]}</option>)}
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priority" className={SELECT}>
          <option value="">No priority</option>
          {PRIORITIES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <Textarea value={description} onChange={e => setDescription(e.target.value)} aria-label="Description" className="min-h-[300px] flex-1 font-mono text-xs leading-[1.55]" />
      <div className="flex justify-end gap-2">
        <Button variant="outline" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button className="h-8 text-xs" disabled={!summary.trim()} onClick={() => onSave({ summary, kind, priority: (priority || null) as Edit["priority"], description })}>Save</Button>
      </div>
    </div>
  )
}
