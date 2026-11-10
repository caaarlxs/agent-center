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

type Texted = Keyed & { text?: string }

/** Each finished turn's answer: the texts at its end with no tool run between, by the first one's key, and their length. */
export function answerRuns(shown: readonly Texted[], isRunning: boolean): Map<string, { keys: string[]; chars: number }> {
  const runs = new Map<string, { keys: string[]; chars: number }>()
  let run: { keys: string[]; chars: number } | null = null
  let follows = false
  for (const item of shown) {
    if (item.kind === "assistant") {
      if (!run || !follows) run = { keys: [], chars: 0 }
      run.keys.push(item.key)
      run.chars += item.text?.length ?? 0
      follows = true
    } else if (item.kind === "user") {
      if (run) runs.set(run.keys[0]!, run)
      run = null
      follows = false
    } else follows = false
  }
  if (run && !isRunning) runs.set(run.keys[0]!, run)
  return runs
}

/** A level's page for one answer, in the board's theme ({theme}: "light" or "dark"). */
export function viewUrl(template: string, sessionId: string, answerKey: string, level: string, theme: string): string {
  return actionUrl(template, sessionId, answerKey).replaceAll("{level}", encodeURIComponent(level)).replaceAll("{theme}", encodeURIComponent(theme))
}
