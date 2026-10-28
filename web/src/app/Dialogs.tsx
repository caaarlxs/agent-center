// The open dialog, if any. A link can open one (?dialog=new|setup|digest|context|help),
// and Setup opens by itself while a required step is missing, until closed once.
import { useEffect } from "react"
import { whenIdle } from "@/lib/cached"
import { persistedStore } from "@/lib/store"
import { lazyView } from "@/lib/lazy-view"
import { knownRepos } from "@/features/new-session/repos"
import { setupStatus } from "@/features/setup/status"
import { closeDialog, dialog, openDialog } from "./open-dialog"

// Each dialog loads the first time it opens.
const ContextDialog = lazyView(() => import("@/features/context/ContextDialog").then(m => m.ContextDialog))
const DigestDialog = lazyView(() => import("@/features/digest/DigestDialog").then(m => m.DigestDialog))
const NewSessionDialog = lazyView(() => import("@/features/new-session/NewSessionDialog").then(m => m.NewSessionDialog))
const RunDialog = lazyView(() => import("@/features/run/RunDialog").then(m => m.RunDialog))
const SetupDialog = lazyView(() => import("@/features/setup/SetupDialog").then(m => m.SetupDialog))

const setupSeen = persistedStore("setupSeen", false)
const LINKED = ["new", "setup", "digest", "context", "help"] as const

export function Dialogs() {
  const open = dialog.use()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const linked = LINKED.find(d => d === params.get("dialog"))
    if (linked) {
      openDialog({ kind: linked })
      params.delete("dialog")
      history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`)
      return
    }
  }, [])
  // Setup opens by itself while a required step is missing, until closed once;
  // its answer is kept for the dialog (features/setup/status.ts).
  useEffect(() => void setupStatus.load().then(res => !res.isReady && !setupSeen.get() && !dialog.get() && openDialog({ kind: "setup" }), () => {}), [])
  // When the browser is idle: the code and the data of the two dialogs opened
  // most, so they open whole instead of growing as their parts arrive.
  useEffect(() => whenIdle(() => {
    NewSessionDialog.preload()
    SetupDialog.preload()
    void knownRepos.load().catch(() => {})
  }), [])
  if (!open) return null
  if (open.kind === "new") return <NewSessionDialog draft={open.draft} onClose={closeDialog} />
  if (open.kind === "setup") return <SetupDialog onClose={() => (setupSeen.set(true), closeDialog())} />
  if (open.kind === "digest") return <DigestDialog onClose={closeDialog} />
  if (open.kind === "context") return <ContextDialog onClose={closeDialog} />
  if (open.kind === "run") return <RunDialog card={open.card} onClose={closeDialog} />
  return null // help: the keyboard help dialog draws itself
}
