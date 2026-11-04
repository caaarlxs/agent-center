// What kind of work a ticket is, at a glance: a coloured mark per kind, as
// Jira's own (epic purple, story green, task blue, sub-task light blue, bug
// red); and a ticket named from another (its parent, a child, a link) as one row.
import { Bookmark, Bug, Check, CornerDownRight, Zap } from "lucide-react"
import type { TicketKind, TicketRef } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { prefetchTicket } from "./jira"

const KIND = {
  epic: { icon: Zap, color: "bg-[#8b5cf6]", hex: "#8b5cf6", label: "Epic" },
  story: { icon: Bookmark, color: "bg-[#22a06b]", hex: "#22a06b", label: "Story" },
  task: { icon: Check, color: "bg-[#3b82f6]", hex: "#3b82f6", label: "Task" },
  subtask: { icon: CornerDownRight, color: "bg-[#38bdf8]", hex: "#38bdf8", label: "Sub-task" },
  bug: { icon: Bug, color: "bg-[#e5484d]", hex: "#e5484d", label: "Bug" },
} as const

export const kindLabel = (kind: TicketKind) => (KIND[kind] ?? KIND.task).label

// The kind in words, in its colour: "Epic", "Story", "Sub-task".
export function KindName({ kind }: { kind: TicketKind }) {
  const { hex, label } = KIND[kind] ?? KIND.task
  return <span className="shrink-0 rounded px-1.5 py-px text-[10.5px] font-semibold" style={{ color: hex, background: `color-mix(in srgb, ${hex} 15%, transparent)` }}>{label}</span>
}

export const TONE = { todo: "bg-hover text-text-muted", doing: "bg-review-soft text-review", done: "bg-work-soft text-work" } as const

export function KindMark({ kind, type, size = 16 }: { kind: TicketKind; type?: string | null; size?: number }) {
  const { icon: Icon, color, label } = KIND[kind] ?? KIND.task
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-[4px] text-white", color)} style={{ width: size, height: size }} title={type ?? label}>
      <Icon size={Math.round(size * 0.66)} strokeWidth={2.6} />
    </span>
  )
}

// Another ticket, as a row: its kind, key, summary and status; a click opens it.
export function TicketRefRow({ ticket, note, className }: { ticket: TicketRef; note?: string; className?: string }) {
  return (
    <button className={cn("flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-hover", className)} onPointerEnter={() => prefetchTicket(ticket.key)} onClick={() => openDialog({ kind: "ticket", key: ticket.key })} title={`${ticket.key} · ${ticket.summary}`}>
      <KindMark kind={ticket.kind} type={ticket.type} size={15} />
      <span className="shrink-0 font-mono text-xs font-semibold text-text-muted">{ticket.key}</span>
      {note && <span className="shrink-0 text-xs text-faint">{note}</span>}
      <span className={cn("min-w-0 flex-1 truncate", ticket.tone === "done" && "text-text-muted line-through decoration-faint")}>{ticket.summary}</span>
      <span className={cn("shrink-0 rounded px-1.5 text-[11px] font-semibold", TONE[ticket.tone])}>{ticket.status}</span>
    </button>
  )
}
