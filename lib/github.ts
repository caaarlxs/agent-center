// Pull requests through the `gh` CLI: a cached summary for the cards, the
// full detail for the reader, the actions the reader offers, and what a PR
// changes.

import { HOME } from "./config"
import { type FileDiff, parse } from "./changes"
import { exec } from "./proc"

const SUMMARY_TTL_MS = 120_000
// A branch with no PR asks again less often: most cards have none, and every
// ask is a `gh` process (a PR the session opens shows sooner from its transcript).
const NO_PR_TTL_MS = 600_000
const DETAIL_TTL_MS = 20_000
const MAX_IN_FLIGHT = 3
const PR_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/

export type Checks = "pass" | "fail" | "pending" | null

export type Pr = {
  number: number
  title: string
  url: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  reviewDecision: string | null
  checks: Checks
  createdAt?: string | null // when it was opened (lib/pets.ts counts the new ones)
}

export type PrDetail = Pr & {
  repo: string
  baseRefName: string
  headRefName: string
  additions: number
  deletions: number
  changedFiles: number
  mergeable: string // MERGEABLE | CONFLICTING | UNKNOWN
  mergeStateStatus: string // CLEAN | BLOCKED | BEHIND | DIRTY | UNSTABLE | DRAFT | ...
  author: string | null
  updatedAt: string
  failing: string[]
  pending: string[]
  checkList: Check[]
  reviewers: Reviewer[]
  createdAt: string
  commits: number
  // Why the session lists it: its branch's PR, or one named in the chat.
  origin?: "branch" | "chat"
}

export type Check = { name: string; state: "pass" | "fail" | "pending" | "skip"; url: string | null; seconds: number | null }
export type Reviewer = { login: string; state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" }

type Rollup = { name?: string; context?: string; conclusion?: string; state?: string; status?: string; detailsUrl?: string; targetUrl?: string; startedAt?: string; completedAt?: string }[]

const SUMMARY_FIELDS = "number,title,url,state,isDraft,reviewDecision,statusCheckRollup,createdAt"
const DETAIL_FIELDS = `${SUMMARY_FIELDS},baseRefName,headRefName,additions,deletions,changedFiles,mergeable,mergeStateStatus,author,updatedAt,createdAt,commits,latestReviews,reviewRequests`

// The most PRs a session lists (its PRs tab, its card).
export const PR_LIMIT = 12

async function gh(args: string[], cwd = HOME, timeoutMs = 20_000) {
  const { code, stdout, stderr } = await exec(["gh", ...args], { cwd, timeoutMs })
  return { ok: code === 0, out: stdout.trim(), err: stderr.trim() }
}

const FAILED = ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]
const PASSED = ["SUCCESS", "NEUTRAL", "SKIPPED"]
const stateOf = (c: Rollup[number]) => (c.conclusion || c.state || c.status || "").toUpperCase()

function checksOf(rollup: Rollup = []): Checks {
  if (rollup.length === 0) return null
  const states = rollup.map(stateOf)
  if (states.some(s => FAILED.includes(s))) return "fail"
  if (states.every(s => PASSED.includes(s))) return "pass"
  return "pending"
}

const SKIPPED = ["SKIPPED", "NEUTRAL"]

export function checkOf(c: Rollup[number]): Check {
  const s = stateOf(c)
  const state = FAILED.includes(s) ? "fail" : SKIPPED.includes(s) ? "skip" : PASSED.includes(s) ? "pass" : "pending"
  const took = c.startedAt && c.completedAt ? (Date.parse(c.completedAt) - Date.parse(c.startedAt)) / 1000 : NaN
  return { name: c.name || c.context || "check", state, url: c.detailsUrl || c.targetUrl || null, seconds: took >= 0 ? Math.round(took) : null }
}

// Who reviewed (their last word) and who is still asked; a team counts by its name.
export function reviewersOf(latest: any[] = [], requested: any[] = []): Reviewer[] {
  const out = new Map<string, Reviewer["state"]>()
  for (const r of latest) if (r.author?.login && r.state !== "DISMISSED") out.set(r.author.login, r.state === "PENDING" ? "COMMENTED" : r.state)
  for (const r of requested) {
    const login = r.login || r.slug || r.name
    if (login) out.set(login, "PENDING")
  }
  return [...out].map(([login, state]) => ({ login, state }))
}

function summary(raw: any): Pr {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    isDraft: !!raw.isDraft,
    reviewDecision: raw.reviewDecision || null,
    checks: checksOf(raw.statusCheckRollup),
    createdAt: raw.createdAt ?? null,
  }
}

// ---------- summaries for the cards ----------

const summaries = new Map<string, { pr: Pr | null; at: number }>()
// What waits to be asked for, in order, each once (key → its ref and folder).
const queue = new Map<string, { ref: string; cwd: string }>()
let running = 0
const BATCH = 20

// Never blocks: answers what the cache holds; one missing or old waits in
// line and is asked for behind. `ref` is a branch (looked up in `cwd`'s
// repository) or a PR URL.
export function lookup(key: string, ref: string, cwd: string): Pr | null {
  const hit = summaries.get(key)
  if (!hit || Date.now() - hit.at > (hit.pr ? SUMMARY_TTL_MS : NO_PR_TTL_MS)) {
    queue.set(key, { ref, cwd })
    drain()
  }
  return hit?.pr ?? null
}

// PR addresses go to GitHub twenty at a time, in one query; a branch, alone.
function drain() {
  while (running < MAX_IN_FLIGHT && queue.size) {
    const urls = [...queue].filter(([, q]) => PR_URL.test(q.ref)).slice(0, BATCH)
    const job = urls.length ? urls : [[...queue][0]!]
    for (const [key] of job) queue.delete(key)
    running++
    const ask = urls.length ? summariesOf(urls.map(([, q]) => q.ref)) : one(job[0]![1])
    void ask
      .then(found => job.forEach(([key], i) => summaries.set(key, { pr: (urls.length ? found[i] : found[0]) ?? null, at: Date.now() })))
      .catch(() => job.forEach(([key]) => summaries.set(key, { pr: summaries.get(key)?.pr ?? null, at: Date.now() })))
      .finally(() => (running--, drain()))
  }
}

const one = (q: { ref: string; cwd: string }) =>
  gh(["pr", "view", q.ref, "--json", SUMMARY_FIELDS], q.cwd, 15_000).then(res => [res.ok ? summary(JSON.parse(res.out)) : null])

// The overall state of a PR's checks, as GitHub's rollup says it.
const ROLLUP: Record<string, Checks> = { SUCCESS: "pass", FAILURE: "fail", ERROR: "fail", PENDING: "pending", EXPECTED: "pending" }

// Several PRs by their addresses, in one GraphQL query: each a summary, or null.
export async function summariesOf(urls: string[]): Promise<(Pr | null)[]> {
  const parts = urls.map((url, i) => {
    const [, owner, name, number] = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/)!
    return `p${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { pullRequest(number: ${number}) { number title url state isDraft reviewDecision createdAt commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } }`
  })
  const res = await gh(["api", "graphql", "-f", `query={ ${parts.join(" ")} }`], HOME, 30_000)
  if (!res.out) throw new Error(res.err || "gh could not read the PRs")
  const data = JSON.parse(res.out).data ?? {}
  return urls.map((_, i) => {
    const raw = data[`p${i}`]?.pullRequest
    if (!raw) return null
    const rollup = raw.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
    return { number: raw.number, title: raw.title, url: raw.url, state: raw.state, isDraft: !!raw.isDraft, reviewDecision: raw.reviewDecision || null, checks: ROLLUP[rollup] ?? null, createdAt: raw.createdAt ?? null }
  })
}

// ---------- detail for the reader ----------

const details = new Map<string, { pr: PrDetail | null; at: number }>()

export async function detail(url: string): Promise<PrDetail | null> {
  if (!PR_URL.test(url)) return null
  const hit = details.get(url)
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.pr
  const res = await gh(["pr", "view", url, "--json", DETAIL_FIELDS], HOME, 15_000)
  let pr: PrDetail | null = null
  if (res.ok) {
    const raw = JSON.parse(res.out)
    const rollup: Rollup = raw.statusCheckRollup ?? []
    pr = {
      ...summary(raw),
      repo: url.split("/")[4] ?? "",
      baseRefName: raw.baseRefName,
      headRefName: raw.headRefName,
      additions: raw.additions,
      deletions: raw.deletions,
      changedFiles: raw.changedFiles,
      mergeable: raw.mergeable,
      mergeStateStatus: raw.mergeStateStatus,
      author: raw.author?.login ?? null,
      updatedAt: raw.updatedAt,
      failing: rollup.filter(c => FAILED.includes(stateOf(c))).map(c => c.name || c.context || "check"),
      pending: rollup.filter(c => !FAILED.includes(stateOf(c)) && !PASSED.includes(stateOf(c))).map(c => c.name || c.context || "check"),
      checkList: rollup.map(checkOf),
      reviewers: reviewersOf(raw.latestReviews, raw.reviewRequests),
      createdAt: raw.createdAt,
      commits: raw.commits?.length ?? 0,
    }
  }
  details.set(url, { pr, at: Date.now() })
  return pr
}

// ---------- review threads ----------

export type Thread = { path: string | null; line: number | null; author: string | null; body: string; url: string | null; isOutdated: boolean }

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes { isResolved isOutdated path line originalLine comments(first: 20) { nodes { author { login } body url } } }
      }
      reviews(last: 30) { nodes { state body url author { login } } }
    }
  }
}`

// The review comments still open on a PR: unresolved threads (their first
// comment and the replies) and reviews that asked for changes with a text.
export async function openThreads(url: string): Promise<Thread[] | null> {
  if (!PR_URL.test(url)) return null
  const [, , , owner, name, , number] = url.split("/")
  const res = await gh(["api", "graphql", "-f", `query=${THREADS_QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`], HOME, 20_000)
  if (!res.ok) return null
  const pr = JSON.parse(res.out).data?.repository?.pullRequest
  if (!pr) return null
  const threads: Thread[] = (pr.reviewThreads?.nodes ?? [])
    .filter((t: any) => !t.isResolved)
    .map((t: any) => {
      const [first, ...replies] = t.comments?.nodes ?? []
      const body = [first?.body ?? "", ...replies.map((r: any) => `@${r.author?.login ?? "?"}: ${r.body}`)].join("\n").trim()
      return { path: t.path ?? null, line: t.line ?? t.originalLine ?? null, author: first?.author?.login ?? null, body, url: first?.url ?? null, isOutdated: !!t.isOutdated }
    })
  for (const r of pr.reviews?.nodes ?? [])
    if (r.state === "CHANGES_REQUESTED" && r.body?.trim())
      threads.push({ path: null, line: null, author: r.author?.login ?? null, body: r.body.trim(), url: r.url ?? null, isOutdated: false })
  return threads
}

// ---------- actions ----------

export type PrAction = "merge" | "close" | "reopen" | "ready" | "draft"
export type MergeMethod = "squash" | "merge" | "rebase"

export async function act(url: string, action: PrAction, opts: { method?: MergeMethod; deleteBranch?: boolean } = {}) {
  if (!PR_URL.test(url)) return { ok: false, error: "invalid PR URL" }
  const args: Record<PrAction, string[]> = {
    merge: ["pr", "merge", url, `--${opts.method ?? "squash"}`, ...(opts.deleteBranch ? ["--delete-branch"] : [])],
    close: ["pr", "close", url],
    reopen: ["pr", "reopen", url],
    ready: ["pr", "ready", url],
    draft: ["pr", "ready", url, "--undo"],
  }
  if (!args[action]) return { ok: false, error: `unknown action: ${action}` }
  // Outside any repository: --delete-branch then deletes the remote branch only.
  const res = await gh(args[action], HOME, 60_000)
  // Whatever happened, the next read asks GitHub again.
  details.delete(url)
  for (const [key, hit] of summaries) if (key === url || hit.pr?.url === url) summaries.delete(key)
  return res.ok ? { ok: true } : { ok: false, error: res.err.split("\n").at(-1) || "gh failed" }
}

// What a PR changes, file by file, as the Changes tab shows a diff: asked of
// GitHub, kept a minute. Too big a diff is cut, as a file too long is.
const DIFF_MAX = 4_000_000
const diffs = new Map<string, { at: number; files: FileDiff[] }>()
export async function diffOf(url: string): Promise<FileDiff[]> {
  if (!PR_URL.test(url)) throw new Error("Not a pull request's address")
  const kept = diffs.get(url)
  if (kept && Date.now() - kept.at < 60_000) return kept.files
  const r = await gh(["pr", "diff", url], HOME, 30_000)
  if (!r.ok) throw new Error(r.err || "gh could not read the diff")
  const files = parse(r.out.slice(0, DIFF_MAX))
  diffs.set(url, { at: Date.now(), files })
  return files
}
