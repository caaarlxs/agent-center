// The board's style (Settings › Look): Classic, as it always was, or Dots,
// where everything speaks in dots (the orbs, the canvas's drifting field,
// each session's bot, dot meters and numbers, dotted zones and notes). It
// marks the page (<html data-style>) for the CSS (index.css: [data-style=dots]);
// the parts that draw differently read it with boardStyle.use().
import { persistedStore } from "./store"

export type BoardStyle = "classic" | "dots"
export const boardStyle = persistedStore<BoardStyle>("boardStyle", "classic")

const mark = (style: BoardStyle) => void (document.documentElement.dataset.style = style)
mark(boardStyle.get())

export function chooseStyle(style: BoardStyle) {
  boardStyle.set(style)
  mark(style)
}

export const useIsDots = () => boardStyle.use() === "dots"
