// How far Setup is: the required steps and the others, done of all.
export type Tally = { done: number; total: number }

export function progressOf(steps: { need: string; isDone: boolean }[]): { required: Tally; optional: Tally } {
  const tally = (list: typeof steps) => ({ done: list.filter(s => s.isDone).length, total: list.length })
  return { required: tally(steps.filter(s => s.need === "Required")), optional: tally(steps.filter(s => s.need !== "Required")) }
}
