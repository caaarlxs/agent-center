// The app's shell. /next/design shows the design system (every component the
// board uses, with made-up data); everything else is the board: the sidebar,
// the canvas with its toolbar, and a session's panel over the canvas.
import { Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DesignSystem } from "@/design/DesignSystem"
import { useLive } from "@/lib/live"
import { Canvas } from "@/features/canvas/Canvas"
import { SearchPalette } from "@/features/search/SearchPalette"
import { SessionPanel } from "@/features/session/SessionPanel"
import { nextAfter, waitingOf } from "@/features/session/waiting"
import { openSession, useOpenSession } from "./open-session"
import { Sidebar } from "./Sidebar"
import { focusCard } from "./view-state"

export function App() {
  if (location.pathname.replace(/\/$/, "").endsWith("/design")) return <DesignSystem />
  return (
    <TooltipProvider delayDuration={300}>
      <Board />
      <Toaster />
    </TooltipProvider>
  )
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest(".monaco-editor"))

function Board() {
  const open = useOpenSession()
  const cards = useLive(l => l.snapshot?.cards)
  const waiting = useMemo(() => waitingOf(cards ?? []), [cards])
  const [isSearching, setSearching] = useState(false)

  // "Next up" (F): the next session that waits for you; the canvas goes to it.
  const nextUp = () => {
    const next = nextAfter(waiting, open?.id ?? null)
    if (!next) return void toast("Nothing waits for you")
    openSession(next.id)
    focusCard(next.id)
  }
  // Read on each key, so it uses the newest list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return void (e.preventDefault(), setSearching(s => !s))
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return
      if (e.key === "/") (e.preventDefault(), setSearching(true))
      else if (e.key.toLowerCase() === "f") (e.preventDefault(), nextUp())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="relative min-w-0 flex-1">
        <Canvas />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3">
          <Button variant="outline" size="sm" className="pointer-events-auto w-64 justify-start bg-background/80 text-muted-foreground backdrop-blur" onClick={() => setSearching(true)}>
            <Search />Search<Kbd className="ml-auto">⌘K</Kbd>
          </Button>
          <Button size="sm" variant="outline" className="pointer-events-auto ml-auto bg-background/80 backdrop-blur" onClick={nextUp}
            title={waiting.length ? `What waits for you next: ${waiting.length}` : "Nothing waits for you"}>
            Next up
            {waiting.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-orange-500 px-1.5 text-[11px] font-semibold text-white">{waiting.length}</span>}
            <Kbd>F</Kbd>
          </Button>
        </div>
        {open && <div className="absolute inset-y-0 right-0 z-20 animate-in slide-in-from-right-8 fade-in duration-300"><SessionPanel id={open.id} tab={open.tab} /></div>}
      </main>
      <SearchPalette open={isSearching} onOpenChange={setSearching} />
    </div>
  )
}
