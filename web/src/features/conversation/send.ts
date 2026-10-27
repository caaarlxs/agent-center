// Sending from anywhere on the page (the reply box, a reply button, review
// comments): the message goes, a toast offers Undo, and Undo puts its text
// back in that session's reply box.
import { toast } from "sonner"
import { createStore } from "@/lib/store"
import { undoable } from "@/lib/toast"
import { sendText, unsend } from "@/features/session/actions"
import { takenBack } from "./pending"

export const composerFill = createStore<{ id: string; text: string } | null>(null)

export async function takeBack(id: string, p: { id: string; text: string }) {
  try {
    await unsend(id, p.id)
    takenBack.set([...takenBack.get(), p.id])
    composerFill.set({ id, text: p.text })
  } catch (err) {
    toast.error((err as Error).message)
  }
}

// Throws the server's reason, so a caller can keep what was typed.
export async function sendMessage(id: string, text: string, done = "Message sent") {
  const res = await sendText(id, text)
  undoable(res.activated ? "The session was asleep: waking it in the background" : done, () => void takeBack(id, { id: res.messageId, text }))
}
