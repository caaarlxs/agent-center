// The sidebar's view entries (sidebar.js nav): Inbox with what is new and
// what asks you, Board, Canvas and Tiers; keys 1 2 3 4. Folded, icons only.
import { Inbox, Kanban, LayoutDashboard, ListOrdered } from "lucide-react"
import { cn } from "@/lib/utils"
import type { View } from "./order"
import { setView, useBoardCards } from "./state"
import { useShownView } from "./MainView"

const ENTRIES: { view: View; label: string; title: string; icon: typeof Inbox }[] = [
  { view: "inbox", label: "Inbox", title: "Inbox (1)", icon: Inbox },
  { view: "board", label: "Board", title: "Board (2)", icon: Kanban },
  { view: "canvas", label: "Canvas", title: "Canvas (3)", icon: LayoutDashboard },
  { view: "tiers", label: "Tiers", title: "Tiers: sessions by importance (4)", icon: ListOrdered },
]

const pill = "inline-flex h-[18px] min-w-5 items-center justify-center rounded-[9px] px-1.5 text-[11px] font-[650] tabular-nums"

export function ViewNav({ isFolded }: { isFolded: boolean }) {
  const view = useShownView()
  const cards = useBoardCards()
  const asking = cards.filter(c => c.column === "asking").length
  const unread = cards.filter(c => c.isUnread && c.column !== "done").length
  return (
    <>
      {ENTRIES.map(e => (
        <button key={e.view} onClick={() => setView(e.view)} title={e.title}
          className={cn("relative flex h-[30px] w-full items-center gap-[9px] rounded-[7px] px-2 text-left font-medium transition-colors duration-100",
            view === e.view ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-text-muted hover:bg-hover hover:text-text", isFolded && "justify-center px-0")}>
          <e.icon className="size-4 flex-none" />{!isFolded && e.label}
          {e.view === "inbox" && unread > 0 && !isFolded && <span className={cn(pill, "ml-auto bg-brand-soft text-brand")} title="Updated since you last looked">{unread} new</span>}
          {e.view === "inbox" && asking > 0 && (
            <span className={cn(pill, "bg-ask-soft text-ask", isFolded ? "absolute top-px right-0.5 h-[15px] min-w-4 px-1 text-[10px]" : unread > 0 ? "ml-1" : "ml-auto")} title="Asking you something">{asking}</span>
          )}
        </button>
      ))}
    </>
  )
}
