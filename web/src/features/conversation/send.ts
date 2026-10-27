// Sending from anywhere on the page (the reply box, a reply button, review
// comments): the message goes, a toast offers Undo, and Undo puts its text
// back in that session's reply box.
import { toast } from "sonner"
import { createStore } from "@/lib/store"
import { undoable } from "@/lib/toast"
import { sendText, unsend } from "@/features/session/actions"
import { takenBack } from "./pending"
import { isTemplate } from "./text"

export const composerFill = createStore<{ id: string; text: string } | null>(null)
// Asks a session's reply box for the cursor (at the end of its text): a new
// object each time, so asking twice works twice.
export const composerFocus = createStore<{ id: string } | null>(null)
export const focusComposer = (id: string) => composerFocus.set({ id })

export async function takeBack(id: string, p: { id: string; text: string }) {
  try {
    await unsend(id, p.id)
    takenBack.set([...takenBack.get(), p.id])
    composerFill.set({ id, text: p.text })
  } catch (err) {
    toast.error((err as Error).message)
  }
}

// A reply Claude offered (a choice under the conversation): sent, unless it
// is a template ("…is: "), which goes to the reply box to be completed.
export async function reply(id: string, text: string) {
  if (isTemplate(text)) return (composerFill.set({ id, text: text.trimEnd() + " " }), void setTimeout(() => focusComposer(id), 120))
  try {
    const res = await sendText(id, text)
    const said = res.isOpen ? `Replied: “${text.slice(0, 60)}”` : "Reply queued: it arrives when the session is free"
    undoable(said, () => void takeBack(id, { id: res.messageId, text }))
  } catch (err) {
    toast((err as Error).message || "Could not send")
  }
}

// Throws the server's reason, so a caller can keep what was typed.
export async function sendMessage(id: string, text: string, done = "Message sent") {
  const res = await sendText(id, text)
  undoable(res.activated ? "The session was asleep: waking it in the background" : done, () => void takeBack(id, { id: res.messageId, text }))
}
