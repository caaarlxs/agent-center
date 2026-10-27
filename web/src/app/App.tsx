// The app's shell. /next/design shows the design system (every component the
// board uses, with made-up data); everything else is the board: the sidebar,
// the top bar with the view's name, the search and "Next up", the view, and
// a session's panel sliding over them from the right.
import { Menu, Plus, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DesignSystem } from "@/design/DesignSystem"
import { get, post } from "@/lib/api"
import { live, useLive } from "@/lib/live"
import { clock } from "@/lib/format"
import { MainView } from "@/features/board/MainView"
import { useMarkSeen } from "@/features/board/seen"
import { ViewTools } from "@/features/board/Views"
import { focusComposer } from "@/features/conversation/send"
import { SearchPalette } from "@/features/search/SearchPalette"
import { PanelSlot } from "@/features/session/PanelSlot"
import { nextAfter, waitingOf } from "@/features/session/waiting"
import { openNow, openSession, useOpenSession } from "./open-session"
import { useAlerts } from "@/features/alerts/useAlerts"
import { Dialogs } from "./Dialogs"
import { HelpDialog } from "@/features/keys/HelpDialog"
import { useBoardKeys } from "@/features/keys/useBoardKeys"
import { useHistoryWalk } from "./history-walk"
import { openDialog } from "./open-dialog"
import { type Update, isStale } from "./update"
import { Sidebar } from "./Sidebar"
import { VIEW_NAME, focusCard, repoFilter, sideOpen, useShownView, view, type View } from "./view-state"

export function App() {
  if (location.pathname.replace(/\/$/, "").endsWith("/design")) return <DesignSystem />
  return (
    <TooltipProvider delayDuration={300}>
      <Board />
      <Toaster />
    </TooltipProvider>
  )
}

// "Next up" (F): opens what waits for you after the open one, its reply box
// ready; the canvas goes to it.
export function nextUp() {
  const waiting = waitingOf(live().snapshot?.cards ?? [])
  const open = openNow()
  if (!waiting.length) return void toast("Nothing waits for you")
  if (waiting.length === 1 && waiting[0].id === open?.id) return void toast("Nothing else waits for you")
  const next = nextAfter(waiting, open?.id ?? null)
  if (!next) return
  openSession(next.id)
  focusCard(next.id)
  setTimeout(() => focusComposer(next.id), 150)
}

// Links from the page or a message open in a new window: the board never
// navigates away from itself (main.js:449-460).
function useLinksOutside() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || e.defaultPrevented || a.getAttribute("href")!.startsWith("#") || a.hasAttribute("download")) return
      e.preventDefault()
      window.open(a.href, "_blank", "noopener,noreferrer")
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])
}

// A press on empty space closes the panel; on a card, a row, a control or a
// menu it does what that does (main.js:561-566): a card or row switches it.
const KEEPS_PANEL =
  "[data-panel], [data-panel-edge], .react-flow__node, [data-id], [role=menu], [role=dialog], [role=listbox], [data-sonner-toaster], button, a, input, textarea, select, label, [data-scrim]"
function useCloseOnEmpty(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest?.(KEEPS_PANEL)) return
      openSession(null)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [isOpen])
}

// The tab's title counts what asks you, or marks what is new (main.js:347-352).
function useTabTitle(asking: number, unread: number) {
  useEffect(() => void (document.title = asking ? `(${asking}) Agent Center` : unread ? "• Agent Center" : "Agent Center"), [asking, unread])
}

// A link can open a session or a view: ?open=<id>, ?view=inbox|board|canvas|tiers.
function useLinkedOpen() {
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const id = params.get("open")
    const linked = params.get("view") as View | null
    if (linked && linked in VIEW_NAME) view.set(linked)
    if (id) (openSession(id), focusCard(id))
    if (!id && !linked) return
    params.delete("open")
    params.delete("view")
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`)
  }, [])
  // The service worker forwards a click on a notification (sw.js).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const onMessage = (e: MessageEvent) => e.data?.open && (openSession(e.data.open), focusCard(e.data.open))
    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [])
}

// The server does not answer. A short drop (a restart) stays quiet; after a
// few seconds the page says so, and that what it shows may be old.
function Offline() {
  const lostAt = useLive(l => l.lostAt)
  const hasData = useLive(l => !!l.snapshot)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!lostAt) return
    const timer = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(timer)
  }, [lostAt])
  if (!lostAt || Date.now() - lostAt < 4000) return null
  return (
    <div role="alert" className="shrink-0 bg-bad-soft px-5 py-2 text-[12.5px] leading-normal text-bad">
      <strong>The server is not responding{hasData ? ` since ${clock(lostAt)}` : ""}.</strong>
      {hasData ? " What you see may be out of date." : ""} macOS restarts it on its own; the page retries every few seconds. If it stays down, check{" "}
      <code className="font-mono text-[11.5px]">~/organizer/agent-center/logs/server.log</code>.
    </div>
  )
}

// After a `git pull` (main.js:801-833): one click brings what runs old code
// up to date, then the page reloads once the server answers again.
function UpdateBanner() {
  const update = useLive(l => l.snapshot?.update as Update | undefined)
  const loaded = useRef<Update | null>(null)
  const [isBusy, setBusy] = useState(false)
  if (update && loaded.current === null) loaded.current = update
  if (!isStale(update, loaded.current)) return null
  const run = async () => {
    setBusy(true)
    try {
      const res = await post<{ ok: boolean; isRestarting?: boolean; needsRestart?: boolean }>("/api/update")
      if (res.needsRestart) return void (setBusy(false), toast("Restart the server to finish"))
      if (res.isRestarting) await serverBack()
      location.reload()
    } catch (err) {
      setBusy(false)
      toast((err as Error).message || "Could not update")
    }
  }
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 bg-brand-soft px-5 py-1.5 text-[12.5px] text-text">
      <span>A newer version of Agent Center is on disk.</span>
      <Button className="h-[26px]" disabled={isBusy} onClick={run}>{isBusy ? "Updating…" : "Update"}</Button>
    </div>
  )
}

// The server restarting: answered again, or given up after half a minute.
async function serverBack() {
  await new Promise(r => setTimeout(r, 800))
  for (let i = 0; i < 60; i++) {
    if (await get("/api/update").then(() => true, () => false)) return
    await new Promise(r => setTimeout(r, 500))
  }
}

// The top bar (main.js:727-750): the view's name and the repo you filter by,
// the search, and "Next up" with how many things wait for you.
function TopBar({ waiting, onSearch }: { waiting: number; onSearch: () => void }) {
  const shown = useShownView()
  const hasData = useLive(l => !!l.snapshot)
  const chosen = repoFilter.use()
  const repoName = useLive(l => (chosen ? l.snapshot?.repos.find(r => r.root === chosen)?.name : undefined))
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5 max-[860px]:gap-2 max-[860px]:px-3">
      <Button variant="ghost" size="icon-sm" className="min-[861px]:hidden" onClick={() => sideOpen.set(!sideOpen.get())} title="Menu"><Menu /></Button>
      <h1 className="m-0 flex items-baseline gap-2 text-[15px] font-[650] tracking-[-0.01em] whitespace-nowrap">
        {VIEW_NAME[shown]}
        {repoName && (
          <button className="group inline-flex items-center gap-1 text-[13px] font-medium text-text-muted hover:text-text" onClick={() => repoFilter.set(null)}
            title="You only see this repo. Click to see all">
            <span className="mr-1 text-faint">/</span>{repoName}<X className="size-[11px] opacity-55 group-hover:opacity-100" />
          </button>
        )}
      </h1>
      <button onClick={onSearch} title="Search all conversations (⌘K or /)"
        className="ml-auto flex h-8 w-[min(340px,34vw)] cursor-text items-center gap-[7px] rounded-md border border-line-strong bg-surface px-2.5 text-left text-[13.5px] text-faint transition-[border-color,box-shadow] duration-[120ms] hover:border-brand focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_var(--brand-soft)] focus-visible:outline-none max-[860px]:w-auto max-[860px]:flex-1">
        <Search className="size-[15px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search…</span>
        <Kbd className="max-[1080px]:hidden">⌘K</Kbd>
      </button>
      {hasData && <ViewTools view={shown} />}
      <Button variant="outline" className="gap-1.5" onClick={nextUp}
        title={waiting ? `Open what waits for you next: ${waiting} (approvals, questions, then what is new) · F` : "Nothing waits for you · F"}>
        Next up
        {waiting > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-ask px-[5px] text-[11px] font-bold text-surface tabular-nums">{waiting}</span>}
        <Kbd className="opacity-70">F</Kbd>
      </Button>
      <Button className="size-8 px-0 min-[861px]:hidden" onClick={() => openDialog({ kind: "new" })} title="New session (N)"><Plus className="size-[15px]" /></Button>
    </header>
  )
}

// Before the first snapshot: five shimmering bars.
function Skeleton() {
  return (
    <div className="flex max-w-[900px] flex-col gap-2.5 p-5">
      {[1, 2, 3, 4, 5].map(i => <i key={i} className="skeleton block h-[52px] rounded-[9px]" />)}
    </div>
  )
}

function Board() {
  const open = useOpenSession()
  const cards = useLive(l => l.snapshot?.cards)
  const repos = useLive(l => l.snapshot?.repos)
  const canRun = useLive(l => !!l.snapshot?.canRunCommands)
  const waiting = useMemo(() => waitingOf(cards ?? []), [cards])
  const [isSearching, setSearching] = useState(false)
  useAlerts()
  useMarkSeen()
  useLinksOutside()
  useCloseOnEmpty(!!open)
  useLinkedOpen()
  useHistoryWalk()
  const notDone = (cards ?? []).filter(c => c.column !== "done")
  useTabTitle(notDone.filter(c => c.column === "asking").length, notDone.filter(c => c.isUnread).length)
  // "Run" on shell blocks shows only while Setup allows it.
  useEffect(() => void document.documentElement.classList.toggle("can-run", canRun), [canRun])
  // A repo that left the board stops filtering it.
  useEffect(() => {
    const chosen = repoFilter.get()
    if (repos && chosen && !repos.some(r => r.root === chosen)) repoFilter.set(null)
  }, [repos])

  // Every shortcut of the board (features/keys).
  useBoardKeys({ nextUp, toggleSearch: () => setSearching(s => !s), openSearch: () => setSearching(true), isSearching })

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <TopBar waiting={waiting.length} onSearch={() => setSearching(true)} />
        <Offline />
        <UpdateBanner />
        <div className="relative min-h-0 flex-1">{cards ? <MainView /> : <Skeleton />}</div>
      </main>
      <PanelSlot open={open} />
      <SearchPalette open={isSearching} onOpenChange={setSearching} />
      <Dialogs />
      <HelpDialog />
    </div>
  )
}
