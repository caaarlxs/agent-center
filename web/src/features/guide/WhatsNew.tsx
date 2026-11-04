// "What's new": a small card at the foot of the page, once, with the features
// added since your last look at the guide (each its icon, title and section);
// "See what's new" opens the guide, × puts it away. Either counts as a look.
import { X } from "lucide-react"
import { openDialog } from "@/app/open-dialog"
import { helpOpen } from "@/features/keys/help-state"
import { ICONS } from "./icons"
import { markSeen, useUnseen } from "./whats-new"

const SHOWN = 3

export function WhatsNew() {
  const unseen = useUnseen()
  const isGuideOpen = helpOpen.use()
  if (!unseen.length || isGuideOpen) return null
  return (
    <aside className="guide-in fixed bottom-4 left-1/2 z-40 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-[14px] border border-line bg-raised p-3 shadow-pop" aria-label="What's new">
      <div className="mb-2 flex items-center gap-2 px-1">
        <b className="flex-1 text-[13px] font-[650]">New in Agent Center</b>
        <button className="inline-grid size-6 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text" onClick={markSeen} title="Close"><X className="size-3.5" /></button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {unseen.slice(0, SHOWN).map(f => {
          const Icon = ICONS[f.icon] ?? ICONS.sparkles!
          return (
            <li key={f.section + f.title} className="flex items-center gap-2.5 rounded-[9px] bg-surface px-2 py-1.5">
              <span className="inline-grid size-7 shrink-0 place-items-center rounded-[8px] bg-brand-soft text-brand"><Icon size={14} /></span>
              <span className="flex min-w-0 flex-col">
                <b className="truncate text-[12.5px] font-semibold">{f.title}</b>
                <span className="truncate text-[11px] text-faint">{f.section}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <button className="mt-2 w-full rounded-[9px] px-2 py-1.5 text-[12.5px] font-semibold text-brand hover:bg-brand-soft" onClick={() => openDialog({ kind: "help" })}>
        {unseen.length > SHOWN ? `See all ${unseen.length} new` : "See what's new"}
      </button>
    </aside>
  )
}
