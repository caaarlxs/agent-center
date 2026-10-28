// The left column (sidebar.js): new session and "Catch me up", the views, the
// repos to filter by, the plan's limits, what the sessions take in memory,
// the folder of sent files, and the live connection, alerts, Setup and the
// keyboard help at the foot. It folds to icons (slim), and in a narrow window
// it is a drawer over the page.
import { BellOff, BookText, Columns3, Inbox, List, PanelLeft, Paperclip, Volume2, VolumeX } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Snapshot } from "@/lib/api-types"
import { post } from "@/lib/api"
import { bytesText, memText, MEMORY_DETAIL, MEMORY_LISTED, MEMORY_WARN } from "@/lib/format"
import { useLive } from "@/lib/live"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { repoDot } from "@/features/session/state"
import { notify, sound, speech, toggleNotify, toggleSound, toggleSpeech } from "@/features/alerts/prefs"
import { Limits, SlimLimits } from "@/features/limits/Limits"
import { openDialog } from "./open-dialog"
import { openSession } from "./open-session"
import { repoFilter, sideOpen, view, type View } from "./view-state"
import { Mem, Num } from "@/components/common/Num"
import { Anim } from "@/components/icons/animated"

export const sideFolded = persistedStore("sideSlim", false) // the classic board's name for it
export const toggleFolded = () => sideFolded.set(!sideFolded.get())

// A row of the views or repos list (.nav button): muted, the chosen one raised.
const navRow = (isOn: boolean, isSlim: boolean) =>
  cn(
    "relative flex h-[30px] w-full shrink-0 items-center gap-[9px] rounded-[7px] px-2 text-left font-medium text-text-muted transition-colors duration-100",
    isOn ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "hover:bg-hover hover:text-text",
    isSlim && "justify-center gap-0 px-0",
  )

// A count beside Inbox: what asks you (amber), what is new (brand).
function Pill({ tone, title, children, isSlim }: { tone: "ask" | "new"; title: string; children: ReactNode; isSlim: boolean }) {
  return (
    <span title={title}
      className={cn("inline-flex h-[18px] min-w-5 items-center justify-center rounded-[9px] px-1.5 text-[11px] font-[650] tabular-nums",
        tone === "ask" ? "bg-ask-soft text-ask" : "bg-brand-soft text-brand",
        isSlim && "absolute top-px right-0.5 h-[15px] min-w-4 px-1 text-[10px]")}>
      {children}
    </span>
  )
}

const VIEWS: { key: View; label: string; title: string; icon: ReactNode }[] = [
  { key: "inbox", label: "Inbox", title: "Inbox (1)", icon: <Inbox className="size-4 shrink-0" /> },
  { key: "board", label: "Board", title: "Board (2)", icon: <Columns3 className="size-4 shrink-0" /> },
  { key: "canvas", label: "Canvas", title: "Canvas (3)", icon: <Anim.LayoutGrid size={16} /> },
  { key: "tiers", label: "Tiers", title: "Tiers: sessions by importance (4)", icon: <List className="size-4 shrink-0" /> },
]

// A row under the limits (.side-uploads): icon, words, a number on the right.
const sideRow = (isSlim: boolean) =>
  cn("relative mx-0.5 mt-1.5 flex h-[30px] shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] text-text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-text",
    isSlim && "justify-center gap-0 px-0")
const TONE_TEXT = { ask: "text-ask hover:text-ask", bad: "text-bad hover:text-bad", run: "text-run hover:text-run", "": "" }

const PRESSURE: Record<string, string> = { warning: "Memory low", critical: "Out of memory" } // the Mac's, as macOS rates it
const line = (i: { label: string; cwd: string | null; bytes: number }) => `• ${i.label}${i.cwd ? ` · ${i.cwd}` : ""} · ${memText(i.bytes)}`

// The sessions together (their processes and what they started); open, the
// ones that take the most, each a click from its conversation; and the
// commands left running unused, to stop all at once.
function SessionsMemory({ cards, isSlim }: { cards: Snapshot["cards"]; isSlim: boolean }) {
  const memory = useLive(l => l.snapshot?.memory)
  const [isOpen, setOpen] = useState(false)
  const [isSure, setSure] = useState(false) // "Stop them" asks once more
  if (!memory?.total) return null
  const heavy = cards.filter(c => (c.memory?.total ?? 0) >= MEMORY_LISTED).sort((a, b) => b.memory!.total - a.memory!.total)
  const isTense = memory.pressure !== "normal" || heavy.some(c => c.memory!.total >= MEMORY_WARN)
  const forgotten = cards.flatMap(c => (c.memory?.items ?? []).filter(i => i.isForgotten).map(i => ({ ...i, session: c.title })))
  const forgottenBytes = forgotten.reduce((sum, i) => sum + i.bytes, 0)
  const stopForgotten = async () => {
    if (!isSure) return (setSure(true), void setTimeout(() => setSure(false), 4000))
    setSure(false)
    try {
      const res = await post<{ ok: boolean; stopped: number }>("/api/memory/stopforgotten")
      toast(`Stopped ${res.stopped} of ${forgotten.length}`)
    } catch (err) {
      toast((err as Error).message || "Could not stop them")
    }
  }
  return (
    <div className="flex flex-col">
      <button className={cn(sideRow(isSlim), isTense && TONE_TEXT.run)} aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}
        title="Memory your sessions and what they started take on this Mac (Activity Monitor's Memory column). Click to see which">
        <Anim.Gauge size={14} />
        {!isSlim && <span>Sessions</span>}
        {!isSlim && PRESSURE[memory.pressure] && <span className="text-[10.5px] font-semibold whitespace-nowrap text-bad">{PRESSURE[memory.pressure]}</span>}
        <span className={cn("ml-auto text-[11.5px] text-faint tabular-nums", isTense && "text-run", isSlim && "absolute -bottom-0.5 ml-0 text-[9.5px]")}><Mem bytes={memory.total} /></span>
      </button>
      {!isSlim && forgotten.length > 0 && (
        <div className="mx-0.5 mt-0.5 flex items-center gap-2 py-1 pr-2.5 pl-8 text-[11.5px] text-run"
          title={`Up for hours and idle for over 30 min:\n${forgotten.map(i => `${line(i)} (${i.session})`).join("\n")}`}>
          <span className="min-w-0 flex-1 truncate">{forgotten.length} left running, unused · {memText(forgottenBytes)}</span>
          <button className={cn("shrink-0 text-brand underline underline-offset-2", isSure && "font-semibold text-bad")} onClick={stopForgotten}>{isSure ? "Sure? Stop them" : "Stop them"}</button>
        </div>
      )}
      {!isSlim && isOpen && (
        <ul className="mx-0.5 mt-0.5 flex max-h-[220px] flex-col overflow-auto">
          {heavy.map(c => (
            <li key={c.id}>
              <button onClick={() => openSession(c.id)} title={c.memory!.items.filter(i => i.bytes >= MEMORY_DETAIL).map(line).join("\n")}
                className={cn("flex h-[26px] w-full items-center gap-2 rounded-[7px] pr-2.5 pl-8 text-left text-xs text-text-muted hover:bg-hover hover:text-text", c.memory!.total >= MEMORY_WARN && "text-run")}>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className={cn("shrink-0 text-[11.5px] text-faint tabular-nums", c.memory!.total >= MEMORY_WARN && "text-run")}>{memText(c.memory!.total)}</span>
              </button>
            </li>
          ))}
          {!heavy.length && <li className="px-2.5 py-1 text-[11.5px] text-text-muted">No session takes 100 MB</li>}
        </ul>
      )}
    </div>
  )
}

// The folder of files sent to sessions: amber from 500 MB, red from 1 GB, time to empty it.
function SentFiles({ isSlim }: { isSlim: boolean }) {
  const bytes = useLive(l => l.snapshot?.uploadsBytes) ?? 0
  const tone = bytes >= 1e9 ? "bad" : bytes >= 5e8 ? "ask" : ""
  const open = () => post("/api/uploads/open").catch(() => toast("Could not open the folder"))
  return (
    <button className={cn(sideRow(isSlim), TONE_TEXT[tone])} title="Open the sent files folder in Finder" onClick={open}>
      <Paperclip className="size-3.5 shrink-0" />
      {!isSlim && <span>Sent files</span>}
      <span className={cn("ml-auto text-[11.5px] text-faint tabular-nums", tone && "text-current", isSlim && "absolute -bottom-0.5 ml-0 text-[9.5px]")}>{bytesText(bytes)}</span>
    </button>
  )
}

// A small button at the foot (.ghost-btn): muted, brand when on.
const footBtn = (isOn = false) =>
  cn("inline-flex items-center gap-1.5 rounded-md p-1 text-text-muted transition-[color,background-color,transform] duration-[120ms] hover:bg-hover hover:text-text active:scale-[0.92]", isOn && "text-brand hover:text-brand")

export function Sidebar() {
  const isSlimChosen = sideFolded.use()
  const isDrawerOpen = sideOpen.use()
  const isSlim = isSlimChosen && !isDrawerOpen // the drawer always shows words
  const repos = useLive(l => l.snapshot?.repos) ?? []
  const cards = useLive(l => l.snapshot?.cards) ?? []
  const version = useLive(l => l.snapshot?.version) // the commit the board runs
  const isConnected = useLive(l => l.isConnected)
  const chosen = repoFilter.use()
  const shown = view.use()
  const isSound = sound.use() === "on"
  const notifyState = notify.use()
  const speechMode = speech.use().mode
  const open = cards.filter(c => c.column !== "done")
  const asking = open.filter(c => c.column === "asking").length
  const unread = open.filter(c => c.isUnread).length
  const chooseRepo = (root: string | null) => (repoFilter.set(root), sideOpen.set(false))
  const chooseView = (v: View) => (view.set(v), sideOpen.set(false))
  return (
    <>
      {/* The drawer's scrim, in a narrow window. */}
      <div onClick={() => sideOpen.set(false)} aria-hidden
        className={cn("fixed inset-0 z-[44] bg-black/30 transition-opacity duration-200 min-[861px]:hidden", isDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside data-sidebar
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-line bg-side transition-[width,translate] duration-200 ease-(--ease-out)",
          isSlim ? "w-[60px] px-2 pt-3.5 pb-2.5" : "w-64 px-2.5 pt-3.5 pb-2.5",
          "max-[860px]:fixed max-[860px]:inset-y-0 max-[860px]:left-0 max-[860px]:z-[45] max-[860px]:w-[260px] max-[860px]:duration-[220ms]",
          isDrawerOpen ? "max-[860px]:shadow-pop" : "max-[860px]:-translate-x-full",
        )}
        ref={el => void el?.ownerDocument.documentElement.style.setProperty("--side-w", isSlim ? "60px" : "256px")}>
        <div className={cn("flex items-center gap-[9px] px-2 pt-0.5 pb-4 text-sm font-[650] tracking-[-0.01em]", isSlim && "flex-col gap-3 px-0 pb-3.5")}>
          <span className="inline-flex h-4 items-end gap-0.5" aria-hidden>
            <i className="h-4 w-1 rounded-sm bg-brand" />
            <i className="h-[11px] w-1 rounded-sm bg-brand opacity-70" />
            <i className="h-[7px] w-1 rounded-sm bg-brand opacity-45" />
          </span>
          {!isSlim && <span>Agent Center</span>}
          <button className={cn(footBtn(), !isSlim && "ml-auto", "max-[860px]:hidden")} onClick={toggleFolded} title={isSlim ? "Show the sidebar" : "Fold the sidebar to icons"}>
            <PanelLeft className="size-[15px]" />
          </button>
        </div>
        <div className="mx-0.5 mb-3.5 flex flex-col gap-1.5">
          <Button className={cn("h-[34px] w-full justify-start gap-2", isSlim && "justify-center gap-0 px-0")} onClick={() => openDialog({ kind: "new" })} title="New session (N)">
            <Anim.Plus size={15} />{!isSlim && <>New session<Kbd className="ml-auto">N</Kbd></>}
          </Button>
          <Button variant="outline" className={cn("h-[34px] w-full justify-start gap-2", isSlim && "justify-center gap-0 px-0")} onClick={() => openDialog({ kind: "digest" })}
            title="Summary of what your sessions did since you last looked (D)">
            <Anim.Sun size={14} />{!isSlim && <>Catch me up<Kbd className="ml-auto">D</Kbd></>}
          </Button>
          <Button variant="outline" className={cn("h-[34px] w-full justify-start gap-2", isSlim && "justify-center gap-0 px-0")} onClick={() => openDialog({ kind: "context" })}
            title="General context: ~/.claude/CLAUDE.md, what Claude reads in every session. See it and edit it">
            <BookText className="size-3.5" />{!isSlim && "General context"}
          </Button>
        </div>
        <nav className="flex flex-col gap-px">
          {VIEWS.map(v => (
            <button key={v.key} className={navRow(shown === v.key, isSlim)} onClick={() => chooseView(v.key)} title={v.title}>
              {v.icon}{!isSlim && v.label}
              {v.key === "inbox" && (unread > 0 || asking > 0) && (
                <span className={cn("flex gap-1", !isSlim && "ml-auto")}>
                  {unread > 0 && !isSlim && <Pill tone="new" title="Updated since you last looked" isSlim={isSlim}><Num value={unread} suffix=" new" /></Pill>}
                  {asking > 0 && <Pill tone="ask" title="Asking you something" isSlim={isSlim}><Num value={asking} /></Pill>}
                </span>
              )}
            </button>
          ))}
        </nav>
        {!isSlim && <div className="mx-2 mt-[18px] mb-1.5 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase">Repos</div>}
        <nav className={cn("-mx-1 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1", isSlim && "mx-0 mt-2 px-0")}>
          <button className={cn(navRow(!chosen, isSlim), "h-7 font-[450]")} onClick={() => chooseRepo(null)} title={isSlim ? "All" : undefined}>
            <i className="size-[9px] shrink-0 rounded-[3px] bg-[conic-gradient(hsl(20_70%_58%),hsl(140_50%_50%),hsl(220_70%_62%),hsl(300_50%_60%),hsl(20_70%_58%))]" />
            {!isSlim && <>All<span className="ml-auto text-[11.5px] text-faint tabular-nums">{open.length}</span></>}
          </button>
          {repos.map(r => {
            const row = (
              <button className={cn(navRow(chosen === r.root, isSlim), "h-7 font-[450]")} title={isSlim ? undefined : r.root}
                onClick={() => chooseRepo(chosen === r.root ? null : r.root)}>
                <i className="size-[9px] shrink-0 rounded-[3px]" style={{ background: repoDot(r.name) }} />
                {!isSlim && <><span className="min-w-0 truncate">{r.name}</span><span className="ml-auto text-[11.5px] text-faint tabular-nums">{r.count || ""}</span></>}
              </button>
            )
            return isSlim ? (
              <Tooltip key={r.root}>
                <TooltipTrigger asChild>{row}</TooltipTrigger>
                <TooltipContent side="right">{r.name}</TooltipContent>
              </Tooltip>
            ) : <span key={r.root} className="contents">{row}</span>
          })}
        </nav>
        {isSlim ? <SlimLimits /> : <Limits />}
        <SessionsMemory cards={cards} isSlim={isSlim} />
        <SentFiles isSlim={isSlim} />
        <footer className={cn("mt-2 flex items-center justify-between border-t border-line px-1.5 pt-2.5", isSlim && "flex-col gap-2 px-0")}>
          {/* The version under "Live", so the row of buttons never breaks in a narrow window. */}
          {/* Two columns: the dot beside "Live", the version under its text. */}
          <span className="grid shrink-0 grid-cols-[7px_auto] items-center gap-x-1.5 text-xs leading-tight text-text-muted" title={isSlim ? (isConnected ? "Live" : "Reconnecting…") : undefined}>
            <i className={cn("size-[7px] rounded-full", isConnected ? "bg-work shadow-[0_0_0_3px_var(--work-soft)]" : "bg-faint")} />
            {!isSlim && <span className="whitespace-nowrap">{isConnected ? "Live" : "Reconnecting…"}</span>}
            {!isSlim && version && (
              <span className="col-start-2 font-mono text-[10.5px] text-faint" title={`Version ${version.commit} · ${new Date(version.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}>
                {version.commit}
              </span>
            )}
          </span>
          {!isSlim && (
            <>
              <button className={footBtn(notifyState === "on")} onClick={toggleNotify}
                title={notifyState === "on" ? "Notifications on: a macOS notification when a session asks you something while you are in another window. Click to turn them off" : notifyState === "blocked" ? "Chrome blocks notifications for this app" : "Notify me (macOS) when a session asks me something while I am in another window"}>
                {notifyState === "on" ? <Anim.Bell size={15} /> : <BellOff className="size-[15px]" />}
              </button>
              <button className={footBtn(isSound)} onClick={toggleSound}
                title={isSound ? "Sound on: a chime when a session finishes or asks you something, also while you look at the board. Click to turn it off" : "Play a chime when a session finishes or asks me something, also while I look at the board"}>
                {isSound ? <Volume2 className="size-[15px]" /> : <VolumeX className="size-[15px]" />}
              </button>
              <button className={footBtn(speechMode !== "off")} onClick={toggleSpeech}
                title={speechMode !== "off" ? `Read aloud on (${speechMode === "all" ? "every session" : "sessions with the bell"}): the Mac says what a session did when its turn ends. Click to turn it off` : "Read aloud what a session did when its turn ends (voice and speed in Setup)"}>
                <Anim.AudioLines size={15} />
              </button>
            </>
          )}
          <button className={footBtn()} onClick={() => openDialog({ kind: "setup" })} title="Setup: hook, mod, dictation, tasks…"><Anim.Settings size={15} /></button>
          {!isSlim && (
            <button className={footBtn()} onClick={() => openDialog({ kind: "help" })} title="Keyboard shortcuts (?)">
              <Anim.Keyboard size={15} /><Kbd>?</Kbd>
            </button>
          )}
        </footer>
      </aside>
    </>
  )
}
