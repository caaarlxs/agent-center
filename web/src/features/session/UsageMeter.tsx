// How full a session's context is, under the reply box: a small ring that
// fills (amber from 65%, red from 85%) and the share, its digits rolling; on
// hover, the tokens, what the session would cost at API prices (in all, and
// in the last five hours) and its model.
import { Num } from "@/components/common/Num"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Snapshot } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { usageOf } from "./usage"

type Usage = NonNullable<Snapshot["cards"][number]["usage"]>

const R = 5.5
const LENGTH = 2 * Math.PI * R
const TONE = { ok: "text-text-muted", ask: "text-ask", bad: "text-bad" }
const money = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`

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
      <TooltipContent side="top" className="flex flex-col gap-1 py-2">
        <b className="font-semibold">Context: {tokens} of {window} tokens ({pct}%)</b>
        <span className="h-1 w-48 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_20%,transparent)]"><i className="block h-full rounded-full bg-current" style={{ width: `${pct}%` }} /></span>
        <span>At API prices: {money(usage.cost)} in all · {money(usage.recentCost)} in the last 5 h</span>
        {usage.model && <span className="opacity-70">{usage.model}</span>}
        {pct >= 65 && <span className="opacity-70">{pct >= 85 ? "Near full: Claude will compact it soon. A new session keeps more." : "Claude compacts the conversation when it fills."}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
