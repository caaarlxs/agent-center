// The board's one open dialog, if any: set from the sidebar, a card's menu or
// a link (?dialog=new), drawn by <Dialogs />.
import type { Card } from "@/lib/api-types"
import { createStore } from "@/lib/store"

// A task a session suggested, started from its card: "New session" filled in.
export type NewDraft = { root: string | null; prompt: string; worktree: boolean; suggestion: { from: string; taskId: string | null } }

export type OpenDialog = { kind: "new"; draft?: NewDraft } | { kind: "setup" } | { kind: "digest" } | { kind: "help" } | { kind: "run"; card: Card } | null

export const dialog = createStore<OpenDialog>(null)
export const openDialog = (next: OpenDialog) => dialog.set(next)
export const closeDialog = () => dialog.set(null)
