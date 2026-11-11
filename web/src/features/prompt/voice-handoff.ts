// A dictation outlives the box it started in. If you leave the conversation
// while it records or while Whisper writes, it is sent to its session once
// Whisper has written it, open or not. Only if that send fails does its text
// wait in the session's reply box (if open again) or its draft, and you are
// told where. A dictation from New session, with no session yet, is shown in
// a toast to copy.
import { toast } from "@/lib/notify"
import { createStore } from "@/lib/store"
import { live } from "@/lib/live"
import { openSession } from "@/app/open-session"
import { appendToDraft } from "@/features/conversation/drafts"
import { sendMessage } from "@/features/conversation/send"

// Text for a session's open reply box, from a dictation started before it opened.
export const composerAppend = createStore<{ id: string; text: string } | null>(null)

// The reply boxes on the page, by session: a dictation finds its own there.
const openBoxes = new Map<string, number>()
export function boxOpened(id: string) {
  openBoxes.set(id, (openBoxes.get(id) ?? 0) + 1)
  return () => {
    const n = (openBoxes.get(id) ?? 1) - 1
    if (n > 0) openBoxes.set(id, n)
    else openBoxes.delete(id)
  }
}

const titleOf = (id: string) => live().snapshot?.cards.find(c => c.id === id)?.title ?? "its session"

export async function handOff(owner: string | undefined, text: string) {
  if (!owner) {
    toast("Your dictation", { description: text.length > 160 ? `${text.slice(0, 160)}…` : text, duration: 20_000, action: { label: "Copy", onClick: () => void navigator.clipboard.writeText(text) } })
    return
  }
  const title = titleOf(owner)
  try {
    return await sendMessage(owner, text, `Your dictation went to “${title}”`)
  } catch (err) {
    toast((err as Error).message || "Could not send it: it is in the draft")
  }
  if (openBoxes.has(owner)) return composerAppend.set({ id: owner, text })
  appendToDraft(owner, text)
  toast(`Your dictation is in the draft of “${title}”`, { action: { label: "Open", onClick: () => openSession(owner) } })
}
