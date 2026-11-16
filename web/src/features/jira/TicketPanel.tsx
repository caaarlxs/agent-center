// A ticket whole, from the right, the board still in view behind it: a click
// outside or Esc closes it. Opened from the pipeline's board, ↑ and ↓ (or its
// arrows) go to the ticket before or after it, in the board's order.
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { type ReactNode, useEffect, useMemo } from "react"
import { useLive } from "@/lib/live"
import { openDialog } from "@/app/open-dialog"
import { markRead } from "./pipeline-seen"
import { inColumns } from "./pipeline-board"
import { TicketView } from "./TicketTab"

// A key pressed while you write, or inside a menu, is the field's or the menu's.
const isTheirs = (target: EventTarget | null) => target instanceof Element && !!target.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]")

const Arrow = ({ to, label, children }: { to: string | undefined; label: string; children: ReactNode }) => (
  <button className="grid size-7 place-items-center rounded-md text-text-muted transition-colors duration-120 hover:bg-hover hover:text-text disabled:opacity-35 disabled:hover:bg-transparent"
    disabled={!to} aria-label={label} title={label} onClick={() => to && go(to)}>{children}</button>
)
const go = (key: string) => (markRead(key), openDialog({ kind: "ticket", key }))

// ↑ and ↓ go to the ticket before and after, unless a field or a menu takes the key.
function useArrows(before: string | undefined, after: string | undefined) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTheirs(e.target)) return
      const to = e.key === "ArrowUp" ? before : e.key === "ArrowDown" ? after : undefined
      if (to) (e.preventDefault(), go(to))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [before, after])
}

export function TicketPanel({ ticketKey, onClose }: { ticketKey: string; onClose: () => void }) {
  const states = useLive(l => l.snapshot?.pipelines)
  const order = useMemo(() => inColumns(states ?? []).flat().map(s => s.key), [states])
  const i = order.indexOf(ticketKey)
  const before = i > 0 ? order[i - 1] : undefined
  const after = i >= 0 ? order[i + 1] : undefined
  useArrows(before, after)
  return (
    <Dialog.Root open modal={false} onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} onOpenAutoFocus={e => e.preventDefault()}
          className="fixed top-2 right-2 bottom-2 z-50 flex w-[min(760px,calc(100vw-16px))] flex-col overflow-hidden rounded-[14px] border border-line bg-raised text-[13px] text-text shadow-pop outline-none motion-safe:animate-[panel-in_200ms_var(--ease-out)]">
          <Dialog.Title className="sr-only">{ticketKey}</Dialog.Title>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
            <TicketView key={ticketKey} ticketKey={ticketKey} actions={(
              <>
                {i >= 0 && <Arrow to={before} label="Previous ticket (↑)"><ChevronUp size={15} /></Arrow>}
                {i >= 0 && <Arrow to={after} label="Next ticket (↓)"><ChevronDown size={15} /></Arrow>}
                <Dialog.Close className="grid size-7 place-items-center rounded-md text-text-muted transition-colors duration-120 hover:bg-hover hover:text-text" aria-label="Close (Esc)"><X size={15} /></Dialog.Close>
              </>
            )} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
