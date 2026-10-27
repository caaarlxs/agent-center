// The panel of one session, beside the canvas: its state, repo and branch on
// one row with its buttons, its title under them, and the conversation with
// the reply box. Esc closes it.
import { ArrowUpRight, GitBranch, X } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { post } from "@/lib/api"
import { useLive } from "@/lib/live"
import { openSession } from "@/app/open-session"
import { Composer } from "@/features/conversation/Composer"
import { ConversationView } from "@/features/conversation/ConversationView"
import { StateIcon, TONE } from "./StateIcon"
import { STATE_LABEL, hueOf, stateOf } from "./state"

export function SessionPanel({ id }: { id: string }) {
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === id))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && openSession(null)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const openInClaude = () => post(`/api/sessions/${encodeURIComponent(id)}/open`).catch((err: Error) => toast.error(err.message))
  const state = card ? stateOf(card) : null
  return (
    <aside className="flex h-full w-[min(680px,46vw)] min-w-[420px] flex-col border-l bg-card shadow-2xl" aria-label="Session">
      <header className="flex flex-col gap-1.5 border-b px-5 pt-3 pb-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {card && state && <><StateIcon card={card} size={18} /><span className={TONE[state].split(" ")[0]}>{STATE_LABEL[state]}</span></>}
          {card && <span className="inline-flex items-center gap-1.5"><i className="size-[7px] rounded-[2px]" style={{ background: `oklch(0.72 0.14 ${hueOf(card.repo)})` }} />{card.repo}</span>}
          {card?.branch && <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono"><GitBranch className="size-3 shrink-0" />{card.branch}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-500/90" onClick={openInClaude}>Open in Claude<ArrowUpRight /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => openSession(null)} aria-label="Close"><X /></Button>
          </span>
        </div>
        <h2 className="line-clamp-2 text-base font-semibold leading-snug">{card?.title ?? "Conversation"}</h2>
      </header>
      <ConversationView key={id} sessionId={id} />
      {card && <div className="px-4 pb-4"><Composer card={card} /></div>}
    </aside>
  )
}
