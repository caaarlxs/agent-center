// Notes about what just happened, with Undo when it can be taken back: the
// last one stays reachable with Z (keys.ts) while its toast shows.
import { createElement } from "react"
import { toast } from "sonner"
import { Kbd } from "@/components/ui/kbd"

// "Undo Z": the key that takes it back, as the classic toast shows it.
const UNDO_LABEL = createElement("span", { className: "inline-flex items-center gap-1.5" }, "Undo", createElement(Kbd, null, "Z"))

const UNDO_MS = 7000
let last: { undo: () => void; until: number } | null = null

export function undoable(text: string, undo: () => void) {
  const id = toast(text, { duration: UNDO_MS, action: { label: UNDO_LABEL, onClick: () => ((last = null), undo()) } })
  last = { undo: () => (toast.dismiss(id), undo()), until: Date.now() + UNDO_MS }
}

// Z: the last undo, if its toast still shows. Says whether there was one.
export function undoLast() {
  if (!last || Date.now() > last.until) return false
  const { undo } = last
  last = null
  undo()
  return true
}
