// The passes of a stage, in a row you see at once: each with its name (Pass 2,
// Deploy 1, Next), its day, whether it failed, and why it ran (on hover); the
// one shown stands out. A click shows it.
import { AlertTriangle, CircleCheck, CircleDashed } from "lucide-react"
import { cn } from "@/lib/utils"

// at: when it started (none: one still to come, as the release at the door); label: its name, else "Pass n".
export type Pass = { key: number; at: number | null; isFailed?: boolean; why?: string | null; label?: string }

const day = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
const nameOf = (pass: Pass, i: number) => pass.label ?? (pass.at === null ? "Next" : `Pass ${i + 1}`)

export function PassPicker({ passes, picked, onPick }: { passes: Pass[]; picked: number; onPick: (key: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Passes">
      {passes.map((p, i) => {
        const Icon = p.at === null ? CircleDashed : p.isFailed ? AlertTriangle : CircleCheck
        const isPicked = p.key === picked
        return (
          <button key={p.key} role="tab" aria-selected={isPicked} title={p.why ?? undefined} onClick={() => onPick(p.key)}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors duration-120",
              isPicked ? "border-line-strong bg-hover font-semibold text-text" : "border-line text-text-muted hover:bg-hover hover:text-text")}>
            <Icon size={12} className={cn(p.isFailed ? "text-bad" : p.at === null ? "text-faint" : "text-work")} />
            {nameOf(p, i)}
            {p.at !== null && <span className="font-normal text-faint tabular-nums">{day(p.at)}</span>}
          </button>
        )
      })}
    </div>
  )
}
