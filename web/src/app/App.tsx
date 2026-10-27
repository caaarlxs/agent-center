// The app's shell. /next/design shows the design system (every component the
// board uses, with made-up data); everything else is the board.
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DesignSystem } from "@/design/DesignSystem"
import { Canvas } from "@/features/canvas/Canvas"
import { SessionPanel } from "@/features/session/SessionPanel"
import { useOpenSession } from "./open-session"

export function App() {
  if (location.pathname.replace(/\/$/, "").endsWith("/design")) return <DesignSystem />
  return <Board />
}

// The canvas fills the window; a session's panel slides over its right side.
function Board() {
  const open = useOpenSession()
  return (
    <TooltipProvider delayDuration={300}>
      <main className="relative h-screen overflow-hidden bg-background text-foreground">
        <Canvas />
        {open && <div className="absolute inset-y-0 right-0 z-10 animate-in slide-in-from-right-8 fade-in duration-300"><SessionPanel id={open.id} tab={open.tab} /></div>}
      </main>
      <Toaster />
    </TooltipProvider>
  )
}
