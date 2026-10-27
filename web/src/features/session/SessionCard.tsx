// A session's card: its state and title; one line that says why it is where
// it is (or the replies, one click each); a quiet foot with the repo, the age
// and small signals. `level` is the canvas's semantic zoom: far shows the
// state and title only, mid adds the line, near shows everything.
import { GitPullRequest, ListChecks, Mail, Star } from "lucide-react"
import { memo, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { answer, permit, sendText } from "./actions"
import { StateIcon } from "./StateIcon"
import { ageOf, contextOf, hueOf, stateOf } from "./state"

export type Level = "far" | "mid" | "near"

// Run an action from a card: its error, if any, as a toast.
const run = (work: Promise<unknown>, done: string) =>
  work.then(() => toast(done), (err: Error) => toast.error(err.message))

function Replies({ card }: { card: Card }) {
  const permission = card.bridge?.permission
  const question = card.bridge?.question
  const only = question?.questions.length === 1 && !question.questions[0].multiSelect ? question.questions[0] : null
  const buttons: { label: string; act: () => void }[] =
    card.askKind === "permission" && permission
      ? [
          { label: "Allow", act: () => run(permit(card.id, permission.id, "allow"), "Allowed") },
          { label: "Deny", act: () => run(permit(card.id, permission.id, "deny"), "Denied") },
        ]
      : card.askKind === "dialog" && only && question
        ? only.options.map(o => ({ label: o.label, act: () => run(answer(card.id, question.id, { [only.question]: o.label }), "Answer sent") }))
        : card.choices.map(c => ({ label: c.label, act: () => run(sendText(card.id, c.message || c.label), "Reply sent") }))
  if (!buttons.length) return null
  return (
    <div className="nodrag flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
      {buttons.map((b, i) => (
        <Button key={b.label} size="xs" variant={i === 0 ? "default" : "outline"} className="h-6 max-w-full truncate px-2 text-[11.5px]" onClick={b.act}>
          {b.label}
        </Button>
      ))}
    </div>
  )
}

function Signal({ icon: Icon, tip, tone, children }: { icon: typeof Mail; tip: string; tone?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-md bg-white/5 px-1.5 text-[11px] tabular-nums text-muted-foreground", tone)}>
          <Icon className="size-3" />{children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="whitespace-pre-line">{tip}</TooltipContent>
    </Tooltip>
  )
}

function Signals({ card }: { card: Card }) {
  const prs = card.prs ?? []
  const pct = card.usage ? Math.min(100, Math.round((card.usage.context / card.usage.window) * 100)) : null
  return (
    <span className="ml-auto flex items-center gap-1">
      {prs.length === 1 && (
        <Signal icon={GitPullRequest} tip={`${prs[0].title}${prs[0].checks ? `\nchecks ${prs[0].checks}` : ""}`}
          tone={prs[0].checks === "pass" ? "text-emerald-400" : prs[0].checks === "fail" ? "text-rose-400" : undefined}>#{prs[0].number}</Signal>
      )}
      {prs.length > 1 && <Signal icon={GitPullRequest} tip={prs.map(p => `#${p.number} ${p.title}`).join("\n")}>{prs.length}</Signal>}
      {card.taskCount > 0 && <Signal icon={ListChecks} tip={`${card.taskCount} ${card.taskCount === 1 ? "task" : "tasks"}`}>{card.taskCount}</Signal>}
      {card.bridge?.pending > 0 && <Signal icon={Mail} tip="Your messages waiting for the session" tone="text-amber-400">{card.bridge.pending}</Signal>}
      {pct !== null && (
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground" title={`Context used: ${pct}%`}>
          <span className="h-1 w-6 overflow-hidden rounded-full bg-white/10">
            <span className={cn("block h-full", pct >= 85 ? "bg-rose-400" : pct >= 65 ? "bg-amber-400" : "bg-zinc-400")} style={{ width: `${pct}%` }} />
          </span>
          {pct}%
        </span>
      )}
    </span>
  )
}

type Props = { card: Card; level?: Level; now: number; isSelected?: boolean; textScale?: number }

function SessionCardView({ card, level = "near", now, isSelected = false, textScale = 1 }: Props) {
  const far = level === "far"
  const state = stateOf(card)
  const isAsking = state === "asking" || state === "permission"
  const line = contextOf(card)
  return (
    <HoverCard openDelay={450} closeDelay={60}>
      <HoverCardTrigger asChild>
        <article
          className={cn(
            "group flex w-72 flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-white/15",
            state === "asking" && "border-amber-400/40 shadow-[0_0_0_3px_rgb(251_191_36/0.06)]",
            state === "permission" && "border-rose-400/40 shadow-[0_0_0_3px_rgb(251_113_133/0.06)]",
            (state === "parked" || state === "pending") && "opacity-75 hover:opacity-100",
            isSelected && "border-orange-400/70 shadow-[0_0_0_3px_rgb(251_146_60/0.15)]",
          )}
        >
          <div className="flex items-start gap-2">
            <StateIcon card={card} size={far ? Math.round(22 * textScale) : 22} />
            <span className="line-clamp-2 flex-1 text-sm font-medium leading-snug [overflow-wrap:anywhere]" style={far ? { fontSize: 14 * textScale, lineHeight: 1.2 } : undefined}>{card.title}</span>
            {card.pinned && <Star className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            {card.isUnread && <i className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-400" title="New since you last looked" />}
          </div>
          {level !== "far" && line && (
            <p className={cn("text-[12.5px] leading-snug", isAsking ? "text-foreground" : "text-muted-foreground", level === "mid" ? "line-clamp-1" : "line-clamp-2")}>{line}</p>
          )}
          {level === "near" && isAsking && <Replies card={card} />}
          <footer className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground/70" style={far ? { fontSize: 11.5 * Math.min(textScale, 1.8) } : undefined}>
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate" title={card.branch ? `${card.repo} · ${card.branch}` : card.repo}>
              <i className="size-[7px] shrink-0 rounded-[2px]" style={{ background: `oklch(0.72 0.14 ${hueOf(card.repo)})` }} />{card.repo}
            </span>
            {level !== "far" && <span className="shrink-0">{ageOf(card, now)}</span>}
            {level === "near" && <Signals card={card} />}
          </footer>
        </article>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80 space-y-2 text-[12.5px]">
        <div className="flex items-start gap-2 font-medium"><StateIcon card={card} size={18} />{card.title}</div>
        {card.lastPrompt && <p className="line-clamp-3 text-muted-foreground"><b className="mr-1.5 font-semibold text-foreground">You</b>{card.lastPrompt}</p>}
        {line && <p className={cn("line-clamp-[8]", isAsking && "text-amber-300")}>{line}</p>}
        {card.progress && card.column === "working" && <p className="text-[11.5px] text-muted-foreground">Step {Math.min(card.progress.done + 1, card.progress.total)} of {card.progress.total}</p>}
      </HoverCardContent>
    </HoverCard>
  )
}

export const SessionCard = memo(SessionCardView)
