// Over the reply box of a conversation that re-reads too much at each step
// (spend.ts): what one more step costs, and Start fresh, a new session in
// the same folder that picks up the work reading only the end of this one.
// Hidden with ×, it comes back once the conversation grows 150K more.
import { X } from "lucide-react"
import type { Card } from "@/lib/api-types"
import { persistedStore } from "@/lib/store"
import { openDialog } from "@/app/open-dialog"
import { freshStart, isExpensive, money, tokens } from "./spend"

const AGAIN_AFTER = 150_000
const hidden = persistedStore<Record<string, number>>("costlyHidden", {}) // session → its context when hidden

export function CostlyNote({ card }: { card: Card }) {
  const at = hidden.use()[card.id]
  const usage = card.usage
  if (!usage || !isExpensive(usage.context) || (at !== undefined && usage.context < at + AGAIN_AFTER)) return null
  const start = () => openDialog({ kind: "new", draft: { root: card.repoRoot ?? null, prompt: freshStart({ id: card.id, title: card.title }), worktree: false } })
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-ask-soft px-2.5 py-1.5 text-[12px] text-text">
      <span aria-hidden>⚠</span>
      <span className="min-w-0 flex-1">
        Each step re-reads <b className="tabular-nums">{tokens(usage.context)}</b> tokens (<b className="tabular-nums">{money(usage.stepCost)}</b> a step).
      </span>
      <button className="h-6 shrink-0 rounded-md bg-ask px-2 text-[11.5px] font-semibold text-surface hover:brightness-108" onClick={start}
        title="A new session in the same folder that picks up this work, reading only the end of this conversation">Start fresh</button>
      <button className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text" aria-label="Hide"
        onClick={() => hidden.set({ ...hidden.get(), [card.id]: usage.context })}><X className="size-3.5" /></button>
    </div>
  )
}
