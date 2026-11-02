// What to do next in a session that waits, from where its folder stands and
// its branch's PR: fix the PR's checks, commit, push, open a PR, review it.
// Each is a message for Claude or a tab to open; three at most.
import type { Card } from "@/lib/api-types"

type Pr = Card["prs"][number]
export type WorkState = { branch: string; base: string | null; uncommitted: number; unpushed: number | null; ahead: number | null }
export type Step = { label: string; message?: string; tab?: "prs" | "changes" }

export function nextSteps(state: WorkState | null, pr: Pr | null): Step[] {
  if (!state) return []
  const steps: Step[] = []
  const isOpen = pr?.state === "OPEN"
  if (isOpen && pr.checks === "fail")
    steps.push({ label: "Fix the checks", message: `The checks fail on PR #${pr.number} (${pr.url}). Read the logs with \`gh pr checks ${pr.number}\`, fix them, commit and push.` })
  if (state.uncommitted > 0) steps.push({ label: "Review the changes", tab: "changes" }, { label: "Commit", message: "Commit the changes with a clear message." })
  else if (state.unpushed) steps.push({ label: "Push", message: "Push the commits." })
  else if (!pr && state.ahead && state.base && state.branch !== state.base)
    steps.push({ label: "Open a PR", message: `Open a pull request for ${state.branch} into ${state.base}.` })
  if (isOpen && !pr.isDraft && pr.checks !== "fail" && state.uncommitted === 0 && !state.unpushed) steps.push({ label: `Review PR #${pr.number}`, tab: "prs" })
  return steps.slice(0, 3)
}
