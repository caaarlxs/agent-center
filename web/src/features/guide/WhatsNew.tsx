// "What's new": a small card at the foot of the page, once, with the features
// added since your last look at the guide; "See all" opens the guide, × puts
// it away. Either counts as a look.
import { X } from "lucide-react"
import { openDialog } from "@/app/open-dialog"
import { helpOpen } from "@/features/keys/help-state"
import { markSeen, useUnseen } from "./whats-new"

const SHOWN = 4

export function WhatsNew() {
  const unseen = useUnseen()
  const isGuideOpen = helpOpen.use()
  if (!unseen.length || isGuideOpen) return null
  return (
    <aside className="fixed bottom-4 left-1/2 z-40 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 rounded-[12px] border border-line bg-raised px-4 pt-3 pb-3.5 shadow-pop" aria-label="What's new">
      <div className="mb-1.5 flex items-center gap-2">
        <b className="flex-1 text-[13px] font-[650]">New in Agent Center</b>
        <button className="inline-grid size-6 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text" onClick={markSeen} title="Close"><X className="size-3.5" /></button>
      </div>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-text-muted">
        {unseen.slice(0, SHOWN).map(i => <li key={i.text}>{i.text}</li>)}
      </ul>
      <button className="mt-2.5 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => openDialog({ kind: "help" })}>
        {unseen.length > SHOWN ? `See all ${unseen.length} in the guide` : "Open the guide"}
      </button>
    </aside>
  )
}
