// A ticket whole, from the Tickets view: the same as the panel's Ticket tab,
// with what you may do on it.
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { TicketView } from "./TicketTab"

export function TicketDialog({ ticketKey, onClose }: { ticketKey: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[min(84vh,820px)] w-[min(720px,calc(100vw-32px))] flex-col gap-3">
        <DialogTitle className="sr-only">{ticketKey}</DialogTitle>
        <div className="-mx-1 min-h-0 flex-1 overflow-auto px-1">
          <TicketView ticketKey={ticketKey} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
