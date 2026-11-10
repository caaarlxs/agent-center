// A click that asks the board (and often Jira or GitHub) for something says at
// once that it is on it: if the answer takes more than a moment, a toast with a
// spinner says what it is doing, and it turns into the answer when it comes.
// The same request a second time while the first waits does nothing.
import { toast } from "sonner"
import { post } from "@/lib/api"

const SLOW_MS = 300
// What each request is doing, while it waits; any other, "Working…".
const PENDING: Record<string, string> = {
  "/api/pipeline/start": "Starting…",
  "/api/pipeline/answer": "Sending the answers…",
  "/api/pipeline/checked": "Saving…",
  "/api/pipeline/auto": "Saving…",
  "/api/pipeline/step": "Sending…",
  "/api/pipeline/rollback": "Starting the rollback…",
  "/api/pipeline/reset": "Starting over…",
  "/api/pipeline/back": "Sending it back…",
  "/api/pipeline/remove": "Taking it out of the pipeline…",
  "/api/pipeline/cleanup": "Deleting…",
  "/api/pipeline/debt": "Sending to Jira…",
  "/api/pipeline/proposal": "Sending to Jira…",
  "/api/pipeline/stop": "Stopping the agent…",
  "/api/jobs/start": "Starting…",
  "/api/jobs/stop": "Stopping the agent…",
  "/api/jobs/clear": "Clearing…",
  "/api/jobs/continue": "Moving it to the pipeline…",
  "/api/jobs/publish": "Publishing to the PRs…",
  "/api/jira/move": "Moving in Jira…",
  "/api/jira/comment": "Sending to Jira…",
}
export const pendingText = (path: string) => PENDING[path] ?? "Working…"

const inFlight = new Set<string>()

// The answer, or null when it failed (the toast already said why) or the same request was waiting.
export async function sendWithFeedback<T = { ok: boolean }>(path: string, body: object, done: string | ((answer: T) => string), failed = "It did not work"): Promise<T | null> {
  const key = `${path} ${JSON.stringify(body)}`
  if (inFlight.has(key)) return null
  inFlight.add(key)
  let id: string | number | undefined
  const timer = setTimeout(() => (id = toast.loading(pendingText(path))), SLOW_MS)
  try {
    const answer = await post<T>(path, body)
    toast.message(typeof done === "function" ? done(answer) : done, { id })
    return answer
  } catch (err) {
    toast.message((err as Error).message || failed, { id })
    return null
  } finally {
    clearTimeout(timer)
    inFlight.delete(key)
  }
}
