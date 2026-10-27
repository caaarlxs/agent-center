// The left column: new session, the repos to filter the canvas by, the plan's
// limits, and the live connection with Setup at the foot. It folds to icons.
// New session and Setup open the classic board's dialogs until they move here.
import { ExternalLink, LayoutGrid, PanelLeft, Plus, Settings } from "lucide-react"
import { createStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { cn } from "@/lib/utils"
import { hueOf } from "@/features/session/state"
import { repoFilter } from "./view-state"

const LIMIT_NAME: Record<string, string> = { five_hour: "5 hours", seven_day: "Week", seven_day_opus: "Week · Opus", seven_day_sonnet: "Week · Sonnet" }

function readFolded() {
  try {
    return localStorage.getItem("sideFolded") === "1"
  } catch {
    return false
  }
}
export const sideFolded = createStore(readFolded())
const toggleFolded = () => {
  const next = !sideFolded.get()
  sideFolded.set(next)
  try {
    localStorage.setItem("sideFolded", next ? "1" : "0")
  } catch {}
}

function untilText(ms: number) {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h ${min % 60 ? `${min % 60} min` : ""}`.trim() : `${Math.floor(h / 24)} d ${h % 24} h`
}

function Limits({ isFolded }: { isFolded: boolean }) {
  const limits = useLive(l => l.snapshot?.limits)
  const now = useNow()
  if (!limits?.windows.length) return null
  return (
    <div className={cn("flex flex-col gap-3 border-t px-3 py-3", isFolded && "items-center px-0")}>
      {limits.windows.map(w => {
        const pct = Math.round(w.percentUsed)
        const tone = pct >= 90 ? "[&>*]:bg-rose-400" : pct >= 70 ? "[&>*]:bg-amber-400" : "[&>*]:bg-zinc-400"
        const reset = w.resetsAt ? Date.parse(w.resetsAt) : null
        const label = LIMIT_NAME[w.kind] ?? w.kind
        if (isFolded)
          return (
            <Tooltip key={w.kind}>
              <TooltipTrigger asChild>
                <span className="grid size-9 place-items-center rounded-full text-[10.5px] font-semibold tabular-nums"
                  style={{ background: `radial-gradient(circle, var(--sidebar) 12px, transparent 12.5px), conic-gradient(${pct >= 90 ? "#fb7185" : pct >= 70 ? "#fbbf24" : "#a1a1aa"} ${pct}%, var(--border) 0)` }}>{pct}</span>
              </TooltipTrigger>
              <TooltipContent side="right">{label}: {pct}% used{reset && reset > now ? `, resets in ${untilText(reset - now)}` : ""}</TooltipContent>
            </Tooltip>
          )
        return (
          <div key={w.kind} className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="font-medium">{label}</span><span className={cn("tabular-nums", pct >= 70 && "text-amber-400", pct >= 90 && "text-rose-400")}>{pct}%</span></div>
            <Progress value={pct} className={cn("h-1.5", tone)} />
            {reset && reset > now && <div className="text-muted-foreground">Resets in {untilText(reset - now)}</div>}
          </div>
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const isFolded = sideFolded.use()
  const repos = useLive(l => l.snapshot?.repos) ?? []
  const isConnected = useLive(l => l.isConnected)
  const chosen = repoFilter.use()
  const classic = (dialog: string) => window.open(`/?dialog=${dialog}`, "_blank")
  return (
    <aside className={cn("flex h-full shrink-0 flex-col border-r bg-sidebar text-sm transition-[width] duration-200", isFolded ? "w-14" : "w-60")}
      ref={el => void el?.ownerDocument.documentElement.style.setProperty("--side-w", isFolded ? "56px" : "240px")}>
      <div className={cn("flex h-12 items-center gap-2 px-3", isFolded && "justify-center px-0")}>
        {!isFolded && <b className="flex items-center gap-2 font-semibold"><i className="size-4 rounded bg-gradient-to-br from-orange-500 to-amber-300" />Agent Center</b>}
        <Button variant="ghost" size="icon-sm" className={cn(!isFolded && "ml-auto")} onClick={toggleFolded} aria-label={isFolded ? "Show the sidebar" : "Fold the sidebar"}><PanelLeft /></Button>
      </div>
      <div className={cn("px-2 pb-3", isFolded && "px-2")}>
        <Button className={cn("w-full bg-orange-500 text-white hover:bg-orange-500/90", isFolded ? "px-0" : "justify-start")} onClick={() => classic("new")} title="New session">
          <Plus />{!isFolded && "New session"}
        </Button>
      </div>
      <nav className="px-2">
        <span className={cn("flex h-8 items-center gap-2.5 rounded-md bg-accent px-2 font-medium", isFolded && "justify-center px-0")}><LayoutGrid className="size-4" />{!isFolded && "Canvas"}</span>
      </nav>
      {!isFolded && <div className="mt-5 mb-1 px-4 text-[11px] font-medium text-muted-foreground">Repos</div>}
      <nav className={cn("min-h-0 flex-1 overflow-auto px-2", isFolded && "mt-3")}>
        {!isFolded && (
          <button onClick={() => repoFilter.set(null)} className={cn("flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground", !chosen && "bg-accent text-foreground")}>
            <i className="size-2.5 rounded-[3px] bg-[conic-gradient(#f97316,#22c55e,#3b82f6,#a855f7,#f97316)]" />All
          </button>
        )}
        {repos.map(r => (
          <Tooltip key={r.root}>
            <TooltipTrigger asChild>
              <button onClick={() => repoFilter.set(chosen === r.root ? null : r.root)}
                className={cn("flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground", chosen === r.root && "bg-accent text-foreground", isFolded && "justify-center px-0")}>
                <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `oklch(0.72 0.14 ${hueOf(r.name)})` }} />
                {!isFolded && <><span className="truncate">{r.name}</span><span className="ml-auto text-xs tabular-nums text-muted-foreground/70">{r.count || ""}</span></>}
              </button>
            </TooltipTrigger>
            {isFolded && <TooltipContent side="right">{r.name}</TooltipContent>}
          </Tooltip>
        ))}
      </nav>
      <Limits isFolded={isFolded} />
      <footer className={cn("flex items-center gap-1 border-t px-3 py-2 text-xs text-muted-foreground", isFolded && "flex-col px-0")}>
        <span className="flex items-center gap-1.5" title={isConnected ? "Live" : "Reconnecting…"}>
          <i className={cn("size-1.5 rounded-full", isConnected ? "bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.15)]" : "bg-zinc-500")} />{!isFolded && (isConnected ? "Live" : "Reconnecting…")}
        </span>
        <span className={cn("flex gap-0.5", !isFolded && "ml-auto")}>
          <Button variant="ghost" size="icon-sm" onClick={() => classic("setup")} title="Setup"><Settings /></Button>
          {!isFolded && <Button variant="ghost" size="icon-sm" onClick={() => window.open("/", "_blank")} title="Open the classic board"><ExternalLink /></Button>}
        </span>
      </footer>
    </aside>
  )
}
