// A session as Agent Center shows it: its state, and its card at the three
// zoom levels of the canvas. Built on shadcn (Card, Badge, Tooltip, HoverCard,
// DropdownMenu) and Motion.
import {
  Archive, Check, CircleDashed, Clock, Eye, GitPullRequest, ListChecks, Lock, MessageCircleQuestion,
  MoreHorizontal, Play, Star, Square,
} from "lucide-react"
import { motion } from "motion/react"
import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Session, State } from "./data"

export const STATES: Record<State, { label: string; icon: ComponentType<{ className?: string }>; tone: string }> = {
  asking: { label: "Asking you", icon: MessageCircleQuestion, tone: "text-amber-400 bg-amber-400/12" },
  permission: { label: "Needs approval", icon: Lock, tone: "text-rose-400 bg-rose-400/12" },
  review: { label: "To review", icon: Eye, tone: "text-sky-400 bg-sky-400/12" },
  working: { label: "Working", icon: CircleDashed, tone: "text-emerald-400 bg-emerald-400/12" },
  pending: { label: "Idle", icon: Clock, tone: "text-zinc-400 bg-zinc-400/10" },
  parked: { label: "Later", icon: Clock, tone: "text-zinc-500 bg-zinc-500/10" },
  done: { label: "Done", icon: Check, tone: "text-zinc-500 bg-zinc-500/10" },
}

// The state at a glance; while it works, a ring fills with its steps.
export function StateIcon({ session, size = 22 }: { session: Session; size?: number }) {
  const s = STATES[session.state]
  if (session.state === "working") {
    const pct = session.step ? session.step.done / session.step.total : 0.3
    return (
      <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-label={s.label}>
        <svg viewBox="0 0 36 36" className={cn("absolute inset-0", !session.step && "animate-spin")}>
          <circle cx="18" cy="18" r="15" fill="none" className="stroke-emerald-400/20" strokeWidth="4" />
          <motion.circle cx="18" cy="18" r="15" fill="none" className="stroke-emerald-400" strokeWidth="4" strokeLinecap="round"
            pathLength={1} initial={{ pathLength: 0 }} animate={{ pathLength: pct }} transition={{ type: "spring", duration: 0.8, bounce: 0 }}
            style={{ rotate: -90, transformOrigin: "50% 50%" }} />
        </svg>
        <span className="size-1.5 rounded-full bg-emerald-400" />
      </span>
    )
  }
  const Icon = s.icon
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full", s.tone)} style={{ width: size, height: size }} aria-label={s.label}>
      <Icon className="size-[58%]" />
    </span>
  )
}

function RepoTag({ session, className }: { session: Session; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 truncate", className)}>
      <i className="size-[7px] shrink-0 rounded-[2px]" style={{ background: `oklch(0.72 0.14 ${session.hue})` }} />
      {session.repo}
    </span>
  )
}

function Signal({ icon: Icon, children, tip, tone }: { icon: ComponentType<{ className?: string }>; children: React.ReactNode; tip: string; tone?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-md bg-white/5 px-1.5 text-[11px] tabular-nums text-muted-foreground", tone)}>
          <Icon className="size-3" />{children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function Usage({ pct }: { pct: number }) {
  const tone = pct >= 85 ? "bg-rose-400" : pct >= 65 ? "bg-amber-400" : "bg-zinc-400"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <span className="h-1 w-6 overflow-hidden rounded-full bg-white/10"><span className={cn("block h-full", tone)} style={{ width: `${pct}%` }} /></span>
          {pct}%
        </span>
      </TooltipTrigger>
      <TooltipContent>Context used: {pct}%</TooltipContent>
    </Tooltip>
  )
}

export function CardMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem><Play />Run the project</DropdownMenuItem>
        <DropdownMenuItem><Star />Pin<DropdownMenuShortcut>P</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem><Clock />Later…<DropdownMenuShortcut>A</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem><Square />Stop the turn<DropdownMenuShortcut>S</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem><Check />Mark as done<DropdownMenuShortcut>E</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem><Archive />Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type Level = "far" | "mid" | "near"

// A session's card. `level` is the canvas's semantic zoom: far shows the
// state and title only; mid adds one line; near shows everything.
export function SessionCard({ session: s, level = "near", selected = false }: { session: Session; level?: Level; selected?: boolean }) {
  const isAsking = s.state === "asking" || s.state === "permission"
  return (
    <HoverCard openDelay={450} closeDelay={80}>
      <HoverCardTrigger asChild>
        <motion.article
          layout
          whileTap={{ scale: 0.985 }}
          className={cn(
            "group relative flex w-72 flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors",
            "hover:border-white/15",
            isAsking && "border-amber-400/40 shadow-[0_0_0_3px_rgb(251_191_36/0.06)]",
            s.state === "permission" && "border-rose-400/40 shadow-[0_0_0_3px_rgb(251_113_133/0.06)]",
            (s.state === "parked" || s.state === "done") && "opacity-60 hover:opacity-100",
            selected && "border-orange-400/70 shadow-[0_0_0_3px_rgb(251_146_60/0.15)]",
          )}
        >
          <div className="flex items-start gap-2">
            <StateIcon session={s} size={level === "far" ? 30 : 22} />
            <span className={cn("line-clamp-2 flex-1 font-medium leading-snug", level === "far" ? "text-lg" : "text-sm")}>{s.title}</span>
            {s.unread && <i className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-400" />}
            {level === "near" && <span className="opacity-0 transition-opacity group-hover:opacity-100"><CardMenu /></span>}
          </div>
          {level !== "far" && (
            <p className={cn("text-[12.5px] leading-snug", isAsking ? "text-foreground" : "text-muted-foreground", level === "mid" ? "line-clamp-1" : "line-clamp-2")}>
              {s.context}
            </p>
          )}
          {level === "near" && s.choices && (
            <div className="flex flex-wrap gap-1.5">
              {s.choices.map((c, i) => (
                <Button key={c} size="xs" variant={i === 0 ? "default" : "outline"} className="h-6 rounded-md px-2 text-[11.5px]">{c}</Button>
              ))}
            </div>
          )}
          {level === "near" && s.state === "permission" && (
            <div className="flex gap-1.5">
              <Button size="xs" className="h-6 px-2 text-[11.5px]">Allow</Button>
              <Button size="xs" variant="outline" className="h-6 px-2 text-[11.5px]">Deny</Button>
            </div>
          )}
          <footer className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground/70", level === "far" ? "text-sm" : "text-[11.5px]")}>
            <RepoTag session={s} />
            {level !== "far" && <span className="shrink-0">{s.age}</span>}
            {level === "near" && (
              <span className="ml-auto flex items-center gap-1">
                {s.prs?.length === 1 && <Signal icon={GitPullRequest} tip={`#${s.prs[0].number}, checks ${s.prs[0].checks}`}
                  tone={s.prs[0].checks === "pass" ? "text-emerald-400" : s.prs[0].checks === "fail" ? "text-rose-400" : undefined}>#{s.prs[0].number}</Signal>}
                {(s.prs?.length ?? 0) > 1 && <Signal icon={GitPullRequest} tip={s.prs!.map(p => `#${p.number}`).join(", ")}>{s.prs!.length}</Signal>}
                {s.tasks && <Signal icon={ListChecks} tip={`${s.tasks.done} of ${s.tasks.total} tasks`}>{s.tasks.done}/{s.tasks.total}</Signal>}
                {s.usage !== undefined && <Usage pct={s.usage} />}
              </span>
            )}
          </footer>
        </motion.article>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80 space-y-2 text-[12.5px]">
        <div className="flex items-start gap-2 font-medium"><StateIcon session={s} size={18} />{s.title}</div>
        {s.lastPrompt && <p className="text-muted-foreground"><b className="mr-1.5 font-semibold text-foreground">You</b>{s.lastPrompt}</p>}
        <p className={isAsking ? "text-amber-300" : ""}>{s.context}</p>
        {s.step && <p className="text-[11.5px] text-muted-foreground">Step {s.step.done + 1} of {s.step.total}</p>}
      </HoverCardContent>
    </HoverCard>
  )
}
