// The app's shell. /next/design shows the design system (every component the
// board uses, with made-up data); everything else is the board.
import { DesignSystem } from "@/design/DesignSystem"

export function App() {
  if (location.pathname.replace(/\/$/, "").endsWith("/design")) return <DesignSystem />
  return (
    <main className="grid min-h-screen place-items-center bg-background text-muted-foreground">
      <p>Agent Center · next</p>
    </main>
  )
}
