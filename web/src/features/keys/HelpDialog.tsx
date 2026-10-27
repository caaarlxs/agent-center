// The keyboard shortcuts (?), as the classic board lists them (dialogs.js
// Help): one row per action, its keys, "or" between the choices.
import { Fragment } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { helpOpen } from "./help-state"

const SHORTCUTS: [string, string[][]][] = [
  ["Move", [["J", "K"], ["↓", "↑"]]],
  ["Open conversation", [["↵"]]],
  ["Reply", [["R"]]],
  ["Rename", [["T"]]],
  ["Open in Claude", [["O"]]],
  ["Pin", [["P"]]],
  ["Colour", [["C"], ["0–7"]]],
  ["Later", [["A"], ["1–5"]]],
  ["Mark as done", [["E"]]],
  ["Undo", [["Z"]]],
  ["Search", [["/"], ["⌘", "K"]]],
  ["Inbox · Board · Canvas · Tiers", [["1"], ["2"], ["3"], ["4"]]],
  ["Tiers: one row up · down", [["["], ["]"]]],
  ["Lanes per repo", [["G"]]],
  ["Next up: what waits for you", [["F"]]],
  ["New session", [["N"]]],
  ["Catch me up", [["D"]]],
  ["Stop the running turn", [["S"]]],
  ["Mark to review", [["U"]]],
  ["Canvas: zoom in · zoom out · fit", [["+"], ["−"], ["0"]]],
  ["Canvas: move the view (hold and drag)", [["Space"]]],
  ["Close", [["Esc"]]],
]

export function HelpDialog() {
  const isOpen = helpOpen.use()
  return (
    <Dialog open={isOpen} onOpenChange={helpOpen.set}>
      <DialogContent className="w-[min(440px,calc(100vw-32px))] max-w-none gap-0">
        <DialogTitle className="mb-3.5 text-base font-[650]">Keyboard shortcuts</DialogTitle>
        <dl className="m-0 flex flex-col">
          {SHORTCUTS.map(([label, combos]) => (
            <div key={label} className="flex items-center justify-between border-b border-line py-[7px] last:border-b-0">
              <dt className="text-text-muted">{label}</dt>
              <dd className="m-0 flex items-center gap-[5px]">
                {combos.map((keys, i) => (
                  <Fragment key={i}>{i > 0 && <span className="mx-0.5 text-[11px] text-text-muted">or</span>}{keys.map(k => <Kbd key={k}>{k}</Kbd>)}</Fragment>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
