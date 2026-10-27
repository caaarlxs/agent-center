// What a card's "…" menu does to its session: open it in Claude, pin it,
// put it off until later, mark it done (or reopen it), archive it.
import { Archive, ArrowUpRight, Check, Clock, MoreHorizontal, RotateCcw, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { post } from "@/lib/api"
import type { Card } from "@/lib/api-types"
import { type BoardAction, LATER, act } from "./actions"

const run = (work: Promise<unknown>, done: string) => work.then(() => toast(done), (err: Error) => toast.error(err.message))

export function CardMenu({ card }: { card: Card }) {
  const doIt = (action: BoardAction, done: string, body?: Record<string, unknown>) => run(act(card.id, action, body), done)
  const isDone = card.column === "done"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="nodrag text-muted-foreground" aria-label="Actions" onClick={e => e.stopPropagation()}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => run(post(`/api/sessions/${encodeURIComponent(card.id)}/open`), "Opening in Claude")}><ArrowUpRight />Open in Claude</DropdownMenuItem>
        <DropdownMenuItem onClick={() => doIt(card.pinned ? "unpin" : "pin", card.pinned ? "Unpinned" : "Pinned")}><Star />{card.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
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
