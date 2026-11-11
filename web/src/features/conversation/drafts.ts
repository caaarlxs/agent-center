// What you were writing to each session, kept in this browser three days, so
// it is there when you come back: the reply box keeps it as you type, and a
// dictation that ends after you left adds its text to it (voice-handoff.ts).
import { persistedStore } from "@/lib/store"

const DRAFT_MS = 3 * 24 * 60 * 60_000
export { DRAFT_MS }
const drafts = persistedStore<Record<string, { text: string; at: number }>>("drafts", {})

export const draftOf = (id: string) => {
  const d = drafts.get()[id]
  return d && Date.now() - d.at < DRAFT_MS ? d.text : ""
}

export function keepDraft(id: string, text: string) {
  const all = Object.fromEntries(Object.entries(drafts.get()).filter(([key, d]) => key !== id && Date.now() - d.at < DRAFT_MS))
  drafts.set(text.trim() ? { ...all, [id]: { text, at: Date.now() } } : all)
}

/** What is written, then what was said, a space between. */
export const joinText = (base: string, heard: string) => (base.trim() ? `${base.trimEnd()} ${heard}` : heard)

export const appendToDraft = (id: string, text: string) => keepDraft(id, joinText(draftOf(id), text))
