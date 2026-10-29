// What a PR's state means for merging, and "Ready to merge?" (prs.js): every
// reason to wait in one list, with a prepared message for the session where
// it can fix the reason. Red stops the merge (it asks again), amber is worth
// a look, green is fine.
import type { PrDetail } from "@/lib/api-types"

export type Tone = "ok" | "bad" | "ask" | "muted"

// What GitHub says about merging, in words, and whether to try.
export function mergeState(pr: PrDetail): { text: string; tone: Tone | "work"; canMerge: boolean } {
  if (pr.isDraft) return { text: "Draft: mark it as ready to be able to merge", tone: "muted", canMerge: false }
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return { text: "Has conflicts with the base branch", tone: "bad", canMerge: false }
  switch (pr.mergeStateStatus) {
    case "CLEAN":
    case "HAS_HOOKS":
      return { text: "Ready to merge", tone: "work", canMerge: true }
    case "UNSTABLE":
      return { text: "Can be merged, but some checks are failing", tone: "ask", canMerge: true }
    case "BEHIND":
      return { text: "Out of date with the base branch", tone: "ask", canMerge: true }
    case "BLOCKED":
      return { text: "Blocked by the repo's rules (required review or checks)", tone: "ask", canMerge: true }
    default:
      return { text: "GitHub is working out whether it can be merged", tone: "muted", canMerge: true }
  }
}

export type Readiness = {
  threads?: { path: string | null; line: number | null; isOutdated: boolean; author: string | null; body: string }[]
  local?: { uncommitted: number; unpushed: number } | null
  tasks?: string[]
}
// `short`: what the top line says for it, when the row says more.
export type Row = { tone: Tone; text: string; short?: string; ask?: { label: string; text: string } }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function readinessRows(pr: PrDetail, data: Readiness | null): Row[] {
  const rows: Row[] = []
  if (pr.checks === "fail")
    rows.push({
      tone: "bad",
      text: `${pr.failing.length} failing ${pr.failing.length === 1 ? "check" : "checks"}: ${pr.failing.slice(0, 3).join(", ")}`,
      ask: {
        label: "Ask it to fix them",
        text: `These checks fail on PR #${pr.number} (${pr.url}): ${pr.failing.join(", ")}.\n\nRead the logs with \`gh pr checks ${pr.number}\`, fix them, commit and push, and tell me what happened.`,
      },
    })
  else if (pr.checks === "pending") {
    const done = (pr.checkList ?? []).filter(c => c.state !== "pending").length
    rows.push({ tone: "ask", text: pr.checkList?.length ? `Checks running: ${done}/${pr.checkList.length} done` : `${plural(pr.pending.length, "check", "checks")} running` })
  }
  else rows.push(pr.checks === "pass" ? { tone: "ok", text: "Checks passing" } : { tone: "muted", text: "No checks" })
  const review = pr.reviewDecision
  const who = reviewText(pr.reviewers ?? [])
  rows.push(
    review === "APPROVED" ? { tone: "ok", text: who ?? "Approved" }
      : review === "CHANGES_REQUESTED" ? { tone: "bad", text: who ?? "Changes requested" }
      : review === "REVIEW_REQUIRED" ? { tone: "ask", text: who ? `Review required: ${who.toLowerCase()}` : "Review required" }
      : who ? { tone: "muted", text: who } : { tone: "muted", text: "No review required" },
  )
  if (data?.threads) {
    const n = data.threads.length
    rows.push(n ? {
      tone: "bad",
      text: `${n} unresolved review ${n === 1 ? "comment" : "comments"}`,
      ask: {
        label: "Send to the session",
        text: `${n === 1 ? "There is 1 unresolved comment" : `There are ${n} unresolved comments`} on PR #${pr.number} (${pr.url}):\n\n${data.threads
          .map((t, i) => `${i + 1}. ${t.path ? `\`${t.path}${t.line ? `:${t.line}` : ""}\`` : "General review"}${t.isOutdated ? " (code already changed)" : ""} — @${t.author ?? "?"}:\n   ${t.body.replace(/\n/g, "\n   ")}`)
          .join("\n\n")}\n\nResolve them, commit and push, and tell me what you changed for each one.`,
      },
    } : { tone: "ok", text: "No unresolved review comments" })
  }
  if (data?.local) {
    const { uncommitted, unpushed } = data.local
    const issues = [uncommitted && plural(uncommitted, "uncommitted file", "uncommitted files"), unpushed && plural(unpushed, "unpushed commit", "unpushed commits")].filter(Boolean)
    rows.push(issues.length ? { tone: "bad", text: `In the session's folder: ${issues.join(" and ")}` } : { tone: "ok", text: "Everything committed and pushed" })
  }
  if (data?.tasks?.length) {
    const first = data.tasks[0]
    const count = plural(data.tasks.length, "open task", "open tasks")
    rows.push({ tone: "ask", text: `${count}: ${first.slice(0, 80)}${first.length > 80 ? "…" : ""}`, short: count })
  }
  if (pr.mergeable === "CONFLICTING")
    rows.push({
      tone: "bad",
      text: `Conflicts with ${pr.baseRefName}`,
      ask: {
        label: "Ask it to resolve them",
        text: `PR #${pr.number} (${pr.url}) has conflicts with ${pr.baseRefName}. Update the branch with ${pr.baseRefName}, resolve the conflicts, check that everything still works, and push.`,
      },
    })
  else if (pr.mergeStateStatus === "BEHIND") rows.push({ tone: "ask", text: `The branch is behind ${pr.baseRefName}` })
  return rows
}

// The one line on top: what stops the merge first, else what is worth a look,
// else GitHub's word. The rows stay below it for the detail.
export function verdict(pr: PrDetail, rows: Row[]): { text: string; tone: Tone | "work" } {
  const merge = mergeState(pr)
  if (pr.isDraft) return merge
  const bad = rows.filter(r => r.tone === "bad")
  if (bad.length) return { text: bad.length > 1 ? `${bad[0].text} · ${bad.length - 1} more` : bad[0].text, tone: "bad" }
  const ask = rows.find(r => r.tone === "ask")
  if (merge.tone === "work" && ask) return { text: ask.short ? `${merge.text} · ${ask.short}` : ask.text, tone: "ask" }
  return merge
}

// "Approved by ana", "Waiting on bo, carla": the reviewers in words.
export function reviewText(reviewers: PrDetail["reviewers"]): string | null {
  const by = (state: string) => reviewers.filter(r => r.state === state).map(r => r.login).join(", ")
  const parts = [
    by("CHANGES_REQUESTED") && `changes requested by ${by("CHANGES_REQUESTED")}`,
    by("APPROVED") && `approved by ${by("APPROVED")}`,
    by("PENDING") && `waiting on ${by("PENDING")}`,
  ].filter(Boolean) as string[]
  if (!parts.length) return null
  const text = parts.join(" · ")
  return text[0].toUpperCase() + text.slice(1)
}
