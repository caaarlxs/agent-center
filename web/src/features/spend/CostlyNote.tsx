// Over the reply box of a conversation that is costly now (spend.ts): one that
// re-reads too much at each step (what one more step costs), or one idle for an
// hour whose cache has expired (what waking it costs). While its cache is
// alive, Compact: /compact, a summary the same model writes from all it saw,
// for a few cents. Once it has expired, compacting would write it all again,
// so Start fresh: the board writes a handoff note from this conversation
// (lib/handoff.ts) without waking it, and starts a new session in the same folder, with the same model and
// mode, that picks up the work; it opens once started. Hidden with ×, the
// step note comes back once the conversation grows 150K more; the cold note,
// the next time it goes cold.
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import type { Card } from "@/lib/api-types"
import { post } from "@/lib/api"
import { toast } from "@/lib/notify"
import { persistedStore } from "@/lib/store"
import { openSession } from "@/app/open-session"
import { sendMessage } from "@/features/conversation/send"
import { costlyNow, hideKey, hideValue, isHidden, money, tokens } from "./spend"

const BUTTON = "h-6 shrink-0 rounded-md bg-ask px-2 text-[11.5px] font-semibold text-surface hover:brightness-108 disabled:opacity-60"
// session → its context when hidden; `cold:` + session → its last step when hidden.
const hidden = persistedStore<Record<string, number>>("costlyHidden", {})

// A clock that ticks every minute: an open conversation goes cold while you look.
function useMinute() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

// Start fresh: the handoff note is written, the new session starts and opens.
function useStartFresh(card: Card) {
  const [isStarting, setStarting] = useState(false)
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
  return { start, isStarting }
}

export function CostlyNote({ card }: { card: Card }) {
  const { start, isStarting } = useStartFresh(card)
  const hiddenAt = hidden.use()
  const now = useMinute()
  const usage = card.usage
  const why = usage && costlyNow(usage.context, usage.modelAt, now)
  if (!usage || !why) return null
  const key = hideKey(why, card.id)
  if (isHidden(why, hiddenAt[key], usage)) return null
  const compact = () => sendMessage(card.id, "/compact", "Compacting the conversation").catch(err => toast.error((err as Error).message || "Could not compact"))
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-ask-soft px-2.5 py-1.5 text-[12px] text-text">
      <span aria-hidden>⚠</span>
      <span className="min-w-0 flex-1">
        {why === "cold" ? (
          <>Idle for over an hour: the next message writes <b className="tabular-nums">{tokens(usage.context)}</b> tokens to the cache again (<b className="tabular-nums">{money(usage.wakeCost)}</b>).</>
        ) : (
          <>Each step re-reads <b className="tabular-nums">{tokens(usage.context)}</b> tokens (<b className="tabular-nums">{money(usage.stepCost)}</b> a step).</>
        )}
      </span>
      {why === "cold" ? (
        <button className={BUTTON} onClick={start} disabled={isStarting}
          title="A new session in the same folder, with the same model and mode, that picks up this work from a handoff note (this one is not woken)">{isStarting ? "Starting…" : "Start fresh"}</button>
      ) : (
        <button className={BUTTON} onClick={compact} title="/compact: the conversation goes on from a summary of itself, while its cache is alive">Compact</button>
      )}
      <button className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text" aria-label="Hide"
        onClick={() => hidden.set({ ...hidden.get(), [key]: hideValue(why, usage) })}><X className="size-3.5" /></button>
    </div>
  )
}
