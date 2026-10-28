// Adapted from Watermelon UI's onboarding-checklist (ui.watermelon.sh, MIT):
// Setup's progress beside its title, a row of ticks per group that fill as
// steps get done, and the count. Ours splits required from optional and
// uses the board's green; its rows stay the list below.
import { Num } from "@/components/common/Num"
import { cn } from "@/lib/utils"
import type { Tally } from "./progress"

function Group({ label, tally }: { label: string; tally: Tally }) {
  if (!tally.total) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-text-muted" title={`${label}: ${tally.done} of ${tally.total} done`}>
      {label}
      <span className="flex gap-[3px]">
        {Array.from({ length: tally.total }, (_, i) => (
          <i key={i} className={cn("h-3 w-[3px] rounded-full transition-colors duration-500 ease-(--ease-out)", i < tally.done ? "bg-work" : "bg-line-strong")} />
        ))}
      </span>
      <Num value={tally.done} suffix={`/${tally.total}`} className="tabular-nums" />
    </span>
  )
}

export function Checklist({ required, optional }: { required: Tally; optional: Tally }) {
  return (
    <span className="flex items-center gap-3.5">
      <Group label="Required" tally={required} />
      <Group label="Optional" tally={optional} />
    </span>
  )
}
