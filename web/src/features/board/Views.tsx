// The list views (board.js, tiers.js): the inbox (one list grouped by
// state), the board (one column per state, or one lane per repo) and the
// tier list (rows by importance, then Paused and Close). A click, or Enter on
// a focused card or row, opens the conversation; cards drag between columns
// and rows. Each view's own tools sit at the top: Columns / By repo, Done.
import { ChevronDown, ChevronRight, Pause, Star } from "lucide-react"
import { type CSSProperties, type ReactNode, useState } from "react"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { useNow } from "@/lib/now"
import { load, keep } from "@/lib/store"
import { cn } from "@/lib/utils"
import { openSession, useOpenSession } from "@/app/open-session"
import { repoFilter } from "@/app/view-state"
import { Actions, Context, Corner, Meta, NewBadge, edgeOf, tintOf } from "@/features/session/parts"
import { StateIcon } from "@/features/session/StateIcon"
import { ageOf, hueOf, repoDot, repoText, stateOf, urgencyOf } from "@/features/session/state"
import { archiveAll, boardSteps, placeInTier } from "./act"
import { COLUMN, type ColumnKey, type Step, TONE_DOT, byPin, columnsShown, dropAction, inboxGroups, runsOf } from "./columns"
import { type View, dragging, drawingZone, groupBy, menu, noteAsked, selected, showDone } from "./state"
import { byRank, emptyText, type TierKey, tierOf, TIERS, toTier } from "./tiers"
import { Anim } from "@/components/icons/animated"
import { useIsDots } from "@/lib/board-style"

const open = (id: string) => (selected.set(id), openSession(id))
// A focused card or row opens with Enter or Space, as a click would; keys
// pressed on the buttons inside it stay theirs.
const onOpenKey = (id: string) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
  e.preventDefault()
  open(id)
}
const URGENT_AGE = { low: "text-[#ca8a04]", mid: "font-semibold text-[#ea580c]", high: "font-[650] text-bad" }
const URGENT_EDGE = {
  low: { borderColor: "rgb(234 179 8 / 0.45)" },
  mid: { borderColor: "rgb(249 115 22 / 0.55)" },
  high: { borderColor: "color-mix(in srgb, var(--bad) 60%, transparent)", background: "color-mix(in srgb, var(--bad) 6%, var(--surface))" },
}

// "web-finder" → "WF": a repo's initials on its colour.
function RepoIcon({ name, size = 20 }: { name: string; size?: number }) {
  const parts = name.split(/[-_./\s]+/).filter(Boolean)
  const text = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
  const hue = hueOf(name)
  return (
    <span title={name} style={{ width: size, height: size, fontSize: size * 0.46, ["--h" as string]: hue }}
      className="inline-flex flex-none items-center justify-center rounded-md leading-none font-[750] tracking-[-0.02em] text-[hsl(var(--h)_70%_96%)] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] bg-[hsl(var(--h)_55%_46%)] dark:bg-[hsl(var(--h)_45%_38%)] dark:text-[hsl(var(--h)_80%_92%)]">
      {text}
    </span>
  )
}

const RepoTag = ({ name }: { name: string }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: repoText(name) }}>
    <i className="repo-dot size-[7px] rounded-[2px]" style={{ background: repoDot(name) }} />{name}
  </span>
)

// ---------- board ----------

// A card on the board and the tier list (board.js Card): it drags to another column or row.
export function BoardCard({ card, inStack = false }: { card: Card; inStack?: boolean }) {
  const isDots = useIsDots()
  const now = useNow()
  const isSelected = selected.use() === card.id
  const isReading = useOpenSession()?.id === card.id
  const isMenuOpen = menu.use()?.id === card.id
  const urgency = urgencyOf(card, now)
  const tint = tintOf(card.color)
  const ring = isSelected || isReading
  const style: CSSProperties = {
    ...(tint ? { borderColor: `color-mix(in srgb, ${tint} 45%, var(--line))`, background: `color-mix(in srgb, ${tint} 9%, var(--surface))`, boxShadow: "0 1px 1px rgb(0 0 0 / 0.02)" } : {}),
    ...(card.column === "asking" ? { borderColor: "color-mix(in srgb, var(--ask) 35%, var(--line))" } : {}),
    ...(urgency ? URGENT_EDGE[urgency] : {}),
    ...(ring ? { borderColor: "var(--brand)", boxShadow: "0 0 0 3px var(--brand-soft)" } : {}),
    ...(card.isUnread && !ring && !urgency
      ? { borderColor: "color-mix(in srgb, var(--review) 75%, transparent)", boxShadow: "0 0 0 1px color-mix(in srgb, var(--review) 30%, transparent), 0 0 16px color-mix(in srgb, var(--review) 20%, transparent)" }
      : {}),
  }
  return (
    <article data-id={card.id} tabIndex={0} draggable style={style} data-edge={edgeOf(card, { isSelected: ring, isWaiting: !!urgency })}
      onClick={() => open(card.id)} onKeyDown={onOpenKey(card.id)}
      onDragStart={e => (e.dataTransfer.setData("text/plain", card.id), (e.dataTransfer.effectAllowed = "move"), dragging.set(card))}
      onDragEnd={() => dragging.set(null)}
      className={cn("group/card relative flex cursor-pointer flex-col gap-2 rounded-[10px] border border-line bg-surface px-3 pt-3 pb-[11px] shadow-[0_1px_1px_rgb(0_0_0/0.02)] transition-[border-color,box-shadow] duration-100 active:cursor-grabbing",
        "hover:border-line-strong hover:shadow-card", isMenuOpen && "z-5")}>
      <Corner state={stateOf(card)} />
      <header className="flex min-w-0 items-start gap-2.5">
        <StateIcon card={card} size={isDots ? 36 : 30} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 className={cn("m-0 line-clamp-2 text-sm leading-[1.35] [overflow-wrap:anywhere]", card.isUnread ? "font-[750]" : "font-[550]")}>{card.title}</h3>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {!inStack && <RepoTag name={card.repo} />}
            {card.branch && <span className="min-w-0 truncate font-mono text-[11.5px] text-text-muted" title={card.branch}>{card.branch}</span>}
            <span className={cn("dot-time ml-auto text-xs whitespace-nowrap text-faint tabular-nums", urgency && URGENT_AGE[urgency])}
              title={card.waitingSince ? "How long it has been waiting for you" : new Date(card.lastActivity ?? card.updatedAt).toLocaleString("en-GB")}>{ageOf(card, now)}</span>
          </div>
        </div>
        <NewBadge card={card} className="self-start" />
        {card.pinned && <span className="inline-flex text-ask" title="Pinned: it shows first in its column"><Star className="size-[13px]" /></span>}
      </header>
      <Context card={card} className="text-[12.5px]" />
      <Meta card={card} now={now} className="empty:hidden" />
      <Actions card={card} isCompact
        className={cn("absolute top-[5px] right-[5px] rounded-[9px] border border-line bg-raised p-0.5 shadow-card transition-opacity duration-120",
          ring || isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100")} />
    </article>
  )
}

const Empty = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cn("m-0 px-1 py-[18px] text-center text-[12.5px] text-faint", className)}>{children}</p>

// A column's head: its tone, label and count; Done has Archive all.
function ColumnHead({ col, count, done }: { col: ColumnKey; count: number; done: Card[] }) {
  const isDragging = !!dragging.use()
  return (
    <h2 className="mx-1.5 mb-2.5 flex items-center gap-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase">
      <i className={cn("size-[7px] rounded-full", TONE_DOT[COLUMN[col].tone])} />{COLUMN[col].label}
      <span className="ml-auto font-medium text-faint">{count || ""}</span>
      {col === "done" && done.length > 0 && !isDragging && <ArchiveAll cards={done} />}
    </h2>
  )
}

const ArchiveAll = ({ cards }: { cards: Card[] }) => (
  <button onClick={() => void archiveAll(cards)} title="Archive all done sessions"
    className="ml-1 inline-flex h-6 items-center gap-[5px] rounded-md px-2 text-[11.5px] font-semibold tracking-normal text-text-muted normal-case hover:bg-press hover:text-text">
    <Anim.Archive size={13} />Archive all
  </button>
)

// Where a dragged card can go: the drop rule, and the look of a target.
function useDrop(test: (card: Card) => Step[] | null, onDrop?: (card: Card) => void) {
  const card = dragging.use()
  const [isOver, setOver] = useState(false)
  const steps = card ? test(card) : null
  return {
    card, steps, isOver: isOver && !!steps,
    handlers: {
      onDragOver: (e: React.DragEvent) => steps && (e.preventDefault(), setOver(true)),
      onDragLeave: (e: React.DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        setOver(false)
        dragging.set(null)
        if (card && steps) onDrop ? onDrop(card) : void boardSteps(card, steps)
      },
    },
  }
}

// The cards of one column (in one lane, when grouped): a drop target too.
function Cell({ col, list, head, isStacked = false, isLane = false }: { col: ColumnKey; list: Card[]; head?: ReactNode; isStacked?: boolean; isLane?: boolean }) {
  const drop = useDrop(card => {
    const a = dropAction(card, col)
    return a ? [a] : null
  })
  return (
    <section {...drop.handlers} data-group={`col-${col}`}
      className={cn("flex min-h-0 flex-col rounded-[12px] px-2 pt-2.5 pb-2 transition-[background-color,box-shadow,opacity] duration-120",
        isLane ? "min-h-14 border border-dashed border-transparent bg-[color-mix(in_srgb,var(--side)_45%,transparent)] pt-2" : "bg-side",
        drop.isOver && (isLane ? "border-brand bg-brand-soft" : "bg-brand-soft shadow-[inset_0_0_0_2px_var(--brand)]"),
        drop.card && !drop.steps && drop.card.column !== col && "opacity-55")}>
      {head}
      <div className={cn("-m-0.5 flex min-h-0 flex-col gap-2 p-0.5", !isLane && "overflow-y-auto")}>
        {isStacked
          ? runsOf(list).map(run => (
              <div key={run.cards[0].id} data-stack className="flex flex-col gap-1.5 rounded-[12px] p-1.5"
                style={{ background: `hsl(${hueOf(run.repo)} 50% 50% / 0.07)`, boxShadow: `inset 0 0 0 1px hsl(${hueOf(run.repo)} 50% 50% / 0.18)` }}>
                <div className="flex items-center gap-[7px] px-1 pt-px pb-0.5 text-xs font-[650]" style={{ color: repoText(run.repo) }}>
                  <RepoIcon name={run.repo} size={16} /><span className="truncate">{run.repo}</span>
                  {run.cards.length > 1 && <span className="ml-auto font-medium text-faint">{run.cards.length}</span>}
                </div>
                {run.cards.map(card => <BoardCard key={card.id} card={card} inStack />)}
              </div>
            ))
          : list.map(card => <BoardCard key={card.id} card={card} />)}
        {list.length === 0 && <Empty className={isLane ? "py-2.5" : undefined}>{drop.card && drop.steps ? "Drop here" : head ? (col === "asking" ? "Nothing waiting for you" : "Empty") : ""}</Empty>}
      </div>
    </section>
  )
}

const foldedLanes = { get: () => load<Record<string, boolean>>("foldedLanes", {}) }

export function Board({ cards }: { cards: Card[] }) {
  const isDone = showDone.use()
  const isDragging = !!dragging.use()
  const by = groupBy.use()
  const repos = useLive(l => l.snapshot?.repos) ?? []
  const pointed = selected.use()
  const [folded, setFolded] = useState(foldedLanes.get)
  const columns = columnsShown(isDone, isDragging)
  const inCol = (list: Card[], col: string) => list.filter(c => c.column === col).sort(byPin)

  if (by !== "repo")
    return (
      <div className="grid h-full min-w-min auto-cols-[minmax(270px,1fr)] grid-flow-col gap-3 px-5 pt-3.5 pb-5">
        {columns.map(col => {
          const list = inCol(cards, col)
          return <Cell key={col} col={col} list={list} isStacked head={<ColumnHead col={col} count={list.length} done={list} />} />
        })}
      </div>
    )

  // Swimlanes: one row per repo, the state columns above them all.
  const lanes = repos.map(r => ({ ...r, cards: cards.filter(c => c.repoRoot === r.root && (columns as string[]).includes(c.column)) })).filter(l => l.cards.length > 0)
  const fold = (root: string) => {
    const next = { ...folded, [root]: !folded[root] }
    setFolded(next)
    keep("foldedLanes", next)
  }
  const grid = { gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))` }
  return (
    <div className="block px-5 pb-5">
      <div className="sticky top-0 z-4 grid gap-3 bg-bg pt-3 pb-2" style={grid}>
        {columns.map(col => <div key={col} className="px-2"><ColumnHead col={col} count={inCol(cards, col).length} done={inCol(cards, "done")} /></div>)}
      </div>
      {lanes.map(lane => {
        const isFolded = folded[lane.root] && !lane.cards.some(c => c.id === pointed)
        const asking = lane.cards.filter(c => c.column === "asking").length
        return (
          <section key={lane.root} data-lane={lane.root} className={cn("-ml-0.5 border-l-[3px] pl-2.5", isFolded ? "mb-0.5" : "mb-2.5")} style={{ borderColor: `hsl(${hueOf(lane.name)} 55% 50% / 0.5)` }}>
            <button onClick={() => fold(lane.root)} aria-expanded={!isFolded} title={lane.root}
              className="sticky left-0 mt-0.5 mb-1.5 flex h-9 items-center gap-[9px] rounded-lg px-2 text-[13.5px] font-[650] hover:bg-hover">
              {isFolded ? <ChevronRight className="size-3.5 text-faint" /> : <ChevronDown className="size-3.5 text-faint" />}
              <RepoIcon name={lane.name} size={18} />
              <span>{lane.name}</span>
              <span className="text-xs font-medium text-faint">{lane.cards.length}</span>
              {asking > 0 && <span className="rounded-[9px] bg-ask-soft px-2 py-px text-[11px] font-[650] text-ask">{asking} asking you</span>}
            </button>
            {!isFolded && <div className="grid gap-3" style={grid}>{columns.map(col => <Cell key={col} col={col} list={inCol(lane.cards, col)} isLane />)}</div>}
          </section>
        )
      })}
    </div>
  )
}

// ---------- inbox ----------

function Row({ card }: { card: Card }) {
  const now = useNow()
  const isSelected = selected.use() === card.id
  const isReading = useOpenSession()?.id === card.id
  const isMenuOpen = menu.use()?.id === card.id
  const urgency = urgencyOf(card, now)
  const tint = tintOf(card.color)
  const ring = isSelected || isReading
  const style: CSSProperties = tint
    ? { ["--tint" as string]: tint, boxShadow: `inset 3px 0 0 ${tint}${isReading ? ", inset 0 0 0 1px var(--brand-soft)" : ""}` }
    : isReading ? { boxShadow: "inset 0 0 0 1px var(--brand-soft)" } : {}
  return (
    <div data-id={card.id} tabIndex={0} style={style} onClick={() => open(card.id)} onKeyDown={onOpenKey(card.id)}
      className={cn("group/row relative my-px grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3.5 rounded-[9px] px-2.5 py-2 transition-[background-color] duration-80",
        "@max-[760px]:grid-cols-[minmax(0,1fr)_auto_auto] @max-[760px]:gap-2.5",
        tint
          ? ring ? "bg-[color-mix(in_srgb,var(--tint)_18%,var(--select))]" : "bg-[color-mix(in_srgb,var(--tint)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--tint)_16%,transparent)]"
          : ring ? "bg-select" : "hover:bg-hover",
        isMenuOpen && "z-5")}>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex min-w-0 items-center gap-2.5">
          <StateIcon card={card} size={24} />
          <NewBadge card={card} />
          <span className={cn("min-w-0 truncate text-[13.5px]", card.isUnread ? "font-[750]" : "font-[550]")}>{card.title}</span>
          <RepoTag name={card.repo} />
          {card.pinned && <span className="inline-flex text-ask" title="Pinned"><Star className="size-[11px]" /></span>}
        </div>
        <Context card={card} lines={1} />
      </div>
      <Meta card={card} now={now} className="max-w-[42cqi] flex-nowrap justify-end overflow-hidden @max-[760px]:hidden" />
      <span className={cn("dot-time text-xs whitespace-nowrap text-faint tabular-nums", urgency && URGENT_AGE[urgency], ring && "@max-[760px]:hidden")}>{ageOf(card, now)}</span>
      <Actions card={card}
        className={cn("transition-opacity duration-120",
          ring || isMenuOpen ? "opacity-100" : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 @max-[760px]:hidden")} />
    </div>
  )
}

export function Inbox({ cards }: { cards: Card[] }) {
  const isDone = showDone.use()
  const pointed = selected.use()
  const [folded, setFolded] = useState<Record<string, boolean>>({ parked: true })
  return (
    <div className="@container max-w-[1180px] px-3 pt-2 pb-10">
      {inboxGroups(cards, isDone).map(g => {
        const isFolded = folded[g.key] && !g.cards.some(c => c.id === pointed)
        return (
          <section key={g.key} data-group={`group-${g.key}`} className="mt-1.5">
            <div className="flex items-center gap-2">
              <button data-fly={g.key} onClick={() => setFolded(f => ({ ...f, [g.key]: !f[g.key] }))} aria-expanded={!isFolded}
                className="flex h-8 w-full flex-1 items-center gap-2 rounded-[7px] px-2 text-xs font-[650] tracking-[0.04em] text-text-muted uppercase hover:bg-hover">
                {isFolded ? <ChevronRight className="size-3.5 text-faint" /> : <ChevronDown className="size-3.5 text-faint" />}
                {g.key === "pinned" ? <Star className="size-3 text-ask" /> : <i className={cn("size-[7px] rounded-full", TONE_DOT[COLUMN[g.key].tone])} />}
                {g.label}<span className="font-medium text-faint">{g.cards.length}</span>
              </button>
              {g.key === "done" && g.cards.length > 0 && <ArchiveAll cards={g.cards} />}
            </div>
            {!isFolded && (g.cards.length
              ? g.cards.map(card => <Row key={card.id} card={card} />)
              : <p className="m-0 py-2.5 pr-3 pb-3.5 pl-[38px] text-[12.5px] text-faint">Nothing is waiting for you. When a session asks you something, it shows up here.</p>)}
          </section>
        )
      })}
    </div>
  )
}

// ---------- tiers ----------

// Where a drop lands in a row of cards laid left to right: before the first
// card whose middle is right of the pointer.
function indexAt(box: HTMLElement, x: number, skip: string | undefined) {
  const cards = [...box.querySelectorAll<HTMLElement>(":scope > [data-slot] > [data-id]")].filter(el => el.dataset.id !== skip)
  const i = cards.findIndex(el => { const r = el.getBoundingClientRect(); return x < r.left + r.width / 2 })
  return i === -1 ? cards.length : i
}

// A wheel turned up or down scrolls a row sideways, when it has nothing to scroll down.
function wheelSideways(e: React.WheelEvent<HTMLElement>) {
  const el = e.currentTarget
  if (e.deltaX !== 0 || el.scrollHeight > el.clientHeight || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY
}

function TierRow({ tier, i, list }: { tier: (typeof TIERS)[number]; i: number; list: Card[] }) {
  const key = tier.key as TierKey
  const [at, setAt] = useState<number | null>(null)
  // Its own cards drop here too: to change their place in the row.
  const drop = useDrop(card => (tierOf(card) === key ? [] : toTier(card, key)), card => void placeInTier(card, key, list, at ?? list.length))
  const shown = list
  const others = shown.filter(c => c.id !== drop.card?.id)
  const mark = drop.isOver && at !== null ? (others[at]?.id ?? "end") : null
  return (
    <section data-tier={tier.key} data-group={`tier-${tier.key}`} {...drop.handlers}
      onDragLeave={e => (drop.handlers.onDragLeave(e), !e.currentTarget.contains(e.relatedTarget as Node) && setAt(null))}
      onDrop={e => (drop.handlers.onDrop(e), setAt(null))}
      style={{ ["--tier" as string]: tier.color }}
      className={cn("grid min-h-24 flex-[1_1_0] grid-cols-[132px_minmax(0,1fr)] overflow-hidden rounded-[12px] bg-side transition-[background-color,box-shadow,opacity] duration-120 max-[860px]:flex-none max-[860px]:grid-cols-1",
        tier.key === "paused" && "flex-grow-[0.8]",
        drop.isOver && "bg-brand-soft shadow-[inset_0_0_0_2px_var(--brand)]",
        drop.card && !drop.steps && tierOf(drop.card) !== tier.key && "opacity-55")}
      data-index={i}>
      <div title={tier.hint}
        className={cn("flex flex-col items-center justify-center gap-1 p-2.5 text-center shadow-[inset_-1px_0_0_var(--line)] max-[860px]:flex-row max-[860px]:justify-start max-[860px]:px-3 max-[860px]:py-2 max-[860px]:shadow-[inset_0_-1px_0_var(--line)]",
          "bg-[color-mix(in_srgb,var(--tier)_22%,var(--surface))]", tier.key === "paused" ? "text-text-muted" : "text-text")}>
        {tier.key === "paused" && <Pause className="size-4" />}
        <b className="text-sm leading-[1.25] font-bold">{tier.label}</b>
        <span className="text-xs font-medium text-text-muted max-[860px]:ml-auto">{list.length || ""}</span>
      </div>
      {/* One line, left to right, in the order the person gave; a scrollbar to move along it. */}
      <div onWheel={wheelSideways}
        onDragOver={e => drop.steps && setAt(indexAt(e.currentTarget, e.clientX, drop.card?.id))}
        className="flex min-h-0 min-w-0 items-stretch gap-2 overflow-x-auto overflow-y-auto p-2.5 [scrollbar-width:thin]">
        {shown.map(card => (
          <div key={card.id} data-slot className="relative w-[272px] flex-none [&>article]:h-full">
            {mark === card.id && <i className="absolute inset-y-0 -left-[6px] w-[3px] rounded-full bg-brand" />}
            <BoardCard card={card} />
          </div>
        ))}
        {mark === "end" && shown.length > 0 && <i className="w-[3px] flex-none self-stretch rounded-full bg-brand" />}
        {shown.length === 0 && <Empty className="flex-1 self-center py-3.5">{emptyText(key, !!drop.card && !!drop.steps && tierOf(drop.card) !== key)}</Empty>}
      </div>
    </section>
  )
}

export function Tiers({ cards }: { cards: Card[] }) {
  return (
    <div className="box-border flex h-full flex-col gap-2 px-5 pt-3.5 pb-5 max-[860px]:h-auto max-[860px]:px-3 max-[860px]:pt-2.5 max-[860px]:pb-4">
      {TIERS.map((tier, i) => <TierRow key={tier.key} tier={tier} i={i} list={cards.filter(c => tierOf(c) === tier.key).sort(byRank)} />)}
    </div>
  )
}

// ---------- the view's tools ----------

export const segBtn = (isOn: boolean) =>
  cn("h-6 rounded-md px-2.5 text-[12.5px] font-[550] transition-colors", isOn ? "bg-text text-bg" : "text-text-muted hover:text-text")
export const toolBtn = (isOn = false) =>
  cn("pointer-events-auto inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,transform] duration-120 ease-(--ease-out) active:scale-[0.97]",
    isOn ? "border-text bg-text text-bg" : "border-line-strong bg-surface hover:bg-hover")

// Each view's tools in the top bar (main.js:735-745): Zone and Note on the
// canvas; Columns / By repo on the board (G), and Done everywhere else.
export function ViewTools({ view }: { view: View }) {
  const by = groupBy.use()
  const isDone = showDone.use()
  const isDrawing = drawingZone.use()
  if (view === "canvas")
    return (
      <>
        <button className={toolBtn(isDrawing)} aria-pressed={isDrawing} title="Draw a named zone on the canvas to group cards (Esc cancels)"
          onClick={() => drawingZone.set(!isDrawing)}><Anim.Plus size={14} /><span className="max-[1080px]:hidden">Zone</span></button>
        <button className={toolBtn()} title="Add a note (or double-click the empty canvas)" onClick={() => noteAsked.set(noteAsked.get() + 1)}>
          <Anim.Plus size={14} /><span className="max-[1080px]:hidden">Note</span></button>
      </>
    )
  return (
    <>
      {view === "board" && (
        <div role="group" aria-label="Group" className="pointer-events-auto inline-flex rounded-lg border border-line-strong bg-surface p-0.5 max-[860px]:hidden">
          <button className={segBtn(by !== "repo")} onClick={() => groupBy.set("none")} title="No grouping (G)">Columns</button>
          <button className={segBtn(by === "repo")} onClick={() => groupBy.set("repo")} title="Lanes per repo (G)">By repo</button>
        </div>
      )}
      <button data-fly="done" className={toolBtn(isDone)} onClick={() => showDone.set(!isDone)} title="Show done sessions">Done</button>
    </>
  )
}

// The cards a list view shows: the repo chosen in the sidebar, if any.
export function useViewCards(cards: Card[]) {
  const repo = repoFilter.use()
  return repo ? cards.filter(c => c.repoRoot === repo) : cards
}
