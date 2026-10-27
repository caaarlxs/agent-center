// The open dialog, if any. A link can open one (?dialog=new|setup|digest|help),
// and Setup opens by itself while a required step is missing, until closed once.
import { useEffect } from "react"
import { get } from "@/lib/api"
import { persistedStore } from "@/lib/store"
import { DigestDialog } from "@/features/digest/DigestDialog"
import { NewSessionDialog } from "@/features/new-session/NewSessionDialog"
import { RunDialog } from "@/features/run/RunDialog"
import { SetupDialog } from "@/features/setup/SetupDialog"
import { closeDialog, dialog, openDialog } from "./open-dialog"

const setupSeen = persistedStore("setupSeen", false)
const LINKED = ["new", "setup", "digest", "help"] as const

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
    get<{ isReady: boolean }>("/api/setup").then(res => !res.isReady && !setupSeen.get() && !dialog.get() && openDialog({ kind: "setup" }), () => {})
  }, [])
  if (!open) return null
  if (open.kind === "new") return <NewSessionDialog onClose={closeDialog} />
  if (open.kind === "setup") return <SetupDialog onClose={() => (setupSeen.set(true), closeDialog())} />
  if (open.kind === "digest") return <DigestDialog onClose={closeDialog} />
  if (open.kind === "run") return <RunDialog card={open.card} onClose={closeDialog} />
  return null // help: the keyboard help dialog draws itself
}
