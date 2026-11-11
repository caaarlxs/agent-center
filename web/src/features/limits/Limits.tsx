// The plan's limits in the sidebar (sidebar.js Limits): per window, how much
// is used (amber from 70%, red from 90%), a mark for the time gone by, when it
// resets, the pace and where it gets at this pace; under the 5-hour window,
// which sessions used most of it. Folded (kept in this browser), one line as
// tall as the rows under it: the 5 hours on the left, the week on the right.
// In the folded sidebar, a ring per window.
import { ChevronDown } from "lucide-react"
import { useLive } from "@/lib/live"
import { persistedStore } from "@/lib/store"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { openSession } from "@/app/open-session"
import { ago } from "@/features/session/state"
import { clockOf, limitRows, PACE_SHORT, resetAt, STALE_MS, topSpenders, type Tone } from "./pace"
import { Num } from "@/components/common/Num"

const PCT_TEXT: Record<Tone, string> = { ok: "", ask: "text-ask", bad: "text-bad" }
const FILL: Record<Tone, string> = { ok: "bg-work", ask: "bg-ask", bad: "bg-bad" }

const limitsOpen = persistedStore("limitsOpen", true)
const SHORT: Record<string, string> = { five_hour: "5h", seven_day: "Week" }

export function Limits() {
  const limits = useLive(l => l.snapshot?.limits)
  const cards = useLive(l => l.snapshot?.cards)
  const isOpen = limitsOpen.use()
  const now = useNow()
  if (!limits?.windows.length) return null
  const isOld = now - limits.at > STALE_MS
  const spenders = topSpenders(cards ?? [])
  const rows = limitRows(limits, now)
  if (!isOpen)
    return (
      <button onClick={() => limitsOpen.set(true)} title={isOld ? `Plan limits, from ${ago(limits.at, now)} ago. Click to open` : "Plan limits. Click to open"}
        className={cn("mx-0.5 mt-2.5 flex h-[30px] shrink-0 items-center rounded-md border border-line bg-surface text-[11.5px] text-text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-text", isOld && "opacity-55")}>
        {rows.map((r, i) => (
          <span key={r.kind} className={cn("flex min-w-0 flex-1 items-center gap-1.5 px-2.5", i > 0 && "border-l border-line")}>
            <span className="shrink-0 font-semibold text-text">{SHORT[r.kind] ?? r.label}</span>
            <span className="meter h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-hover"><i className={cn("block h-full rounded", FILL[r.tone])} style={{ width: `${Math.min(100, r.pct)}%` }} /></span>
            <span className={cn("shrink-0 font-[650] tabular-nums", PCT_TEXT[r.tone])}><Num value={r.pct} suffix="%" /></span>
          </span>
        ))}
      </button>
    )
  return (
    <section className={cn("mx-0.5 mt-2.5 flex flex-col gap-2.5 rounded-[10px] border border-line bg-surface px-2.5 pt-2.5 pb-2", isOld && "opacity-55")}
      title={isOld ? `Data from ${ago(limits.at, now)} ago: no open session has updated it` : "Plan limits"}>
      {rows.map(r => (
        <div key={r.kind} className="text-xs text-text-muted">
          <div className="mb-1.5 flex items-baseline justify-between text-text">
            {r === rows[0]
              ? <button onClick={() => limitsOpen.set(false)} title="Fold into one line" className="-ml-1 flex items-center gap-1 rounded px-1 font-semibold hover:bg-hover">{r.label}<ChevronDown className="size-3 rotate-180 text-faint" /></button>
              : <b className="font-semibold">{r.label}</b>}
            <span className={cn("font-[650] tabular-nums", PCT_TEXT[r.tone])}><Num value={r.pct} suffix="%" /></span>
          </div>
          {/* The time mark sits over the bar, not in it: the Dots style shows the bar only through its dots. */}
          <div className="relative" title={r.elapsed !== null ? `${r.elapsed}% of the time has passed` : undefined}>
            <div className="meter meter-lg h-2 rounded bg-hover">
              <i className={cn("block h-full rounded", FILL[r.tone])} style={{ width: `${Math.min(100, r.pct)}%` }} />
            </div>
            {r.elapsed !== null && <s className="absolute -top-[3px] -bottom-[3px] -ml-px w-0.5 rounded-[1px] bg-text opacity-55" style={{ left: `${r.elapsed}%` }} />}
          </div>
          <div className="mt-1.5">
            {r.hasReset ? "Already reset" : r.reset ? <>Resets in <b className="font-semibold text-text tabular-nums">{r.left}</b></> : "No reset time"}
          </div>
          {r.reset && !r.hasReset && (
            <div className="mt-px text-[11.5px] text-faint">
              {resetAt(r.reset, now)}
              {r.pace && <> · <span className={cn(r.pace === "under" && "text-work", r.pace === "over" && "text-ask")}>{PACE_SHORT[r.pace]}</span></>}
            </div>
          )}
          {r.ahead && (
            <div className={cn("mt-0.5 text-[11.5px] text-faint", "fullAt" in r.ahead && "text-bad")} title="If you keep the pace of the time gone by in this window">
              {"fullAt" in r.ahead ? <>At this pace, full at <b>{clockOf(r.ahead.fullAt, now)}</b></> : <>At this pace, about <b>{r.ahead.atReset}%</b> at reset</>}
            </div>
          )}
          {r.kind === "five_hour" && spenders.length > 0 && (
            <div className="mt-1.5 flex flex-col" title="Share of what your sessions spent in the last 5 hours, at API prices (the plan does not say what each one used)">
              {spenders.map(({ card, share }) => (
                <button key={card.id} onClick={() => openSession(card.id)}
                  className="-mx-1 flex h-[22px] items-center gap-1.5 rounded-md px-1 text-left text-[11.5px] text-text-muted hover:bg-hover hover:text-text">
                  <span className="min-w-0 flex-1 truncate">{card.title}</span>
                  <span className="shrink-0 text-faint tabular-nums">{share}%</span>
                </button>
              ))}
            </div>
          )}
          {r.kind === "five_hour" && (
            <button onClick={() => openDialog({ kind: "spend" })} title="What your tokens went on in the last hour, day, week or month: by kind, project, model and conversation"
              className="-mx-1 mt-1 flex h-[22px] w-[calc(100%+8px)] items-center justify-between rounded-md px-1 text-[11.5px] font-semibold text-text-muted hover:bg-hover hover:text-text">
              Where it goes<ChevronDown className="size-3 -rotate-90 text-faint" />
            </button>
          )}
        </div>
      ))}
    </section>
  )
}

const RING: Record<Tone, string> = { ok: "var(--text-muted)", ask: "var(--ask)", bad: "var(--bad)" }

// Folded: a ring per window with its use inside; the tooltip adds the reset.
export function SlimLimits() {
  const limits = useLive(l => l.snapshot?.limits)
  const now = useNow()
  if (!limits?.windows.length) return null
  return (
    <div className="flex flex-col items-center gap-2 py-2.5">
      {limitRows(limits, now).map(r => (
        <span key={r.kind} title={`${r.label}: ${r.pct}% used${r.left ? `, resets in ${r.left}` : ""}`}
          className={cn("grid size-[34px] place-items-center rounded-full text-[10.5px] font-[650] text-text-muted tabular-nums", PCT_TEXT[r.tone])}
          style={{ background: `radial-gradient(circle, var(--side) 12px, transparent 12.5px), conic-gradient(${RING[r.tone]} ${Math.min(100, r.pct)}%, var(--line-strong) 0)` }}>
          <Num value={r.pct} />
        </span>
      ))}
    </div>
  )
}
