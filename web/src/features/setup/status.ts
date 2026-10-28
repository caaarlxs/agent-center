// What Setup shows (GET /api/setup), kept: the dialog opens with the last
// answer and asks again behind it (lib/cached.ts).
import type { Step } from "@/lib/api-types"
import { cachedGet } from "@/lib/cached"

export type Status = { steps: Step[]; isReady: boolean; voiceLanguage: string; organizerNote: string }
export const setupStatus = cachedGet<Status>("/api/setup")
