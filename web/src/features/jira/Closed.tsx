// The tickets closed (lib/pipeline.ts closePipeline), the latest first: a button
// on the Pipeline view with how many, and their list; one opens as a ticket.
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { get } from "@/lib/api"
import { openDialog } from "@/app/open-dialog"
import { ago } from "@/features/session/state"
import { useNow } from "@/lib/now"

type ClosedTicket = { key: string; at: number; summary: string | null; stage: string | null; deployed: string[] }
const loadClosed = () => get<{ closed: ClosedTicket[] }>("/api/pipeline/closed").then(r => r.closed, () => [] as ClosedTicket[])
// Where it got: the furthest environment it went to, else the stage it closed at.
const reached = (c: ClosedTicket) => (c.deployed.includes("prod") ? "In prod" : c.deployed.includes("staging") ? "In staging" : c.stage ? `At ${c.stage}` : "")

export function ClosedButton() {
  const [closed, setClosed] = useState<ClosedTicket[]>([])
  const [isOpen, setOpen] = useState(false)
  const now = useNow()
  useEffect(() => void loadClosed().then(setClosed), [isOpen])
  if (!closed.length) return null
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text">
        Closed <span className="text-faint tabular-nums">{closed.length}</span>
      </button>
      {isOpen && (
        <Dialog open onOpenChange={o => !o && setOpen(false)}>
          <DialogContent className="flex max-h-[80vh] w-[min(640px,92vw)] flex-col gap-3">
            <DialogTitle className="text-[15px]">Closed</DialogTitle>
            <ol className="-mx-2 m-0 flex min-h-0 list-none flex-col overflow-auto p-0">
              {closed.map(c => (
                <li key={`${c.key}-${c.at}`}>
                  <button className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors duration-100 hover:bg-hover"
                    onClick={() => (setOpen(false), openDialog({ kind: "ticket", key: c.key }))}>
                    <span className="font-mono text-xs font-semibold text-text-muted">{c.key}</span>
                    <span className="truncate">{c.summary ?? c.key}</span>
                    <span className="text-xs text-faint tabular-nums">{reached(c)} · {ago(c.at, now)} ago</span>
                  </button>
                </li>
              ))}
            </ol>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
