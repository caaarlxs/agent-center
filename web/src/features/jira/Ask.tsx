// Asking the agent about one thing its run left (a question, a test's result, a
// review's finding): it answers in its own session, so it knows the ticket, the
// code and what it did. The thread stays on the ticket. ↵ sends.
import { useState, type KeyboardEvent } from "react"
import { toast } from "@/lib/notify"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { post } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Markdown } from "@/features/conversation/Markdown"
import type { Turn } from "@server/pipeline"

const WAIT_MS = 5 * 60_000
// A question still without its answer (a restart of the board lets it go after a while).
export const isWaiting = (turns: Turn[] = [], now = Date.now()) => {
  const last = turns.at(-1)
  return !!last && last.a === null && !last.error && now - last.at < WAIT_MS
}

export function Ask({ ticketKey, about, turns = [], className }: { ticketKey: string; about: string; turns?: Turn[]; className?: string }) {
  const [isOpen, setOpen] = useState(turns.length > 0)
  const [text, setText] = useState("")
  const waiting = isWaiting(turns)
  const send = async () => {
    if (!text.trim() || waiting) return
    try {
      await post("/api/pipeline/ask", { key: ticketKey, about, text })
      setText("")
    } catch (err) {
      toast((err as Error).message || "It did not work")
    }
  }
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())
  if (!isOpen) return <button className={cn("self-start text-xs font-semibold text-faint hover:text-text", className)} onClick={() => setOpen(true)}>Ask</button>
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-[8px] bg-side px-3 py-2.5", className)}>
      {turns.map(t => (
        <div key={t.at} className="flex flex-col gap-1">
          <p className="m-0 text-[12.5px] font-semibold text-text">{t.q}</p>
          {t.a ? <Markdown className="text-[13px] text-text-muted">{t.a}</Markdown>
            : t.error ? <p className="m-0 text-[12.5px] text-bad">{t.error}</p>
            : <Shimmer as="span" duration={1.6} className="text-[12.5px] [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">Thinking</Shimmer>}
        </div>
      ))}
      <textarea autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={key} rows={1} disabled={waiting}
        placeholder={turns.length ? "Ask more" : "What do you want to know about this?"}
        className="min-h-[34px] resize-none rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[13px] leading-[1.45] outline-none [field-sizing:content] placeholder:text-faint focus:border-line-strong disabled:opacity-50" />
    </div>
  )
}
