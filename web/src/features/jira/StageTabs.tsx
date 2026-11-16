// The stages of a ticket and the ticket itself, as tabs: each stage marked by
// its state (done, at work, waiting for you, failed, next, ahead).
import { AlertTriangle, Check, FileText } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { Stage } from "@server/pipeline"
import { STAGE_KEYS, STAGES, type Tone } from "./pipeline-board"

export type Tab = Stage | "ticket"

const DOT: Record<Exclude<Tone, "done" | "bad">, string> = {
  work: "bg-work animate-pulse",
  ask: "bg-ask",
  next: "bg-brand",
  todo: "border-[1.5px] border-line-strong",
}
function Mark({ tone }: { tone: Tone }) {
  if (tone === "done") return <Check size={13} strokeWidth={2.6} className="text-work" />
  if (tone === "bad") return <AlertTriangle size={12} className="text-bad" />
  return <span className="grid size-[13px] place-items-center"><i className={cn("size-1.5 rounded-full", DOT[tone])} /></span>
}

function TabButton({ isOn, onPick, children }: { isOn: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button role="tab" aria-selected={isOn} onClick={onPick}
      className={cn("relative inline-flex h-9 shrink-0 items-center gap-1.5 px-2 text-[12.5px] font-[550] transition-colors duration-120",
        isOn ? "text-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-text" : "text-text-muted hover:text-text")}>
      {children}
    </button>
  )
}

// tones: one a stage (tonesOf).
export function StageTabs({ tones, picked, onPick }: { tones: Tone[]; picked: Tab; onPick: (tab: Tab) => void }) {
  return (
    <nav role="tablist" className="flex items-center gap-0.5 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {STAGE_KEYS.map((stage, i) => (
        <TabButton key={stage} isOn={picked === stage} onPick={() => onPick(stage)}>
          <Mark tone={tones[i]!} />{STAGES[i]}
        </TabButton>
      ))}
      <span className="ml-auto" />
      <TabButton isOn={picked === "ticket"} onPick={() => onPick("ticket")}><FileText size={13} />Ticket</TabButton>
    </nav>
  )
}
