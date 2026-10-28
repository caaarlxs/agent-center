// How wide the session panel is: your width when you dragged its edge, wide
// after the widen button, else a share of the window. The same whatever tab
// shows: a workspace's side (the Code tree, the changed files) opens to its
// left instead (SideFlyout). The board keeps 300px.
import { useEffect, useState } from "react"
import { createStore, persistedStore } from "@/lib/store"

export const MIN_W = 380
export const BOARD_KEEPS = 300
export const MEDIUM_MAX = 1100 // up to here the panel is a fixed sheet, no resize
export const NARROW_MAX = 860 // up to here the sidebar is a drawer

export const defaultWidth = (vw: number) => Math.min(760, Math.max(420, Math.round(vw * 0.42)))
export const clampWidth = (w: number, vw: number) => Math.round(Math.min(vw - BOARD_KEEPS, Math.max(MIN_W, w)))

export function panelWidth(o: { vw: number; saved: number | null; isWide: boolean }): number {
  if (o.vw <= MEDIUM_MAX) return Math.min(640, o.vw)
  const base = o.saved ?? defaultWidth(o.vw)
  return Math.min(o.vw - BOARD_KEEPS, o.isWide ? Math.max(base, Math.round(o.vw * 0.75)) : base)
}

// Your width (dragged), kept as the classic board keeps it; null: the default.
export const savedWidth = persistedStore<number | null>("readerW", null)
// The widen button.
export const isWide = createStore(false)
export const toggleWide = () => isWide.set(!isWide.get())

// The window's width, kept as it changes.
export function useViewportWidth() {
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setVw(window.innerWidth)
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  return vw
}
