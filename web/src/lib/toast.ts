// Notes about what just happened, with Undo when it can be taken back: the
// last one stays reachable with Z (keys.ts) while its toast shows.
import { toast } from "sonner"

const UNDO_MS = 7000
let last: { undo: () => void; until: number } | null = null

export function undoable(text: string, undo: () => void) {
  const id = toast(text, { duration: UNDO_MS, action: { label: "Undo", onClick: () => ((last = null), undo()) } })
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
