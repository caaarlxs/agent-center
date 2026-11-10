// Send it back: to Refine, Plan or Build, from wherever it waits, with what you write and
// what people wrote in Jira since its last run. That stage goes on in its own conversation
// (it remembers the ticket and what it decided), then the ones after it.
import { Undo2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { ago } from "@/features/session/state"
import type { AgentStage, PipelineState } from "@server/pipeline"
import { changed } from "./confirm"
import { sendWithFeedback } from "./feedback"
import { BACK, BACK_NAMES, backDefault, backLine, canGoBack, deployedTo } from "./send-back"

export function SendBack({ state, now }: { state: PipelineState; now: number }) {
  const [isOpen, setOpen] = useState(false)
  const news = state.news?.comments.length ?? 0
  return (
    <>
      <Button variant="outline" className={cn("h-7 shrink-0 gap-1.5 text-xs", news > 0 && "border-ask text-ask")} onClick={() => setOpen(true)}>
        <Undo2 size={12} />Send back
      </Button>
      {isOpen && <SendBackDialog state={state} now={now} onClose={() => setOpen(false)} />}
    </>
  )
}

function SendBackDialog({ state, now, onClose }: { state: PipelineState; now: number; onClose: () => void }) {
  const [stage, setStage] = useState<AgentStage>(() => backDefault(state))
  const [note, setNote] = useState("")
  const [isBusy, setBusy] = useState(false)
  const envs = deployedTo(state)
  const send = async () => {
    if (isBusy) return
    setBusy(true)
    const ok = await sendWithFeedback("/api/pipeline/back", { key: state.key, stage, note }, `Back to ${BACK_NAMES[stage]}`)
    setBusy(false)
    if (ok) (changed(), onClose())
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(85vh,760px)] w-[min(560px,calc(100vw-32px))] flex-col gap-4"
        onKeyDown={e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), void send())}>
        <DialogTitle className="m-0 text-[16px] font-[620]">Send {state.key} back</DialogTitle>
        <div className="flex flex-col gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={stage} onValueChange={v => v && setStage(v as AgentStage)} className="self-start">
            {BACK.map(s => <ToggleGroupItem key={s} value={s} disabled={!canGoBack(state, s)} className="px-3 text-xs">{BACK_NAMES[s]}</ToggleGroupItem>)}
          </ToggleGroup>
          <p className="m-0 text-[12.5px] leading-[1.5] text-text-muted">{backLine(state, stage)}</p>
          {envs.length > 0 && stage !== "refine" && <p className="m-0 text-[12.5px] leading-[1.5] text-text-muted">What runs in {envs.join(" and ")} stays: the changes go in new PRs.</p>}
        </div>
        {state.news?.comments.length ? (
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-semibold text-ask">New in Jira since the last run</span>
            <ul className="m-0 flex max-h-[220px] list-none flex-col gap-2 overflow-auto rounded-[8px] bg-surface p-0 px-3 py-2">
              {state.news.comments.map(c => (
                <li key={c.at} className="flex flex-col gap-0.5 text-[12.5px]">
                  <span className="text-faint tabular-nums"><span className="font-semibold text-text-muted">{c.author}</span> · {ago(c.at, now)}</span>
                  <span className="line-clamp-4 whitespace-pre-wrap text-text">{c.body}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="What changes"
          className="max-h-[260px] min-h-[96px] resize-none rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] leading-[1.55] outline-none [field-sizing:content] focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]" />
        <footer className="flex items-center justify-end gap-2.5">
          <Kbd>⌘↵</Kbd>
          <Button variant="outline" className="h-8 text-xs" disabled={isBusy} onClick={onClose}>Cancel</Button>
          <Button className="h-8 gap-1.5 text-xs" disabled={isBusy} onClick={() => void send()}>
            {isBusy && <Spinner className="size-3.5" />}Send back to {BACK_NAMES[stage]}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
