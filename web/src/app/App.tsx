// The app's shell. /next/design shows the design system (every component the
// board uses, with made-up data); everything else is the board.
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DesignSystem } from "@/design/DesignSystem"
import { Canvas } from "@/features/canvas/Canvas"

export function App() {
  if (location.pathname.replace(/\/$/, "").endsWith("/design")) return <DesignSystem />
  return (
    <TooltipProvider delayDuration={300}>
      <main className="h-screen bg-background text-foreground">
        <Canvas />
      </main>
      <Toaster />
    </TooltipProvider>
  )
}
