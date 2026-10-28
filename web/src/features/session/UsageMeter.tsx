// How full a session's context is, under the reply box: a small ring that
// fills (amber from 65%, red from 85%) and the share, its digits rolling;
// the tokens show on hover.
import { Num } from "@/components/common/Num"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Snapshot } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { usageOf } from "./usage"

type Usage = NonNullable<Snapshot["cards"][number]["usage"]>

const R = 5.5
const LENGTH = 2 * Math.PI * R
const TONE = { ok: "text-text-muted", ask: "text-ask", bad: "text-bad" }

export function UsageMeter({ usage }: { usage: Usage }) {
  const { pct, tone, tokens, window } = usageOf(usage)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex shrink-0 cursor-default items-center gap-[5px] text-[11.5px] font-medium tabular-nums", TONE[tone])} aria-label={`Context used: ${pct}%`}>
          <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden="true">
            <circle cx="7" cy="7" r={R} fill="none" strokeWidth="2" className="stroke-line-strong" />
            <circle cx="7" cy="7" r={R} fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-current transition-[stroke-dashoffset] duration-300 ease-(--ease-out)"
              strokeDasharray={LENGTH} strokeDashoffset={LENGTH * (1 - pct / 100)} />
          </svg>
          <Num value={pct} suffix="%" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Context used: {tokens} of {window} tokens{pct >= 85 ? " — consider starting a new session" : ""}</TooltipContent>
    </Tooltip>
  )
}
