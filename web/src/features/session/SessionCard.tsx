// A session's card on the canvas (canvas.js CanvasCard): its state and title;
// one line that says why it is where it is (or the replies, one click each);
// a quiet foot with the repo, the age and small signals; its buttons float
// over its top edge on hover. A card that waits for you shakes now and then,
// harder the longer it waits; one at work glows. `level` is the canvas's
// semantic zoom: far shows the state, the title and a question, drawn larger.
import { Star } from "lucide-react"
import { type CSSProperties, memo } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { Card } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { menu, shake } from "@/features/board/state"
import { Actions, Context, Replies, Signals, tintOf } from "./parts"
import { StateIcon } from "./StateIcon"
import { ageOf, repoDot, stateOf, urgencyOf } from "./state"

export type Level = "far" | "mid" | "near"

// Stagger the nudges: each card shakes at its own moment.
function hashOf(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
const NUDGE = { none: { amp: 1.4, s: 7 }, low: { amp: 1.4, s: 7 }, mid: { amp: 2, s: 5 }, high: { amp: 2.6, s: 3.6 } }

const mix = (color: string, pct: number, base = "var(--line)") => `color-mix(in srgb, ${color} ${pct}%, ${base})`

// Its edge, face and ring, in the classic board's order of precedence: its
// colour, then selected, then what it waits for, then unread over all.
function lookOf(card: Card, o: { isSelected: boolean; isUrgent: boolean; isNoteTarget: boolean }): CSSProperties {
  const state = stateOf(card)
  const tint = tintOf(card.color)
  const look: CSSProperties = {}
  if (tint) Object.assign(look, { borderColor: mix(tint, 45), background: mix(tint, 9, "var(--surface)"), boxShadow: "0 1px 1px rgb(0 0 0 / 0.02)", ["--tint" as string]: tint })
  if (o.isSelected || o.isNoteTarget) Object.assign(look, { borderColor: "var(--brand)", boxShadow: "0 0 0 3px var(--brand-soft)" })
  if (state === "asking") look.borderColor = mix("var(--ask)", 50)
  if (state === "permission") look.borderColor = mix("var(--bad)", 55)
  if (card.isUnread && !o.isSelected && !o.isUrgent)
    Object.assign(look, {
      borderColor: mix("var(--review)", 75, "transparent"),
      boxShadow: `0 0 0 1px ${mix("var(--review)", 30, "transparent")}, 0 0 16px ${mix("var(--review)", 20, "transparent")}`,
    })
  return look
}

type Props = {
  card: Card
  now: number
  level?: Level
  unscale?: number // 1 / zoom: text set in it keeps its size on screen
  isSelected?: boolean
  isReading?: boolean
  isDragging?: boolean
  isNoteTarget?: boolean
}

function SessionCardView({ card, now, level = "near", unscale = 1, isSelected = false, isReading = false, isDragging = false, isNoteTarget = false }: Props) {
  const far = level === "far"
  const state = stateOf(card)
  const isDone = state === "done"
  const urgency = isDone ? null : urgencyOf(card, now)
  const isShakeOn = shake.use() === "on"
  const isShaking = (state === "asking" || state === "permission") && isShakeOn && !isDragging
  const isMenuOpen = menu.use()?.id === card.id
  const nudge = NUDGE[urgency ?? "none"]
  const ring = isSelected || isReading
  const style: CSSProperties = {
    ...lookOf(card, { isSelected: ring, isUrgent: !!urgency, isNoteTarget }),
    ...(isShaking ? { ["--amp" as string]: nudge.amp, animationName: "nudge", animationDuration: `${nudge.s}s`, animationTimingFunction: "ease-in-out", animationIterationCount: "infinite", animationDelay: `${-((hashOf(card.id) % 7000) / 1000)}s` } : {}),
    ...(isDragging ? { transform: "rotate(1.5deg)", boxShadow: "var(--shadow-pop)", transition: "none" } : {}),
    ...(far ? { gap: 6, padding: "12px 14px" } : {}),
  }
  const big = (px: number, cap: number) => (far ? px * Math.min(unscale, cap) : px)
  return (
    <HoverCard openDelay={450} closeDelay={60} open={isDragging || isReading ? false : undefined}>
      <HoverCardTrigger asChild>
        <article data-id={card.id} tabIndex={0} style={style}
          className={cn(
            "group/card relative flex w-72 origin-top cursor-grab flex-col gap-2 rounded-[12px] border border-line bg-surface px-3 pt-[11px] pb-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)] select-none dark:border-line-strong",
            "transition-[border-color,box-shadow,opacity] duration-120 hover:[animation-play-state:paused] focus-visible:outline-offset-2",
            // Quieter cards dim what they say, not the card itself: an opaque
            // card keeps its edge on the canvas, a see-through one sinks into it.
            // The action bar keeps its own opacity (hidden until hover).
            "[&>*:not(.card-bar)]:transition-opacity [&>*:not(.card-bar)]:duration-120 hover:[&>*:not(.card-bar)]:opacity-100",
            state === "pending" && "[&>*:not(.card-bar)]:opacity-80",
            state === "parked" && "[&>*:not(.card-bar)]:opacity-55",
            isDone && !ring && !isDragging && "shadow-none [&>*:not(.card-bar)]:opacity-62",
            isDragging && "cursor-grabbing",
          )}>
          {state === "working" && <i aria-hidden className="pointer-events-none absolute -inset-[3px] animate-breathe rounded-[14px] shadow-[0_0_0_2px_color-mix(in_srgb,var(--work)_55%,transparent),0_0_22px_color-mix(in_srgb,var(--work)_35%,transparent)]" />}
          <div className="flex min-w-0 items-center gap-[9px]">
            <StateIcon card={card} size={Math.round(big(34, 1.8))} />
            <span title={card.title} className={cn("line-clamp-2 min-w-0 flex-1 text-sm leading-[1.3] [overflow-wrap:anywhere]", isDone ? "font-[550]" : "font-semibold")}
              style={far ? { fontSize: big(14, 2), lineHeight: 1.2 } : undefined}>{card.title}</span>
            {card.pinned && <span className="ml-auto flex-none text-ask" title="Pinned"><Star className="size-3" /></span>}
            {card.isUnread && <i className="mt-1.5 size-[7px] flex-none rounded-full bg-brand" title="New since you last looked" />}
          </div>
          {!isDone && (!far || card.column === "asking") && (
            <Context card={card} lines={level === "mid" ? 1 : 2} className="text-[12.5px] leading-[1.4]" />
          )}
          {!isDone && !far && <Replies card={card} isSmall />}
          <footer className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint" style={far ? { fontSize: big(11.5, 1.8) } : undefined}>
            <span className="inline-flex min-w-0 items-center gap-[5px] truncate" title={card.branch ? `${card.repo} · ${card.branch}` : card.repo}>
              <i className="size-[7px] flex-none rounded-[2px]" style={{ background: repoDot(card.repo) }} />{card.repo}
            </span>
            {!far && <span className="flex-none whitespace-nowrap">{ageOf(card, now)}</span>}
            {!isDone && !far && <Signals card={card} now={now} isMid={level === "mid"} />}
          </footer>
          {!far && (
            <Actions card={card} isCompact
              className={cn(
                // card-bar: its own opacity (hidden until hover), not the dimming above.
                "card-bar absolute -top-3 right-2 rounded-lg border border-line bg-raised p-px shadow-card transition-opacity duration-120",
                ring || isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0 group-hover/card:pointer-events-auto group-hover/card:opacity-100",
                isDragging && "opacity-0",
              )} />
          )}
        </article>
      </HoverCardTrigger>
      <Peek card={card} now={now} />
    </HoverCard>
  )
}

// A card's preview, after a moment over it: what you asked last and the
// whole of what it says now (the card cuts it to a line or two).
function Peek({ card, now }: { card: Card; now: number }) {
  const text = card.column === "asking" ? card.ask : card.column === "working" ? card.progress?.current : card.recap
  const p = card.progress
  return (
    <HoverCardContent side="right" align="start" sideOffset={12} collisionPadding={8}
      className="pointer-events-none flex w-[340px] flex-col gap-2 rounded-[12px] border-line-strong bg-raised px-3.5 py-3 text-[12.5px] leading-[1.45] shadow-pop">
      <header className="flex items-start gap-2 text-[13px] leading-[1.3]"><StateIcon card={card} size={20} /><b className="font-semibold">{card.title}</b></header>
      {card.lastPrompt && <p className="line-clamp-3 text-text-muted [overflow-wrap:anywhere]"><span className="mr-1.5 font-semibold text-text">You</span>{card.lastPrompt}</p>}
      {text && <p className={cn("line-clamp-[8] [overflow-wrap:anywhere]", card.column === "asking" && "text-ask")}>{text}</p>}
      {p && card.column === "working" && <p className="text-[11.5px] text-text-muted">Step {Math.min(p.done + 1, p.total)} of {p.total}</p>}
      <footer className="flex min-w-0 items-center gap-2 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-[5px]"><i className="size-[7px] rounded-[2px]" style={{ background: repoDot(card.repo) }} />{card.repo}</span>
        {card.branch && <span className="min-w-0 truncate font-mono">{card.branch}</span>}
        <span className="flex-none">{ageOf(card, now)}</span>
      </footer>
    </HoverCardContent>
  )
}

export const SessionCard = memo(SessionCardView)
