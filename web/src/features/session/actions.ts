// What the page asks a session to do, through the board's API
// (routes/session.ts). Each one throws ApiError with the server's reason.
import { toast } from "sonner"
import { post } from "@/lib/api"
import { addPending, dropPending } from "@/features/conversation/pending"

const at = (id: string, action: string) => `/api/sessions/${encodeURIComponent(id)}/${action}`

// A message for the session (a reply Claude offered, or any text). It shows
// as pending in the conversation until the transcript has it.
export async function sendText(id: string, text: string) {
  const res = await post<{ ok: boolean; messageId: string; isOpen?: boolean; activated?: boolean }>(at(id, "send"), { text })
  addPending(id, { id: res.messageId, text, at: Date.now() })
  return res
}

// Takes a message back before the session gets it.
export async function unsend(id: string, messageId: string) {
  await post(at(id, "unsend"), { messageId })
  dropPending(id, [messageId])
}

// Wakes the session in Claude, in the background, so it gets messages; or
// ends its running turn, like Esc in the app.
export const wake = (id: string) => post(at(id, "activate"))
export const stop = (id: string) => post(at(id, "stop"))

// Allow or deny the tool approval the session waits for.
export const permit = (id: string, permissionId: string, decision: "allow" | "deny") => post(at(id, "permit"), { id: permissionId, decision })

// The answer to the question the session asks: { question: chosen label }.
export const answer = (id: string, questionId: string, answers: Record<string, string>) => post(at(id, "answer"), { id: questionId, answers })

// Its place on the canvas.
export const moveTo = (id: string, p: { x: number; y: number }) => post(at(id, "move"), p)

// The board's own actions on a session (lib/board.ts): pin, park ("later"),
// done, archive and their undoing, mark seen or unseen, colour.
export type BoardAction = "pin" | "unpin" | "park" | "unpark" | "done" | "undone" | "archive" | "unarchive" | "seen" | "unseen" | "color" | "rename"
export const act = (id: string, action: BoardAction, body: Record<string, unknown> = {}) => post(at(id, action), body)

// Opens it in Claude desktop.
export const launch = (id: string) => post(at(id, "open")).catch((err: Error) => toast(err.message || "Could not open the session"))

// Ends its running turn, like Esc in the app.
export const stopTurn = (card: { id: string; title: string }) =>
  stop(card.id).then(() => toast(`Stopping “${card.title}”…`), (err: Error) => toast(err.message || "Could not stop"))

// Its name on the board (Claude desktop keeps its own); empty: back to Claude's.
export const rename = (id: string, title: string) => act(id, "rename", { title }).catch((err: Error) => toast(err.message || "Could not rename"))

// "Later" until… (park): the times the board offers.
const todayAt = (days: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}
export const LATER: { key: string; label: string; hint?: string; until: () => number | null }[] = [
  { key: "1", label: "1 hour", until: () => Date.now() + 3600_000 },
  { key: "2", label: "This afternoon", hint: "16:00", until: () => todayAt(new Date().getHours() >= 16 ? 1 : 0, 16) },
  { key: "3", label: "Tomorrow morning", hint: "9:00", until: () => todayAt(1, 9) },
  { key: "4", label: "Monday", hint: "9:00", until: () => todayAt((8 - new Date().getDay()) % 7 || 7, 9) },
  { key: "5", label: "No date", until: () => null },
]

// The colours a card can wear (lib/board.ts), in the order keys 1–7 pick them.
export const CARD_COLORS = [
  { key: "lilac", label: "Lilac", tint: "#8b5cf6" },
  { key: "blue", label: "Blue", tint: "#3b82f6" },
  { key: "teal", label: "Teal", tint: "#14b8a6" },
  { key: "green", label: "Green", tint: "#22c55e" },
  { key: "yellow", label: "Yellow", tint: "#eab308" },
  { key: "orange", label: "Orange", tint: "#f97316" },
  { key: "pink", label: "Pink", tint: "#ec4899" },
] as const
export const tintOf = (color: string | null | undefined) => CARD_COLORS.find(c => c.key === color)?.tint
