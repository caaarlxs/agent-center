// "Your part" (lib/your-part.ts): what a person does by hand for the ticket,
// as a guide an agent wrote once the plan was done. A row opens it; each
// section says when, why, where and how, step by step, with what to copy, and
// shows done once the board sees it done. Each section, and each step for a
// person in the deploy, opens a chat of yours that goes on until it is done.
import { Check, ChevronRight, MessageSquare } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { cn } from "@/lib/utils"
import { openSession } from "@/app/open-session"
import { Markdown } from "@/features/conversation/Markdown"
import type { Release } from "@server/release"
import type { PartSection, YourPart } from "@server/your-part"
import { useStageData } from "./stage-data"
import { act, sendWithFeedback } from "./feedback"

// A chat on a step (by the plan's id) or a section (by its place): a session of yours, opened.
export function ChatButton({ ticketKey, step, section, className }: { ticketKey: string; step?: string; section?: number; className?: string }) {
  const [isStarting, setStarting] = useState(false)
  const start = async () => {
    setStarting(true)
    const r = await sendWithFeedback<{ id: string }>("/api/pipeline/chat", { key: ticketKey, step, section }, "Chat started")
    setStarting(false)
    if (r?.id) setTimeout(() => openSession(r.id), 600)
  }
  return (
    <button disabled={isStarting} className={cn("inline-flex items-center gap-1 self-start text-xs font-semibold text-faint hover:text-text disabled:opacity-50", className)} onClick={() => void start()}>
      <MessageSquare size={12} />Continue in chat
    </button>
  )
}

// The row that opens it: written, being written, out of date, or failed.
export function YourPartRow({ ticketKey, release }: { ticketKey: string; release: Release | null }) {
  const { yourPart: info, reload } = useStageData()
  const [isOpen, setOpen] = useState(false)
  if (!info) return null
  const write = () => void act("/api/pipeline/your-part", { key: ticketKey }, "An agent writes your part").then(ok => ok && reload?.())
  const done = info.part ? info.part.sections.filter(s => doneOf(s, release)).length : 0
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] bg-ask-soft px-3 py-2 text-[13px]">
      {info.part
        ? <button className="inline-flex items-center gap-1.5 font-semibold text-text" onClick={() => setOpen(true)}>Your part<span className="font-normal text-text-muted">· {done} of {info.part.sections.length} done</span><ChevronRight size={13} /></button>
        : <span className="font-semibold text-text">Your part</span>}
      {info.isWriting
        ? <Shimmer as="span" duration={2.2} className="text-xs [--color-background:var(--text)] [--color-muted-foreground:var(--text-muted)]">An agent writes it</Shimmer>
        : (!info.part || info.isStale || info.error) && (
          <span className="flex items-center gap-2 text-xs">
            {info.error ? <span className="text-bad">{info.error}</span> : info.isStale ? <span className="text-text-muted">The plan changed its steps</span> : null}
            <button className="font-semibold text-faint hover:text-text" onClick={write}>{info.part ? "Write it again" : "Write it"}</button>
          </span>
        )}
      {isOpen && info.part && <PartDialog ticketKey={ticketKey} part={info.part} release={release} onClose={() => setOpen(false)} />}
    </div>
  )
}

function PartDialog({ ticketKey, part, release, onClose }: { ticketKey: string; part: YourPart; release: Release | null; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,1000px)] w-[min(860px,calc(100vw-32px))] flex-col gap-3">
        <DialogTitle className="text-[15px] font-semibold">Your part · {ticketKey}</DialogTitle>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-1">
          {part.intro && <Markdown className="text-[13.5px] text-text-muted">{part.intro}</Markdown>}
          <ol className="m-0 flex list-none flex-col gap-5 p-0">
            {part.sections.map((s, i) => <SectionView key={i} ticketKey={ticketKey} section={s} index={i} done={doneOf(s, release)} />)}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// What the board says of the section's step: done (and how it knows), or nothing yet.
function doneOf(section: PartSection, release: Release | null) {
  const step = section.step ? release?.steps.find(s => s.note?.id === section.step) : undefined
  return step?.status === "done" ? (step.detail ?? "Done") : null
}

function SectionView({ ticketKey, section, index, done }: { ticketKey: string; section: PartSection; index: number; done: string | null }) {
  const [isOpen, setOpen] = useState(!done)
  return (
    <li className="flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <button className="flex items-baseline gap-2 text-left" onClick={() => setOpen(o => !o)}>
        <span className={cn("grid size-[18px] shrink-0 translate-y-[2px] place-items-center rounded-full text-[11px] font-semibold", done ? "bg-work text-background" : "bg-ask-soft text-ask")}>{done ? <Check size={11} strokeWidth={3} /> : index + 1}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("text-[14px] font-semibold", done ? "text-text-muted" : "text-text")}>{section.title}</span>
          <span className="text-xs text-faint">{done ?? section.when}</span>
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col gap-3 pl-[26px] text-[13px] leading-[1.5]">
          {section.context && <Markdown className="text-[13px] text-text-muted">{section.context}</Markdown>}
          {section.where.length > 0 && (
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {section.where.map(w => <a key={w.url} href={w.url} target="_blank" rel="noreferrer" className="font-semibold text-brand no-underline hover:underline">{w.label}</a>)}
            </span>
          )}
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 marker:text-faint">
            {section.steps.map((s, i) => <li key={i}><Markdown className="text-[13px]">{s}</Markdown></li>)}
          </ol>
          {section.done && <p className="m-0"><span className="font-semibold">Done when</span> <span className="text-text-muted">{section.done}</span></p>}
          {section.unlocks && <p className="m-0"><span className="font-semibold">It unlocks</span> <span className="text-text-muted">{section.unlocks}</span></p>}
          <ChatButton ticketKey={ticketKey} section={index} />
        </div>
      )}
    </li>
  )
}
