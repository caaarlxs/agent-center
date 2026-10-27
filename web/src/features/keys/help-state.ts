// Whether the keyboard help (?) is open: one of the board's dialogs, so the
// sidebar's button, a link (?dialog=help) and the key open the same one.
import { closeDialog, dialog, openDialog } from "@/app/open-dialog"

export const helpOpen = {
  get: () => dialog.get()?.kind === "help",
  set: (isOpen: boolean) => (isOpen ? openDialog({ kind: "help" }) : dialog.get()?.kind === "help" && closeDialog()),
  use: () => dialog.use()?.kind === "help",
}
