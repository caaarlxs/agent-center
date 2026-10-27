// How full a session's context is (components.js UsageMeter): a small bar
// and the share, amber from 65%, red from 85%; wide, the tokens too.
import type { Snapshot } from "@/lib/api-types"
import { cn } from "@/lib/utils"

type Usage = NonNullable<Snapshot["cards"][number]["usage"]>

export function UsageMeter({ usage, isWide = false }: { usage: Usage; isWide?: boolean }) {
  const pct = Math.min(100, Math.round((usage.context / usage.window) * 100))
  const tone = pct >= 85 ? "text-bad [&_i]:bg-bad" : pct >= 65 ? "text-ask [&_i]:bg-ask" : isWide ? "text-text-muted [&_i]:bg-faint" : "text-faint [&_i]:bg-faint"
  const tokens = usage.context >= 1000 ? `${Math.round(usage.context / 1000)}k` : String(usage.context)
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-[5px] text-[11px] font-semibold tabular-nums", isWide && "text-[11.5px] font-medium", tone)}
      title={`Context used: ${tokens} of ${usage.window / 1000}k tokens (${pct}%)${pct >= 85 ? " — consider starting a new session" : ""}`}>
      <span className={cn("h-1 overflow-hidden rounded-sm bg-hover", isWide ? "w-16" : "w-7")}><i className="block h-full rounded-sm" style={{ width: `${pct}%` }} /></span>
      {pct}%{isWide && ` context · ${tokens} tokens`}
    </span>
  )
}
