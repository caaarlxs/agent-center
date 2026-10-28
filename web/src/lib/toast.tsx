// Notes about what just happened, with Undo when it can be taken back: the
// last one stays reachable with Z (keys.ts) while its toast shows.
import type { ReactNode } from "react"
import { toast } from "sonner"
import { UndoCountdown } from "@/components/watermelon/UndoCountdown"

const UNDO_MS = 7000
let last: { undo: () => void; until: number } | null = null

// icon: the moment it reports (components/icona/marks.tsx), played as it shows.
export function undoable(text: string, undo: () => void, icon?: ReactNode) {
  const id = toast(text, { duration: UNDO_MS, icon, action: { label: <UndoCountdown ms={UNDO_MS} />, onClick: () => ((last = null), undo()) } })
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
