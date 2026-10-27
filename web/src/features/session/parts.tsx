// The small pieces every view draws on a session (components.js): the line
// that says why it is where it is, the replies, the "New" badge, its tags
// (overlaps, background work, memory, run, PRs, tasks, messages waiting,
// context used) and its action buttons with the Later and Colour menus.
// The canvas card, the board card and the inbox row all build on these.
import {
  Archive, Bell, Check, Clock, ExternalLink, Eye, Gauge, GitPullRequest, ListChecks, Mail, Palette, Play, RotateCcw, Square, Star, TriangleAlert,
} from "lucide-react"
import { motion } from "motion/react"
import { type ReactNode, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Kbd } from "@/components/ui/kbd"
import type { Card } from "@/lib/api-types"
import { undoable } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { openDialog } from "@/app/open-dialog"
import { type Tab, openSession } from "@/app/open-session"
import { toggleWatch, watched } from "@/features/alerts/prefs"
import { composerFill, takeBack } from "@/features/conversation/send"
import { boardAct, openInClaude, stopSession } from "@/features/board/act"
import { menu, toggleMenu } from "@/features/board/state"
import { answer, permit, sendText } from "./actions"
import { ago } from "./state"

const stop = (fn: () => void) => (e: React.MouseEvent) => (e.stopPropagation(), fn())
const openTab = (id: string, tab: Tab = "chat") => openSession(id, tab)

// ---------- colours ----------

// The colours a card can wear (lib/board.ts CARD_COLORS), in the order the
// keys 1–7 pick them; 0 takes the colour off.
export const CARD_COLORS = [
  { key: "lilac", label: "Lilac", hex: "#8b5cf6" },
  { key: "blue", label: "Blue", hex: "#3b82f6" },
  { key: "teal", label: "Teal", hex: "#14b8a6" },
  { key: "green", label: "Green", hex: "#22c55e" },
  { key: "yellow", label: "Yellow", hex: "#eab308" },
  { key: "orange", label: "Orange", hex: "#f97316" },
  { key: "pink", label: "Pink", hex: "#ec4899" },
] as const
export const tintOf = (color: string | null | undefined) => CARD_COLORS.find(c => c.key === color)?.hex ?? null

// ---------- the line under the title ----------

// Why the card is where it is: the question when it asks, the step under way
// ("Now:"), or what Claude did.
export function Context({ card, lines = 2, className }: { card: Card; lines?: number; className?: string }) {
  const clamp = { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } as const
  const base = cn("m-0 [overflow-wrap:anywhere] text-text-muted", className)
  if (card.column === "asking")
    return card.ask ? <p className={cn(base, "font-medium text-text")} style={clamp} title={card.ask}>{card.ask}</p> : null
  if (card.column === "working" && card.progress?.current)
    return <p className={base} style={clamp}><span className="font-semibold text-work">Now:</span> {card.progress.current}</p>
  if (card.recap && card.column !== "working") return <p className={cn(base, "text-[12.5px]")} style={clamp} title={card.recap}>{card.recap}</p>
  return null
}

// ---------- replies ----------

// A reply Claude offered, delivered by the bridge mod. One that ends asking
// for more ("…is: ") is a template: it goes to the reply box to be finished.
async function reply(card: Card, text: string) {
  if (/[:…]\s*$|\.\.\.\s*$/.test(text)) {
    openTab(card.id)
    setTimeout(() => composerFill.set({ id: card.id, text: `${text.trimEnd()} ` }), 120)
    return
  }
  try {
    const res = await sendText(card.id, text)
    undoable(res.isOpen ? `Replied: “${text.slice(0, 60)}”` : "Reply queued: it arrives when the session is free", () => void takeBack(card.id, { id: res.messageId, text }))
  } catch (err) {
    toast((err as Error).message || "Could not send")
  }
}
const say = (work: Promise<unknown>, done: string) => work.then(() => toast(done), (err: Error) => toast(err.message || "Could not answer"))

function Choice({ isFirst, title, onClick, children, isSmall }: { isFirst: boolean; title?: string; onClick: () => void; children: ReactNode; isSmall?: boolean }) {
  return (
    <button title={title} onClick={onClick}
      className={cn(
        "max-w-full truncate rounded-[13px] border px-2.5 font-semibold transition-[transform,background-color,filter] duration-120 ease-(--ease-out) active:scale-[0.96]",
        isSmall ? "h-6 text-[11.5px]" : "h-[26px] text-xs",
        isFirst ? "border-ask bg-ask text-surface hover:brightness-108" : "border-[color-mix(in_srgb,var(--ask)_45%,transparent)] bg-ask-soft text-ask hover:bg-[color-mix(in_srgb,var(--ask)_22%,transparent)]",
      )}>
      {children}
    </button>
  )
}

// What waits on you, one click each: Allow / Deny, a question's options, the
// replies Claude offered. A question with several parts opens the
// conversation; a session without the bridge mod is answered in Claude.
export function Replies({ card, isSmall }: { card: Card; isSmall?: boolean }) {
  if (card.column !== "asking") return null
  const permission = card.bridge?.permission
  const question = card.bridge?.question
  const only = question?.questions.length === 1 && !question.questions[0].multiSelect ? question.questions[0] : null
  let buttons: { label: string; title?: string; act: () => void }[] = []
  if (card.askKind === "permission" && permission)
    buttons = [
      { label: "Allow", act: () => say(permit(card.id, permission.id, "allow"), "Allowed") },
      { label: "Deny", act: () => say(permit(card.id, permission.id, "deny"), "Denied") },
    ]
  else if (card.askKind === "dialog")
    buttons = only && question
      ? only.options.map(o => ({ label: o.label, title: o.description ?? o.label, act: () => say(answer(card.id, question.id, { [only.question]: o.label }), "Answer sent") }))
      : question
        ? [{ label: "Reply", act: () => openTab(card.id) }]
        : [{ label: "Answer in Claude ↗", title: "You can answer this session only in Claude desktop", act: () => void openInClaude(card.id) }]
  buttons = [...buttons, ...card.choices.map(c => ({ label: c.label, title: c.message, act: () => void reply(card, c.message || c.label) }))]
  if (!buttons.length) return null
  return (
    <div className="nodrag flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
      {buttons.map((b, i) => <Choice key={`${i}-${b.label}`} isFirst={i === 0} title={b.title} onClick={b.act} isSmall={isSmall}>{b.label}</Choice>)}
    </div>
  )
}

// ---------- the badge ----------

// Unread: "New", or what it waits for when that is new (a question, an approval).
export function NewBadge({ card, className }: { card: Card; className?: string }) {
  if (!card.isUnread) return null
  const waits = card.column === "asking" ? (card.state === "permission" ? "permission" : "ask") : null
  return (
    <span title={waits ? "New since you last looked: it waits for you" : "Updated since you last looked at it"}
      className={cn("inline-flex h-[17px] flex-none items-center rounded-[5px] px-1.5 text-[10px] font-[750] tracking-[0.05em] text-surface uppercase",
        waits === "ask" ? "bg-ask" : waits === "permission" ? "bg-bad" : "bg-review", className)}>
      {waits === "ask" ? "Asks you" : waits === "permission" ? "Approval" : "New"}
    </span>
  )
}

// ---------- tags ----------

// A tag: full on the board and the inbox; on the canvas a small icon and a
// number, the words in the tooltip.
function Tag({ tone, isCompact, title, onClick, className, children }: {
  tone?: string; isCompact?: boolean; title?: string; onClick?: () => void; className?: string; children: ReactNode
}) {
  const look = cn(
    "inline-flex flex-none items-center whitespace-nowrap rounded-md font-medium tabular-nums [&_svg]:size-3",
    isCompact ? "h-5 gap-[3px] px-[5px] text-[11px]" : "h-[21px] gap-1 px-[7px] text-[11.5px]",
    tone ?? "bg-hover text-text-muted",
    onClick && !tone && "hover:bg-press hover:text-text",
    className,
  )
  return onClick ? <button className={cn("nodrag", look)} title={title} onClick={stop(onClick)}>{children}</button> : <span className={look} title={title}>{children}</span>
}

// Two open sessions that may step on each other: a click opens the other one.
function OverlapChip({ card, isCompact }: { card: Card; isCompact?: boolean }) {
  const list = card.overlaps ?? []
  if (!list.length) return null
  const one = list[0]
  const label = list.length > 1 ? `${list.length} sessions overlap`
    : one.files.length ? `${one.files.length} ${one.files.length === 1 ? "file" : "files"} with ${one.title}` : `Same folder as ${one.title}`
  const lines = list.map(o => `• ${o.title}: ${[o.isSameFolder && "working in the same folder", o.files.length && `edited ${o.files.map(f => f.split("/").pop()).join(", ")}`].filter(Boolean).join("; ")}`)
  return (
    <Tag tone="bg-ask-soft text-ask" isCompact={isCompact} className="max-w-60" title={`It may step on another session:\n${lines.join("\n")}\n\nClick to open it`} onClick={() => openTab(one.id)}>
      <TriangleAlert />{!isCompact && <span className="truncate">{label}</span>}
    </Tag>
  )
}

const BG_LABEL: Record<string, string> = { shell: "in the background", subagent: "subagent", monitor: "monitor", workflow: "workflow", current: "in progress" }

// A dot that beats while something runs in the background.
export const RunDot = () => <span className="size-2 flex-none rounded-full bg-run animate-run-beat" />

// How many things still run in the background, each in the tooltip.
function BackgroundChip({ card, now, isCompact }: { card: Card; now: number; isCompact?: boolean }) {
  const list = card.background ?? []
  if (!list.length) return null
  const what = (t: (typeof list)[number]) => t.description || t.command || BG_LABEL[t.type] || t.type || "task"
  const title = list.map(t => `• ${what(t)} (${BG_LABEL[t.type] ?? t.type}, ${ago(t.since, now)})`).join("\n")
  const label = list.every(t => t.type === "current") ? (list.length === 1 ? "1 long command" : `${list.length} long commands`) : `${list.length} running`
  return <Tag tone="bg-run-soft text-run" isCompact={isCompact} title={`Running now:\n${title}`}><RunDot />{!isCompact && label}</Tag>
}

const MB = 1024 ** 2
const GB = 1024 ** 3
const memText = (b: number) => (b >= GB ? `${(b / GB).toLocaleString("en-GB", { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(b / MB))} MB`)

// What a session and everything it started take on this Mac, from 1 GB.
function MemoryChip({ card, now, isCompact }: { card: Card; now: number; isCompact?: boolean }) {
  const m = card.memory
  if (!m || m.total < GB) return null
  const lines = m.items
    .filter(i => i.bytes >= 10 * MB)
    .map(i => `• ${i.label}${i.cwd ? ` · ${i.cwd}` : ""} · ${memText(i.bytes)}${i.kind === "session" ? "" : ` · ${ago(i.since, now)}`}${i.isDetached ? " · left running" : ""}${i.isForgotten ? " · unused" : ""}`)
  return (
    <Tag tone={m.total >= 3 * GB ? "bg-bad-soft text-bad" : "bg-run-soft text-run"} isCompact={isCompact}
      title={`Memory on this Mac: ${memText(m.total)}\n${lines.join("\n")}\n\nClick to see it and stop what you do not need`} onClick={() => openTab(card.id)}>
      <Gauge />{memText(m.total)}
    </Tag>
  )
}

// Its project running (the Run window): its port, or "starting".
function RunChip({ card, isCompact }: { card: Card; isCompact?: boolean }) {
  if (!card.run) return null
  return (
    <Tag tone="bg-work-soft text-work" isCompact={isCompact} title="This session's project is running" onClick={() => openDialog({ kind: "run", card })}>
      <Play className="!size-[11px]" />{card.run.ports[0] ? `:${card.run.ports[0]}` : "starting"}
    </Tag>
  )
}

type Pr = NonNullable<Card["prs"]>[number]
const PR_TONE = { open: "bg-work-soft text-work", draft: "bg-hover text-text-muted", merged: "bg-[rgb(139_92_246/0.12)] text-[#8b5cf6]", closed: "bg-bad-soft text-bad" }
const CHECKS = { pass: ["✓", "text-work"], fail: ["✗", "text-bad"], pending: ["•", "text-ask"] } as const

// A pull request: its state's colour, its checks; a click opens the PRs tab.
function PrChip({ pr, card, isCompact }: { pr: Pr; card: Card; isCompact?: boolean }) {
  const state = pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.isDraft ? "draft" : "open"
  const checks = pr.checks ? CHECKS[pr.checks as keyof typeof CHECKS] : null
  const title = `${pr.title} — ${state}${pr.checks ? `, checks ${{ pass: "passing", fail: "failing", pending: "running" }[pr.checks as "pass"] ?? pr.checks}` : ""}${
    pr.reviewDecision === "APPROVED" ? ", approved" : pr.reviewDecision === "CHANGES_REQUESTED" ? ", changes requested" : ""}`
  const prRepo = pr.url.split("/")[4]
  return (
    <Tag tone={PR_TONE[state]} isCompact={isCompact} title={title} onClick={() => openTab(card.id, "prs")}>
      <GitPullRequest />{prRepo && prRepo !== card.repo ? `${prRepo}#${pr.number}` : `#${pr.number}`}
      {checks && <b className={cn("ml-px font-extrabold", checks[1])}>{checks[0]}</b>}
    </Tag>
  )
}

// Messages waiting for a session: amber while they wait, red once it did not wake.
function PendingChip({ card, isCompact }: { card: Card; isCompact?: boolean }) {
  const pending = card.bridge?.pending ?? 0
  if (!pending) return null
  const stuck = card.bridge.stuck?.length || (card.bridge.wake?.untrusted ? pending : 0)
  return (
    <Tag tone={stuck ? "bg-bad-soft text-bad" : "bg-ask-soft text-ask"} isCompact={isCompact} onClick={() => openTab(card.id)}
      title={stuck ? "The session did not wake: open the conversation to deliver them" : "Your messages waiting for the session"}>
      <Mail />{pending}{stuck ? " undelivered" : ""}
    </Tag>
  )
}

// How full the context is: past 85% a new session is worth it.
export function UsageMeter({ usage, barW = 28 }: { usage: Card["usage"]; barW?: number }) {
  if (!usage) return null
  const pct = Math.min(100, Math.round((usage.context / usage.window) * 100))
  const tone = pct >= 85 ? "text-bad" : pct >= 65 ? "text-ask" : "text-faint"
  const fill = pct >= 85 ? "bg-bad" : pct >= 65 ? "bg-ask" : "bg-faint"
  const tokens = usage.context >= 1000 ? `${Math.round(usage.context / 1000)}k` : usage.context
  return (
    <span className={cn("inline-flex flex-none items-center gap-[5px] text-[11px] font-semibold tabular-nums", tone)}
      title={`Context used: ${tokens} of ${usage.window / 1000}k tokens (${pct}%)${pct >= 85 ? " — consider starting a new session" : ""}`}>
      <span className="h-1 overflow-hidden rounded-[2px] bg-hover" style={{ width: barW }}><i className={cn("block h-full rounded-[2px]", fill)} style={{ width: `${pct}%` }} /></span>{pct}%
    </span>
  )
}

// The canvas card's signals: small, an icon and a number. At mid zoom only
// the overlap stays.
export function Signals({ card, now, isMid }: { card: Card; now: number; isMid?: boolean }) {
  const prs = card.prs ?? []
  if (isMid) return card.overlaps?.length ? <span className="ml-auto flex flex-none items-center gap-1"><OverlapChip card={card} isCompact /></span> : null
  return (
    <span className="ml-auto flex flex-none items-center gap-1 empty:hidden">
      <OverlapChip card={card} isCompact />
      <BackgroundChip card={card} now={now} isCompact />
      <MemoryChip card={card} now={now} isCompact />
      <RunChip card={card} isCompact />
      {prs.length === 1 && <PrChip pr={prs[0]} card={card} isCompact />}
      {prs.length > 1 && <Tag isCompact title={prs.map(p => `#${p.number} ${p.title}`).join("\n")} onClick={() => openTab(card.id, "prs")}><GitPullRequest />{prs.length}</Tag>}
      {card.taskCount > 0 && <Tag isCompact className="text-text" title={`${card.taskCount} ${card.taskCount === 1 ? "task" : "tasks"}`} onClick={() => openTab(card.id, "tasks")}><ListChecks />{card.taskCount}</Tag>}
      <PendingChip card={card} isCompact />
      <UsageMeter usage={card.usage} barW={22} />
    </span>
  )
}

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

// Everything about it, in words (the board's cards and the inbox's rows).
export function Meta({ card, now, className }: { card: Card; now: number; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-[5px]", className)}>
      {card.isLaunching && <Tag tone="bg-work-soft text-work" title="The first turn runs headless; open it in Claude when it ends">headless</Tag>}
      {card.state === "permission" && card.column === "asking" && <Tag tone="bg-bad-soft text-bad">needs approval</Tag>}
      <OverlapChip card={card} />
      <BackgroundChip card={card} now={now} />
      <MemoryChip card={card} now={now} />
      <RunChip card={card} />
      {card.prs?.map(pr => <PrChip key={pr.url} pr={pr} card={card} />)}
      {card.taskCount > 0 && <Tag className="text-text" title="Show its tasks" onClick={() => openTab(card.id, "tasks")}><ListChecks />{card.taskCount} {card.taskCount === 1 ? "task" : "tasks"}</Tag>}
      <PendingChip card={card} />
      {card.column === "parked" && <Tag>{card.parkedUntil ? `until ${when(card.parkedUntil)}` : "no date"}</Tag>}
      {card.isWorktree && <Tag title={card.cwd}>worktree</Tag>}
      {card.isArchived && <Tag>archived in Claude desktop</Tag>}
      <span className="ml-auto"><UsageMeter usage={card.usage} /></span>
    </div>
  )
}

// ---------- actions ----------

// "Later" until… (park): the keys 1–5 pick one while the menu is open.
const at = (days: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}
export const PARK_OPTIONS = [
  { key: "1", label: "1 hour", until: () => Date.now() + 3600_000 },
  { key: "2", label: "This afternoon", hint: "16:00", until: () => at(new Date().getHours() >= 16 ? 1 : 0, 16) },
  { key: "3", label: "Tomorrow morning", hint: "9:00", until: () => at(1, 9) },
  { key: "4", label: "Monday", hint: "9:00", until: () => at((8 - new Date().getDay()) % 7 || 7, 9) },
  { key: "5", label: "No date", until: () => null },
]

// A small menu under its button: it arrives with a scale, closes on a click away.
function Menu({ title, onClose, className, children }: { title: string; onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose()
    // Listening only after this tick: the click that opened the menu must not close it.
    const timer = setTimeout(() => document.addEventListener("pointerdown", away), 0)
    return () => (clearTimeout(timer), document.removeEventListener("pointerdown", away))
  }, [onClose])
  return (
    <motion.div ref={ref} role="menu" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
      initial={{ opacity: 0, scale: 0.96, y: -2 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
      className={cn("nodrag nowheel absolute top-[calc(100%+6px)] right-0 z-30 min-w-[200px] origin-top-right cursor-default rounded-[10px] border border-line bg-raised p-[5px] text-[13px] font-normal text-text shadow-pop", className)}>
      <div className="px-2 pt-[5px] pb-1.5 text-[11.5px] font-semibold text-faint">{title}</div>
      {children}
    </motion.div>
  )
}

const closeMenu = () => menu.set(null)

function ParkMenu({ card }: { card: Card }) {
  return (
    <Menu title="Later, until…" onClose={closeMenu}>
      {PARK_OPTIONS.map(o => (
        <button key={o.key} role="menuitem" onClick={() => (closeMenu(), void boardAct(card, "park", { until: o.until() }))}
          className="flex h-[30px] w-full items-center justify-between gap-3 rounded-md px-2 text-left hover:bg-press">
          <span>{o.label}</span><span className="inline-flex items-center gap-2 text-xs text-faint">{o.hint ?? ""}<Kbd>{o.key}</Kbd></span>
        </button>
      ))}
    </Menu>
  )
}

function ColorMenu({ card }: { card: Card }) {
  const pick = (color: string) => (closeMenu(), void boardAct(card, "color", { color }))
  const swatch = "size-[22px] flex-none rounded-full border-2 border-transparent p-0 transition-transform duration-100 hover:scale-112"
  return (
    <Menu title="Colour" onClose={closeMenu} className="min-w-0">
      <div className="flex gap-1.5 px-1.5 pt-0.5 pb-1.5">
        <button role="menuitem" title="No colour (0)" aria-label="No colour" onClick={() => pick("")}
          className={cn(swatch, "border-[1.5px] border-dashed border-line-strong hover:bg-press", !card.color && "border-solid border-text shadow-[inset_0_0_0_2px_var(--raised)]")} />
        {CARD_COLORS.map((c, i) => (
          <button key={c.key} role="menuitem" title={`${c.label} (${i + 1})`} aria-label={c.label} onClick={() => pick(c.key)} style={{ background: c.hex }}
            className={cn(swatch, card.color === c.key && "border-text shadow-[inset_0_0_0_2px_var(--raised)]")} />
        ))}
      </div>
    </Menu>
  )
}

function IconBtn({ title, isOn, isCompact, tint, className, onClick, children, ...rest }: {
  title: string; isOn?: boolean; isCompact?: boolean; tint?: string | null; className?: string; onClick: () => void; children: ReactNode; "aria-haspopup"?: "menu"
}) {
  return (
    <button title={title} onClick={stop(onClick)} style={tint ? { color: tint } : undefined} {...rest}
      className={cn(
        "nodrag inline-flex items-center justify-center text-text-muted transition-[background-color,color,transform] duration-120 ease-(--ease-out) hover:bg-press hover:text-text active:scale-[0.92]",
        isCompact ? "size-6 rounded-md [&_svg]:size-3.5" : "size-7 rounded-[7px] [&_svg]:size-[15px]",
        isOn && "text-brand",
        className,
      )}>
      {children}
    </button>
  )
}

// The buttons on a card or a row, each with its key in the title.
export function Actions({ card, isCompact, className }: { card: Card; isCompact?: boolean; className?: string }) {
  const open = menu.use()
  const isParkOpen = open?.kind === "park" && open.id === card.id
  const isColorOpen = open?.kind === "color" && open.id === card.id
  const isWatched = watched.use().includes(card.id)
  const p = { isCompact }
  return (
    <div className={cn("flex items-center gap-px", className)} onClick={e => e.stopPropagation()}>
      <IconBtn {...p} title="Open in Claude (O)" onClick={() => void openInClaude(card.id)}><ExternalLink /></IconBtn>
      <IconBtn {...p} isOn={card.pinned} title={card.pinned ? "Unpin (P)" : "Pin (P)"} onClick={() => void boardAct(card, card.pinned ? "unpin" : "pin")}><Star /></IconBtn>
      {card.column !== "done" && (
        <IconBtn {...p} isOn={isWatched} onClick={() => toggleWatch(card)}
          title={isWatched ? "You will hear when it finishes or asks you: click to stop" : "Tell me when it finishes or asks me something"}><Bell /></IconBtn>
      )}
      <IconBtn {...p} isOn={!!card.run} title="Run: start this session's project" onClick={() => openDialog({ kind: "run", card })}><Play /></IconBtn>
      <span className="relative">
        <IconBtn {...p} isOn={isColorOpen} tint={isColorOpen ? null : tintOf(card.color)} title="Colour (C)" aria-haspopup="menu" onClick={() => toggleMenu("color", card.id)}><Palette /></IconBtn>
        {isColorOpen && <ColorMenu card={card} />}
      </span>
      {card.column === "pending" && (
        <IconBtn {...p} title="Mark to review: back to “To review”, as if you had not opened it (U)" onClick={() => void boardAct(card, "unseen")}><Eye /></IconBtn>
      )}
      {card.column === "working" && (
        <IconBtn {...p} title="Stop the running turn (S)" className="hover:text-bad" onClick={() => void stopSession(card)}><Square /></IconBtn>
      )}
      {card.column === "parked" ? (
        <IconBtn {...p} isOn title="Remove from Later (A)" onClick={() => void boardAct(card, "unpark")}><Clock /></IconBtn>
      ) : card.column !== "done" && (
        <span className="relative">
          <IconBtn {...p} isOn={isParkOpen} title="Later (A)" aria-haspopup="menu" onClick={() => toggleMenu("park", card.id)}><Clock /></IconBtn>
          {isParkOpen && <ParkMenu card={card} />}
        </span>
      )}
      {card.column === "done" ? (
        <>
          {!card.isArchived && <IconBtn {...p} title="Reopen (E)" onClick={() => void boardAct(card, "undone")}><RotateCcw /></IconBtn>}
          <IconBtn {...p} title="Archive: it leaves the board until the session moves again" onClick={() => void boardAct(card, "archive")}><Archive /></IconBtn>
        </>
      ) : (
        <IconBtn {...p} title="Mark as done (E)" onClick={() => void boardAct(card, "done")}><Check /></IconBtn>
      )}
    </div>
  )
}
