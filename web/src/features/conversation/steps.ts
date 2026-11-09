// The steps of a finished turn: what Claude said and ran on the way to its
// answer. Folded into one line under the "Fold steps" setting, so a finished
// turn reads as your message and the answer. Pure: tested on its own.

type Item = { key: string; kind: string; actions?: readonly unknown[] }
export type Fold = { keys: string[]; actions: number }

const STEP = new Set(["assistant", "tools", "plan"])

// One turn's steps: its texts, tool runs and plans before the answer (the
// texts at its end). Questions, files and edits stay where they are.
function stepsOf(turn: readonly Item[]): Item[] {
  let answer = turn.length
  while (answer > 0 && turn[answer - 1]!.kind !== "tools" && turn[answer - 1]!.kind !== "plan") answer--
  const hasAnswer = turn.slice(answer).some(i => i.kind === "assistant")
  return hasAnswer ? turn.slice(0, answer).filter(i => STEP.has(i.kind)) : []
}

/** Each finished turn's steps, by the first one's key; and every key folded. */
export function foldedSteps(shown: readonly Item[], isRunning: boolean): { heads: Map<string, Fold>; hidden: Set<string> } {
  const heads = new Map<string, Fold>()
  const hidden = new Set<string>()
  const fold = (turn: Item[]) => {
    const steps = stepsOf(turn)
    if (!steps.length) return
    heads.set(steps[0]!.key, { keys: steps.map(s => s.key), actions: steps.reduce((n, s) => n + (s.actions?.length ?? 0), 0) })
    for (const s of steps) hidden.add(s.key)
  }
  let turn: Item[] = []
  for (const item of shown) {
    if (item.kind === "user") (fold(turn), (turn = []))
    else turn.push(item)
  }
  if (!isRunning) fold(turn)
  return { heads, hidden }
}
