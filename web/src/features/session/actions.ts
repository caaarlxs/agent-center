// What the page asks a session to do, through the board's API
// (routes/session.ts). Each one throws ApiError with the server's reason.
import { post } from "@/lib/api"

const at = (id: string, action: string) => `/api/sessions/${encodeURIComponent(id)}/${action}`

// A message for the session (a reply Claude offered, or any text).
export const sendText = (id: string, text: string) => post<{ ok: boolean; messageId: string }>(at(id, "send"), { text })

// Allow or deny the tool approval the session waits for.
export const permit = (id: string, permissionId: string, decision: "allow" | "deny") => post(at(id, "permit"), { id: permissionId, decision })

// The answer to the question the session asks: { question: chosen label }.
export const answer = (id: string, questionId: string, answers: Record<string, string>) => post(at(id, "answer"), { id: questionId, answers })

// Its place on the canvas.
export const moveTo = (id: string, p: { x: number; y: number }) => post(at(id, "move"), p)
