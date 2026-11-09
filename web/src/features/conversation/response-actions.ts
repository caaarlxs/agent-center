// Where the buttons set in settings.json (lib/response-actions.ts) go: under
// the last text of each finished turn, the answer as the person reads it.
// Pure: tested on its own.

type Keyed = { key: string; kind: string }

/** Keys of the last answer text of each turn; the running turn's has none yet. */
export function answerEnds(shown: readonly Keyed[], isRunning: boolean): Set<string> {
  const ends = new Set<string>()
  let last: string | null = null
  for (const item of shown) {
    if (item.kind === "assistant") last = item.key
    else if (item.kind === "user") {
      if (last) ends.add(last)
      last = null
    }
  }
  if (last && !isRunning) ends.add(last)
  return ends
}

/** The action's URL for one answer: an answer's key is its message id, then ":" and the block. */
export function actionUrl(template: string, sessionId: string, answerKey: string): string {
  const message = answerKey.split(":")[0] ?? answerKey
  return template.replaceAll("{session}", encodeURIComponent(sessionId)).replaceAll("{message}", encodeURIComponent(message))
}
