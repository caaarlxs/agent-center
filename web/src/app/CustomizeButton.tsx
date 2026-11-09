// "Customize Agent Center" in the sidebar: opens the session you change
// Agent Center from (a right-click on a card picks it, "Use to customize
// Agent Center"). With none picked (or the one picked archived), it offers
// your latest sessions to pick from, or a new session. It lights up as its
// card would: an answer you have not read (blue), a question or an approval
// waiting for you (amber); opening it puts it out.
import { Wrench } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { post } from "@/lib/api"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"
import { openDialog } from "./open-dialog"
import { openSession } from "./open-session"

const LATEST = 6

// What the session wants from you, as its card shows it: a question or an
// approval (amber), else an answer you have not read (blue), else nothing.
export type Call = "asks" | "unread" | null
export const callOf = (card: Pick<Card, "column" | "isUnread">): Call => (card.column === "asking" ? "asks" : card.isUnread ? "unread" : null)
const CALL_TEXT = { asks: "It asks you something", unread: "An answer you have not read" }

export function CustomizeButton({ isSlim }: { isSlim: boolean }) {
  const cards = useLive(l => l.snapshot?.cards)
  const chosen = cards?.find(c => c.isCustomize)
  const look = cn("h-[34px] w-full justify-start gap-2", isSlim && "justify-center gap-0 px-0")
  const label = !isSlim && "Customize Agent Center"
  if (chosen) {
    const kind = callOf(chosen)
    const isAsking = kind === "asks"
    const isUnread = kind === "unread"
    const call = kind && CALL_TEXT[kind]
    return (
      // data-id: a right-click here offers to stop customizing from it (its card is off the views).
      <Button variant="outline" data-id={chosen.id} onClick={() => openSession(chosen.id)}
        className={cn(look, "relative",
          isAsking && "border-ask bg-ask-soft shadow-[0_0_14px_color-mix(in_srgb,var(--ask)_35%,transparent)]",
          isUnread && "border-review bg-review-soft shadow-[0_0_14px_color-mix(in_srgb,var(--review)_35%,transparent)]")}
        title={`${call ? `${call}. ` : ""}Open “${chosen.title}”, the session you customize Agent Center from (right-click: stop; right-click another card: change it)`}>
        <Wrench className="size-3.5" />{label}
        {call && <i className={cn("size-[7px] shrink-0 rounded-full", isSlim ? "absolute top-1 right-1" : "ml-auto", isAsking ? "bg-ask" : "unread-dot bg-review")} aria-label={call} />}
      </Button>
    )
  }
  const latest = [...(cards ?? [])].filter(c => c.column !== "done").sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)).slice(0, LATEST)
  const pick = (id: string) => post(`/api/sessions/${encodeURIComponent(id)}/customize`, { off: false }).then(() => openSession(id), () => toast("Could not pick it"))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn(look, "border-dashed text-text-muted")} title="Pick the session you customize Agent Center from">
          <Wrench className="size-3.5" />{label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-64">
        <DropdownMenuLabel>Customize from…</DropdownMenuLabel>
        {latest.map(c => <DropdownMenuItem key={c.id} onSelect={() => void pick(c.id)}><span className="truncate">{c.title}</span></DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openDialog({ kind: "new" })}>New session…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
