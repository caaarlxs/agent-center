// "Done", at the canvas's foot: drop a card on it to mark it done; the done
// sessions as chips (a click opens one, its menu reopens or archives it), and
// Archive all.
import { Archive, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { act } from "@/features/session/actions"
import { CardMenu } from "@/features/session/CardMenu"

export const DONE_DOCK = "done-dock" // its id, for the drop test

export function DoneDock({ cards, isTarget }: { cards: Card[]; isTarget: boolean }) {
  const archiveAll = () =>
    Promise.all(cards.map(c => act(c.id, "archive"))).then(() => toast(`${cards.length} archived`), (err: Error) => toast.error(err.message))
  return (
    <div id={DONE_DOCK}
      className={cn("pointer-events-auto flex min-h-11 items-center gap-2 overflow-x-auto rounded-xl border border-dashed bg-background/80 px-3 py-1.5 text-xs backdrop-blur transition-colors",
        isTarget && "border-emerald-400 bg-emerald-400/10")}>
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-muted-foreground"><Check className="size-3.5" />Done<span className="font-normal">{cards.length || ""}</span></span>
      {!cards.length && <span className="text-muted-foreground">Drop a card here to mark it done</span>}
      {cards.map(c => (
        <span key={c.id} className="flex shrink-0 items-center rounded-md border bg-card pl-2">
          <button className="max-w-48 truncate py-1" onClick={() => openSession(c.id)} title={c.title}>{c.title}</button>
          <CardMenu card={c} />
        </span>
      ))}
      {cards.length > 0 && <Button size="xs" variant="ghost" className="ml-auto shrink-0 text-muted-foreground" onClick={archiveAll}><Archive />Archive all</Button>}
    </div>
  )
}
