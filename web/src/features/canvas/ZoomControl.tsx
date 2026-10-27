// The canvas's zoom (canvas.js zoomTo): − % + and Fit at the top right, the
// keys + − 0, the trackpad's pinch. "Fit" shows everything above "Done" (at
// most at the cards' real size); the zoom chosen is kept in this browser
// ("canvasZoom", null = fit), as the classic board keeps it.
import { getNodesBounds, getViewportForBounds, useNodesInitialized, useReactFlow, useStore } from "@xyflow/react"
import { useCallback, useEffect, useRef } from "react"
import { persistedStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { ZOOM, minZoomOf, zoomTarget } from "./zoom"

export const savedZoom = persistedStore<number | null>("canvasZoom", null)
export const DONE_H = 48 + 144 // the "Done" band at the foot: its head and one row of cards
const TOP_H = 56 // the page's tools over the canvas's top (search, Zone, Next up)

// The zoom that shows every node between the tools and "Done", and the view that does it.
function useFit() {
  const rf = useReactFlow()
  const w = useStore(s => s.width)
  const h = useStore(s => s.height)
  return useCallback(() => {
    const nodes = rf.getNodes().filter(n => !n.hidden)
    if (!nodes.length || !w || !h) return { zoom: 1, view: null }
    const fit = getViewportForBounds(getNodesBounds(nodes), w, Math.max(120, h - DONE_H - TOP_H), 0.05, 1, 0.04)
    return { zoom: Math.min(1, fit.zoom), view: { ...fit, y: fit.y + TOP_H } }
  }, [rf, w, h])
}

export function useCanvasZoom() {
  const rf = useReactFlow()
  const fitOf = useFit()
  const scale = useStore(s => s.transform[2])
  const saved = savedZoom.use()
  const zoomTo = useCallback((next: number | null) => {
    const { zoom: fit, view } = fitOf()
    const t = zoomTarget(rf.getZoom(), next, fit, savedZoom.get() === null)
    savedZoom.set(t.saved)
    if (t.saved === null && view) return void rf.setViewport(view, { duration: 220 })
    rf.zoomTo(t.scale, { duration: 220 })
  }, [rf, fitOf])
  return { scale, saved, zoomTo, fitOf }
}

// The saved zoom, once the nodes are measured: fit, or that zoom around the
// middle of what fits.
export function useSavedZoomOnce() {
  const rf = useReactFlow()
  const fitOf = useFit()
  const isReady = useNodesInitialized()
  const done = useRef(false)
  useEffect(() => {
    if (!isReady || done.current) return
    const { view } = fitOf()
    if (!view) return
    done.current = true
    rf.setViewport(view)
    const z = savedZoom.get()
    if (z !== null) rf.zoomTo(Math.min(ZOOM.max, z))
  }, [isReady, rf, fitOf])
}

const pill = "inline-flex h-[26px] items-center justify-center text-text-muted transition-[background-color,color,transform] duration-120 ease-(--ease-out) enabled:hover:bg-press enabled:hover:text-text enabled:active:scale-[0.92] disabled:cursor-default disabled:opacity-35"

export function ZoomControl({ className }: { className?: string }) {
  const { scale, saved, zoomTo, fitOf } = useCanvasZoom()
  const min = minZoomOf(fitOf().zoom)
  return (
    <div className={cn("flex items-center gap-0.5 rounded-[9px] border border-line bg-raised p-0.5 shadow-card", className)}
      title="Zoom: pinch on the trackpad or ⌘ + wheel · keys + − 0. Zooming out gives more room">
      <button className={cn(pill, "w-[26px] rounded-[7px] text-base font-semibold")} disabled={scale <= min + 0.001} onClick={() => zoomTo(scale / ZOOM.step)} aria-label="Zoom out">−</button>
      <span className="min-w-11 text-center text-xs font-semibold text-text-muted tabular-nums">{Math.round(scale * 100)}%</span>
      <button className={cn(pill, "w-[26px] rounded-[7px] text-base font-semibold")} disabled={scale >= ZOOM.max - 0.001} onClick={() => zoomTo(scale * ZOOM.step)} aria-label="Zoom in">+</button>
      <button className={cn(pill, "rounded-lg px-[11px] text-xs font-medium")} disabled={saved === null} onClick={() => zoomTo(null)}>Fit</button>
    </div>
  )
}
