// What the board's main area shows: the view chosen (Inbox, Board, Canvas,
// Tiers; keys 1 2 3 4), its own tools at the top, and a skeleton until the
// first snapshot. The canvas needs room: in a window under 860 px the inbox
// stands in for it (main.js:111-135).
import { lazy, Suspense, useRef, useSyncExternalStore } from "react"
import { useLive } from "@/lib/live"
import { repoFilter } from "@/app/view-state"
import { cn } from "@/lib/utils"
import { lazyView } from "@/lib/lazy-view"
import { useIsDots } from "@/lib/board-style"
import type { View } from "./order"
import { useFlip } from "./flip"
import { dragging, groupBy, showDone, useBoardCards, view as viewStore, whereTo } from "./state"
import { Board, Inbox, Tiers, useViewCards } from "./Views"

const NARROW = "(max-width: 860px)"
const useNarrow = () =>
  useSyncExternalStore(
    l => {
      const mq = matchMedia(NARROW)
      mq.addEventListener("change", l)
      return () => mq.removeEventListener("change", l)
    },
    () => matchMedia(NARROW).matches,
  )

// The view the window shows (the canvas falls back to the inbox when narrow).
export function useShownView(): View {
  const chosen = viewStore.use()
  const isNarrow = useNarrow()
  return isNarrow && chosen === "canvas" ? "inbox" : chosen
}

// React Flow and the canvas load the first time the canvas shows.
const Canvas = lazyView(() => import("@/features/canvas/Canvas").then(m => m.Canvas))

// The canvas's field of dots, behind the board and the tiers too (Dots style);
// its shader loads only then, and nothing stands in for it meanwhile.
const DotField = lazy(() => import("@/features/canvas/Backdrop").then(m => ({ default: m.Backdrop })))

export const VIEW_TITLE: Record<View, string> = { inbox: "Inbox", board: "Board", canvas: "Canvas", tiers: "Tiers" }

export function MainView() {
  const view = useShownView()
  const hasData = useLive(l => !!l.snapshot)
  const cards = useViewCards(useBoardCards())
  const isDragging = !!dragging.use()
  const root = useRef<HTMLDivElement>(null)
  const hasField = useIsDots() && (view === "board" || view === "tiers")
  const scope = `${view}|${groupBy.use()}|${repoFilter.use()}|${showDone.use()}|${hasData}`
  // The canvas runs its own (Canvas.tsx), once React Flow has drawn.
  useFlip(root, scope, whereTo, view !== "canvas")
  if (view === "canvas" && hasData) return <Canvas />
  return (
    <div ref={root} className={cn("absolute inset-0 flex flex-col", isDragging && "is-dragging")}>
      {hasField && <Suspense fallback={null}><DotField /></Suspense>}
      <div className="relative min-h-0 flex-1 overflow-auto">
        {!hasData ? (
          <div className="flex max-w-[900px] flex-col gap-2.5 p-5">
            {[1, 2, 3, 4, 5].map(i => <i key={i} className="block h-[52px] animate-shimmer rounded-[9px] bg-[linear-gradient(90deg,var(--hover),var(--press),var(--hover))] bg-[length:200%_100%]" />)}
          </div>
        ) : view === "canvas" ? null : view === "board" ? <Board cards={cards} /> : view === "tiers" ? <Tiers cards={cards} /> : <Inbox cards={cards} />}
      </div>
    </div>
  )
}
