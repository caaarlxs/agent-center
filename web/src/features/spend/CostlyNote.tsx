// Over the reply box of a conversation that re-reads too much at each step
// (spend.ts): what one more step costs, and Start fresh: the board writes a
// handoff note from this conversation (lib/handoff.ts) and starts a new
// session in the same folder, with the same model and mode, that picks up
// the work; it opens once started. Hidden with ×, the note comes back once
// the conversation grows 150K more.
import { X } from "lucide-react"
import { useState } from "react"
import type { Card } from "@/lib/api-types"
import { post } from "@/lib/api"
import { toast } from "@/lib/notify"
import { persistedStore } from "@/lib/store"
import { openSession } from "@/app/open-session"
import { isExpensive, money, tokens } from "./spend"

const AGAIN_AFTER = 150_000
const hidden = persistedStore<Record<string, number>>("costlyHidden", {}) // session → its context when hidden

export function CostlyNote({ card }: { card: Card }) {
  const at = hidden.use()[card.id]
  const [isStarting, setStarting] = useState(false)
  const usage = card.usage
  if (!usage || !isExpensive(usage.context) || (at !== undefined && usage.context < at + AGAIN_AFTER)) return null
  const start = async () => {
    setStarting(true)
    const waiting = toast.loading("Writing the handoff note…", { description: "From this conversation, without waking it" })
    try {
      const res = await post<{ ok: boolean; id: string }>(`/api/sessions/${encodeURIComponent(card.id)}/fresh`)
      toast.success("Started fresh: Claude is reading the note", { id: waiting, description: `It picks up “${card.title}”`, action: { label: "Open", onClick: () => openSession(res.id) } })
      setTimeout(() => openSession(res.id), 600)
    } catch (err) {
      toast.error((err as Error).message || "Could not start fresh", { id: waiting })
    }
    setStarting(false)
  }
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-ask-soft px-2.5 py-1.5 text-[12px] text-text">
      <span aria-hidden>⚠</span>
      <span className="min-w-0 flex-1">
        Each step re-reads <b className="tabular-nums">{tokens(usage.context)}</b> tokens (<b className="tabular-nums">{money(usage.stepCost)}</b> a step).
      </span>
      <button className="h-6 shrink-0 rounded-md bg-ask px-2 text-[11.5px] font-semibold text-surface hover:brightness-108 disabled:opacity-60" onClick={start} disabled={isStarting}
        title="A new session in the same folder, with the same model and mode, that picks up this work from a handoff note (this one is not woken)">{isStarting ? "Starting…" : "Start fresh"}</button>
      <button className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text" aria-label="Hide"
        onClick={() => hidden.set({ ...hidden.get(), [card.id]: usage.context })}><X className="size-3.5" /></button>
    </div>
  )
}
