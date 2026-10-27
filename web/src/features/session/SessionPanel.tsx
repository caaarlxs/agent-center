// The panel of one session (reader.js): its state, repo and branch on one row
// with its actions, Open in Claude, widen and close; its title under them
// (renamed here); its views in a row of tabs; and the view. Changes, Code and
// Files are workspaces: the panel takes the whole width. Code stays alive once
// opened, so its open files and unsaved text survive a look at another tab.
import { Archive, ArrowUpRight, Bell, Check, Clock, Code2, Eye, FileDiff, FileText, GitBranch, GitPullRequest, ListChecks, Lock, Maximize2, MessageSquare, Minimize2, Palette, Pencil, Play, RotateCcw, Square, Star, X } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import type { Card } from "@/lib/api-types"
import { useLive } from "@/lib/live"
import { createStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { type Tab, WORKSPACES, openSession, showTab } from "@/app/open-session"
import { openDialog } from "@/app/open-dialog"
import { toggleWatch, watched } from "@/features/alerts/prefs"
import { Changes } from "@/features/changes/Changes"
import { CodeWorkspace } from "@/features/code/CodeWorkspace"
import { Files } from "@/features/files/Files"
import { Chat } from "@/features/conversation/Chat"
import { Prs } from "@/features/prs/Prs"
import { Tasks } from "@/features/tasks/Tasks"
import { CARD_COLORS, LATER, actOn, launch, rename, stopTurn, tintOf } from "./actions"
import { isWide, toggleWide } from "./panel-width"
import { STATE_LABEL, repoDot, repoText, stateOf, type StateKey } from "./state"

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "chat", label: "Conversation", icon: <MessageSquare /> },
  { key: "changes", label: "Changes", icon: <FileDiff /> },
  { key: "code", label: "Code", icon: <Code2 /> },
  { key: "prs", label: "PRs", icon: <GitPullRequest /> },
  { key: "files", label: "Files", icon: <FileText /> },
  { key: "tasks", label: "Tasks", icon: <ListChecks /> },
]

// A session opened from the search that is not on the board: what the
// search knew of it, for the head (main.js:717).
export const openedResult = createStore<{ id: string; title: string; repo: string | null } | null>(null)

// The state in words (components.js StatusChip): a tinted chip with an icon,
// or a dot that pulses while Claude works.
const CHIP: Record<StateKey, { tone: string; icon?: ReactNode }> = {
  permission: { tone: "bg-bad-soft text-bad", icon: <Lock className="size-3" /> },
  asking: { tone: "bg-ask-soft text-ask" },
  working: { tone: "bg-work-soft text-work" },
  parked: { tone: "bg-hover text-text-muted", icon: <Clock className="size-3" /> },
  done: { tone: "bg-hover text-text-muted", icon: <Check className="size-3" /> },
  stale: { tone: "bg-hover text-text-muted" },
  pending: { tone: "bg-hover text-[color-mix(in_srgb,var(--review)_50%,var(--faint))]" },
  review: { tone: "bg-review-soft text-review" },
}
export function StatusChip({ card }: { card: Card }) {
  const state = stateOf(card)
  const chip = CHIP[state]
  const label = state === "stale" && card.isInterrupted && !card.isStale ? "Interrupted" : state === "pending" ? "Pending" : STATE_LABEL[state]
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-semibold", chip.tone)}>
      {chip.icon ?? <i className={cn("size-[7px] rounded-full bg-current", state === "working" && "pulse-ring")} />}
      {label}
    </span>
  )
}

export function RepoTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: repoText(name) }}>
      <i className="size-[7px] rounded-[2px]" style={{ background: repoDot(name) }} />{name}
    </span>
  )
}

// A compact icon button of the head (.actions.compact .icon-btn): 24px.
const iconBtn = (isOn = false) =>
  cn("inline-grid size-6 shrink-0 place-items-center rounded-md text-text-muted transition-[background-color,color,transform] duration-[120ms] ease-(--ease-out) hover:bg-press hover:text-text active:scale-[0.92] [&_svg]:size-3.5",
    isOn && "text-brand hover:text-brand")
const menuPop = "min-w-[200px] rounded-[10px] border-line bg-raised p-[5px] shadow-pop"

// The session's actions in the head (components.js Actions, compact).
function Actions({ card }: { card: Card }) {
  const isWatched = watched.use().includes(card.id)
  const isDone = card.column === "done"
  const tint = tintOf(card.color)
  return (
    <div className="mr-1 flex items-center gap-px">
      <button className={iconBtn(card.pinned)} title={card.pinned ? "Unpin (P)" : "Pin (P)"} onClick={() => actOn(card, card.pinned ? "unpin" : "pin")}><Star /></button>
      {!isDone && (
        <button className={iconBtn(isWatched)} onClick={() => toggleWatch(card)}
          title={isWatched ? "You will hear when it finishes or asks you: click to stop" : "Tell me when it finishes or asks me something"}><Bell /></button>
      )}
      <button className={iconBtn(!!card.run)} title="Run: start this session's project" onClick={() => openDialog({ kind: "run", card })}><Play /></button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className={iconBtn()} title="Colour (C)" style={tint ? { color: tint } : undefined}><Palette /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={cn(menuPop, "min-w-0")}>
          <DropdownMenuLabel className="px-2 pt-[5px] pb-1.5 text-[11.5px] font-semibold text-faint">Colour</DropdownMenuLabel>
          <div className="flex gap-1.5 px-1.5 pt-0.5 pb-1.5">
            <DropdownMenuItem title="No colour (0)" aria-label="No colour" onSelect={() => actOn(card, "color", { color: "" })}
              className={cn("size-[22px] rounded-full border-[1.5px] border-dashed border-line-strong p-0 hover:bg-press", !card.color && "border-solid border-text")} />
            {CARD_COLORS.map((c, i) => (
              <DropdownMenuItem key={c.key} title={`${c.label} (${i + 1})`} aria-label={c.label} onSelect={() => actOn(card, "color", { color: c.key })}
                className={cn("size-[22px] rounded-full border-2 border-transparent p-0 transition-transform duration-100 hover:scale-[1.12] focus:bg-(--tint)", card.color === c.key && "border-text shadow-[inset_0_0_0_2px_var(--raised)]")}
                style={{ background: c.tint, ["--tint" as string]: c.tint }} />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {card.column === "pending" && (
        <button className={iconBtn()} title="Mark to review: back to “To review”, as if you had not opened it (U)" onClick={() => actOn(card, "unseen")}><Eye /></button>
      )}
      {card.column === "working" && (
        <button className={cn(iconBtn(), "hover:text-bad")} title="Stop the running turn (S)" onClick={() => stopTurn(card)}><Square /></button>
      )}
      {card.column === "parked" ? (
        <button className={iconBtn(true)} title="Remove from Later (A)" onClick={() => actOn(card, "unpark")}><Clock /></button>
      ) : !isDone && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><button className={iconBtn()} title="Later (A)"><Clock /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={menuPop}>
            <DropdownMenuLabel className="px-2 pt-[5px] pb-1.5 text-[11.5px] font-semibold text-faint">Later, until…</DropdownMenuLabel>
            {LATER.map(o => (
              <DropdownMenuItem key={o.key} className="h-[30px] justify-between gap-3 rounded-md px-2" onSelect={() => actOn(card, "park", { until: o.until() })}>
                <span>{o.label}</span><span className="flex items-center gap-1.5 text-xs text-faint">{o.hint}<Kbd>{o.key}</Kbd></span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isDone ? (
        <>
          {!card.isArchived && <button className={iconBtn()} title="Reopen (E)" onClick={() => actOn(card, "undone")}><RotateCcw /></button>}
          <button className={iconBtn()} title="Archive: it leaves the board until the session moves again" onClick={() => actOn(card, "archive")}><Archive /></button>
        </>
      ) : (
        <button className={iconBtn()} title="Mark as done (E)" onClick={() => actOn(card, "done")}><Check /></button>
      )}
    </div>
  )
}

// T (keys.ts) asks the open panel to rename its session.
const renameAsked = createStore(0)
export const startRename = () => renameAsked.set(renameAsked.get() + 1)

// The title, renamed here with a double click, the pencil or T: Enter or a
// blur keeps it, Esc drops it (reader.js Title).
function Title({ card, fallback }: { card: Card | undefined; fallback: string }) {
  const [isEditing, setEditing] = useState(false)
  const [shown, setShown] = useState<string | null>(null) // the new name, until the snapshot has it
  const input = useRef<HTMLInputElement>(null)
  const isSettled = useRef(false)
  const asked = renameAsked.use()
  const firstAsk = useRef(asked)
  useEffect(() => void (asked !== firstAsk.current && card && setEditing(true)), [asked])
  useEffect(() => void (isEditing && ((isSettled.current = false), input.current?.select())), [isEditing])
  useEffect(() => void (shown !== null && card?.title === shown && setShown(null)), [card?.title, shown])
  if (!card) return <h2 className="m-0 line-clamp-2 text-base leading-[1.3] font-[650] tracking-[-0.01em] [overflow-wrap:anywhere]">{fallback}</h2>
  const finish = (isSaving: boolean) => {
    if (isSettled.current) return
    isSettled.current = true
    const title = input.current!.value.trim()
    if (isSaving && title !== card.title) (setShown(title || null), void rename(card.id, title))
    setEditing(false)
  }
  if (isEditing)
    return (
      <input ref={input} defaultValue={card.title} maxLength={140} aria-label="Name"
        className="w-full rounded-md border border-brand bg-surface px-2 py-1 text-[15px] font-[650] shadow-[0_0_0_3px_var(--brand-soft)] outline-none"
        onKeyDown={e => {
          if (e.key === "Enter") finish(true)
          if (e.key === "Escape") (e.stopPropagation(), e.preventDefault(), finish(false))
        }}
        onBlur={() => finish(true)} />
    )
  return (
    <h2 className="group m-0 flex items-center gap-1.5 text-base leading-[1.3] font-[650] tracking-[-0.01em]" title="Double-click or T to rename (on the board only)" onDoubleClick={() => setEditing(true)}>
      <span className="line-clamp-2 [overflow-wrap:anywhere]">{shown ?? card.title}</span>
      <button className={cn(iconBtn(), "size-[22px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-[13px]")} onClick={() => setEditing(true)} aria-label="Rename"><Pencil /></button>
      {card.hasOwnTitle && <span className="shrink-0 rounded-md bg-hover px-1.5 py-px text-[11px] font-medium text-text-muted" title="Name set on the board; Claude desktop keeps its own">renamed</span>}
    </h2>
  )
}

export function SessionPanel({ id, tab: asked, file }: { id: string; tab: Tab; file?: string }) {
  const card = useLive(l => l.snapshot?.cards.find(c => c.id === id))
  const hasTasks = useLive(l => l.snapshot?.features?.organizer !== false)
  const result = openedResult.use()
  const wide = isWide.use()
  const tabs = hasTasks ? TABS : TABS.filter(t => t.key !== "tasks")
  const tab = tabs.some(t => t.key === asked) ? asked : "chat"
  const isWorkspace = WORKSPACES.has(tab)
  // Code stays mounted once opened, hidden while another tab shows.
  const [hasCode, setHasCode] = useState(tab === "code")
  useEffect(() => void (tab === "code" && setHasCode(true)), [tab])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("[role=dialog], [role=menu]")) return
      const el = e.target as HTMLElement
      if (el.closest?.("input, textarea, select, [contenteditable=true], .monaco-editor")) return void (el.closest(".monaco-editor") || el.blur())
      if (isWorkspace) showTab("chat")
      else openSession(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isWorkspace])
  const fromSearch = result?.id === id ? result : null
  const repo = card?.repo ?? fromSearch?.repo
  const counts: Partial<Record<Tab, number>> = { prs: card?.prs?.length ?? 0, tasks: card?.taskCount ?? 0 }
  return (
    <aside aria-label="Conversation" className="flex h-full min-h-0 min-w-0 flex-col border-l border-line bg-surface">
      <header className="flex flex-col gap-1.5 py-2.5 pr-3 pl-5 max-[860px]:px-3 max-[860px]:pl-4">
        <div className="flex min-h-[30px] min-w-0 items-center gap-2.5 max-[860px]:flex-wrap">
          {card && <StatusChip card={card} />}
          {repo && <RepoTag name={repo} />}
          {card?.branch && <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-[11.5px] text-text-muted"><GitBranch className="size-3 shrink-0" /><span className="truncate">{card.branch}</span></span>}
          <span className="ml-auto flex shrink-0 items-center gap-1 max-[860px]:order-first max-[860px]:w-full max-[860px]:justify-end">
            {card && <Actions card={card} />}
            <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-brand bg-brand px-2.5 text-[12.5px] font-medium whitespace-nowrap text-brand-text transition-[filter,transform] duration-[120ms] hover:brightness-106 active:scale-[0.97]"
              onClick={() => launch(id)} title="Open in Claude (O)">
              <span className="max-[860px]:hidden">Open in Claude</span><ArrowUpRight className="size-3" />
            </button>
            {!isWorkspace && (
              <button className={cn(iconBtn(), "size-7 [&_svg]:size-[15px] max-[1100px]:hidden")} onClick={toggleWide} title={wide ? "Normal width" : "Widen the panel"}>
                {wide ? <Minimize2 /> : <Maximize2 />}
              </button>
            )}
            <button className={cn(iconBtn(), "size-7 [&_svg]:size-4")} onClick={() => openSession(null)} title="Close (Esc)"><X /></button>
          </span>
        </div>
        <Title card={card} fallback={fromSearch?.title ?? "Conversation"} />
      </header>
      <nav role="tablist" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-3 [scrollbar-width:none]">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => showTab(t.key)} title={t.label}
            className={cn("relative flex items-center gap-1.5 px-2.5 py-[9px] text-[13px] font-[550] whitespace-nowrap text-text-muted transition-colors duration-[120ms] hover:text-text [&_svg]:size-3.5 [&_svg]:opacity-70",
              tab === t.key && "text-text after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-sm after:bg-text")}>
            {t.icon}{t.label}{(counts[t.key] ?? 0) > 0 && <span className="text-[11px] text-text-muted tabular-nums">{counts[t.key]}</span>}
          </button>
        ))}
      </nav>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "chat" && <Chat key={id} id={id} card={card} />}
        {tab === "changes" && <Changes key={id} id={id} />}
        {tab === "prs" && <Prs key={id} id={id} />}
        {tab === "tasks" && <Tasks key={id} id={id} />}
        {tab === "files" && <Files key={id} id={id} file={file} />}
        {hasCode && <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "code" && "hidden")}><CodeWorkspace key={id} id={id} /></div>}
      </div>
    </aside>
  )
}
