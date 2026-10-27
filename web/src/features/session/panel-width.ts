// How wide the session panel is (main.js:663-666, styles.css:1106-1114): your
// width when you dragged its edge, wide after the widen button (or when a view
// asks for room), else a share of the window; a workspace (Changes, Code,
// Files) takes all the room beside the sidebar. The board keeps 300px.
import { createStore, persistedStore } from "@/lib/store"

export const MIN_W = 380
export const BOARD_KEEPS = 300
export const MEDIUM_MAX = 1100 // up to here the panel is a fixed sheet, no resize
export const NARROW_MAX = 860 // up to here the sidebar is a drawer

export const defaultWidth = (vw: number) => Math.min(760, Math.max(420, Math.round(vw * 0.42)))
export const clampWidth = (w: number, vw: number) => Math.round(Math.min(vw - BOARD_KEEPS, Math.max(MIN_W, w)))

export function panelWidth(o: { vw: number; saved: number | null; isWide: boolean; isWorkspace: boolean; sideW: number }): number {
  if (o.vw <= MEDIUM_MAX) return Math.min(640, o.vw)
  if (o.isWorkspace) return o.vw - o.sideW
  const base = o.saved ?? defaultWidth(o.vw)
  return Math.min(o.vw - BOARD_KEEPS, o.isWide ? Math.max(base, Math.round(o.vw * 0.75)) : base)
}

// Your width (dragged), kept as the classic board keeps it; null: the default.
export const savedWidth = persistedStore<number | null>("readerW", null)
// The widen button; a view that needs room (Changes side by side) asks too.
export const isWide = createStore(false)
export const needsRoom = createStore(false)
export const toggleWide = () => isWide.set(!isWide.get())
