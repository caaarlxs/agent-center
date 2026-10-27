// What a card's "…" menu does to its session: open it in Claude, pin it,
// tell you once when it finishes, run its project, put it off until later,
// mark it done (or reopen it), archive it.
import { Archive, ArrowUpRight, Bell, BellOff, Check, Clock, MoreHorizontal, Play, RotateCcw, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { post } from "@/lib/api"
import type { Card } from "@/lib/api-types"
import { openDialog } from "@/app/open-dialog"
import { toggleWatch, watched } from "@/features/alerts/prefs"
import { type BoardAction, LATER, actOn } from "./actions"

const run = (work: Promise<unknown>, done: string) => work.then(() => toast(done), (err: Error) => toast.error(err.message))

export function CardMenu({ card }: { card: Card }) {
  // Said as the classic board says it, with Undo where it can be taken back (actOn).
  const doIt = (action: BoardAction, _done: string, body?: Record<string, unknown>) => void actOn(card, action, body)
  const isDone = card.column === "done"
  const isWatched = watched.use().includes(card.id)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="nodrag text-muted-foreground" aria-label="Actions" onClick={e => e.stopPropagation()}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => run(post(`/api/sessions/${encodeURIComponent(card.id)}/open`), "Opening in Claude")}><ArrowUpRight />Open in Claude</DropdownMenuItem>
        <DropdownMenuItem onClick={() => doIt(card.pinned ? "unpin" : "pin", card.pinned ? "Unpinned" : "Pinned")}><Star />{card.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggleWatch(card)}>{isWatched ? <BellOff /> : <Bell />}{isWatched ? "Stop telling me" : "Tell me when it finishes"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDialog({ kind: "run", card })}><Play />Run…</DropdownMenuItem>
        {card.column === "parked" ? (
          <DropdownMenuItem onClick={() => doIt("unpark", "Back on the board")}><Clock />Not later</DropdownMenuItem>
        ) : !isDone && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Clock />Later</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {LATER.map(o => <DropdownMenuItem key={o.label} onClick={() => doIt("park", `Later: ${o.label.toLowerCase()}`, { until: o.until() })}>{o.label}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        {isDone ? <DropdownMenuItem onClick={() => doIt("undone", "Reopened")}><RotateCcw />Reopen</DropdownMenuItem>
          : <DropdownMenuItem onClick={() => doIt("done", "Done")}><Check />Mark as done</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => doIt("archive", "Archived")}><Archive />Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
