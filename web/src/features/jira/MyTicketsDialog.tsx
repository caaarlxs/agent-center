// "My tickets" (lib/jira.ts): your open Jira tickets, most recently updated
// first; each opens in Jira or starts a new session about it.
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { get } from "@/lib/api"
import type { TicketBrief } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { Anim } from "@/components/icons/animated"
import { promptFor } from "./jira"

const DOT = { todo: "bg-faint", doing: "bg-review", done: "bg-work" } as const

export function MyTicketsDialog({ onClose }: { onClose: () => void }) {
  const [tickets, setTickets] = useState<TicketBrief[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void get<{ tickets: TicketBrief[] }>("/api/jira/mine").then(r => setTickets(r.tickets), (err: Error) => setError(err.message)), [])
  const start = (t: TicketBrief) => openDialog({ kind: "new", draft: { root: null, prompt: promptFor(t), worktree: false, suggestion: { from: t.key, taskId: null } } })
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(78vh,720px)] w-[min(640px,calc(100vw-32px))] flex-col gap-3">
        <DialogTitle className="text-base font-[650]">My tickets</DialogTitle>
        <div className="-mx-2 min-h-0 flex-1 overflow-auto">
          {error ? <p className="m-0 px-2 text-[13px] text-bad">{error}</p>
            : !tickets ? <span className="spinner mx-2" />
            : !tickets.length ? <p className="m-0 px-2 text-[13px] text-text-muted">No open tickets assigned to you.</p>
            : <ul className="m-0 flex list-none flex-col p-0">{tickets.map(t => (
              <li key={t.key} className="group flex min-h-[40px] items-center gap-2.5 rounded-md px-2 hover:bg-hover">
                <i className={cn("size-2 shrink-0 rounded-full", DOT[t.tone])} title={t.status} />
                <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-text-muted no-underline hover:text-text" title="Open in Jira">{t.key}<Anim.ArrowUpRight size={11} /></a>
                <span className="min-w-0 flex-1 truncate text-[13px]" title={t.summary}>{t.summary}</span>
                <span className="shrink-0 text-xs text-faint">{t.status}</span>
                <Button variant="ghost" className="h-7 shrink-0 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => start(t)}>Start session</Button>
              </li>
            ))}</ul>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
