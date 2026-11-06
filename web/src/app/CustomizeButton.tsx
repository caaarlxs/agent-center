// "Customize Agent Center" in the sidebar: opens the session you change
// Agent Center from (a right-click on a card picks it, "Use to customize
// Agent Center"). With none picked (or the one picked archived), it offers
// your latest sessions to pick from, or a new session.
import { Wrench } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { post } from "@/lib/api"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"
import { openDialog } from "./open-dialog"
import { openSession } from "./open-session"

const LATEST = 6

export function CustomizeButton({ isSlim }: { isSlim: boolean }) {
  const cards = useLive(l => l.snapshot?.cards)
  const chosen = cards?.find(c => c.isCustomize)
  const look = cn("h-[34px] w-full justify-start gap-2", isSlim && "justify-center gap-0 px-0")
  const label = !isSlim && "Customize Agent Center"
  if (chosen)
    return (
      // data-id: a right-click here offers to stop customizing from it (its card is off the views).
      <Button variant="outline" data-id={chosen.id} className={look} onClick={() => openSession(chosen.id)} title={`Open “${chosen.title}”, the session you customize Agent Center from (right-click: stop; right-click another card: change it)`}>
        <Wrench className="size-3.5" />{label}
      </Button>
    )
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
