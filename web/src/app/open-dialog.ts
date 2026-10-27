// The board's one open dialog, if any: set from the sidebar, a card's menu or
// a link (?dialog=new), drawn by <Dialogs />.
import type { Card } from "@/lib/api-types"
import { createStore } from "@/lib/store"

export type OpenDialog = { kind: "new" } | { kind: "setup" } | { kind: "digest" } | { kind: "run"; card: Card } | null

export const dialog = createStore<OpenDialog>(null)
export const openDialog = (next: OpenDialog) => dialog.set(next)
export const closeDialog = () => dialog.set(null)
