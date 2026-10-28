// When each step of a moment starts and when the place goes back to its own
// icon. Reduced motion keeps only the last step of a sequence (the outcome,
// e.g. the check after a copy) and skips a single-step moment.
export type Plan = { step: number; at: number }[] // step -1: back to normal

export function momentPlan(stepsMs: number[], isReduced = false): Plan {
  if (isReduced) return stepsMs.length > 1 ? [{ step: stepsMs.length - 1, at: 0 }, { step: -1, at: stepsMs.at(-1)! }] : []
  const plan: Plan = []
  let at = 0
  stepsMs.forEach((ms, step) => {
    plan.push({ step, at })
    at += ms
  })
  plan.push({ step: -1, at })
  return plan
}
