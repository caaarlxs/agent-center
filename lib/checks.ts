// What the board checks of a stage's run by itself, after it ends: what the
// agent says is not taken as done. A check never stops a run (the agent always
// gets to finish); one that does not hold is a warning in the ticket, and the
// review reads them all before it starts.
//
// After a refinement or a plan, the repos are as they were. After a build,
// each PR is a draft, on the plan's branch, against the default one, and its
// checks pass; and its tests were not deleted, switched off or left with
// fewer assertions (the shortcuts to "the tests pass"). A run that took too
// long or cost too much says so.

export type Check = { id: string; label: string; status: "ok" | "warn"; detail: string | null }
export type Sh = (cmd: string[], options?: { cwd?: string; timeoutMs?: number }) => Promise<{ ok: boolean; out: string; err: string }>

const ok = (id: string, label: string, detail: string | null = null): Check => ({ id, label, status: "ok", detail })
const warn = (id: string, label: string, detail: string | null = null): Check => ({ id, label, status: "warn", detail })

// ---------- the tests a diff takes away ----------

const isTest = (path: string) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/.test(path)
const SKIP = /\b(it|test|describe)\.(skip|todo)\(|\bx(it|describe|test)\(|@pytest\.mark\.(skip|xfail)|\bpytest\.(skip|xfail)\(|\bt\.Skip\(/
const ASSERT = /\bexpect\(|\bassert\b|\bassert[A-Z]\w*\(|\bself\.assert\w*\(/

// What a unified diff does to the tests: the test files it deletes, the ones
// it switches tests off in, and how many assertions it takes away from the rest.
export function gamingIn(diff: string) {
  const deleted: string[] = []
  const skipped = new Set<string>()
  let lost = 0
  let file = ""
  let isGone = false
  for (const line of diff.split("\n")) {
    const head = line.match(/^diff --git a\/(.+) b\/(.+)$/)
    if (head) {
      file = head[2]!
      isGone = false
      continue
    }
    if (line.startsWith("deleted file mode")) {
      isGone = true
      if (isTest(file)) deleted.push(file)
      continue
    }
    if (!isTest(file) || isGone || line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+") && SKIP.test(line)) skipped.add(file)
    if (ASSERT.test(line)) lost += line.startsWith("-") ? 1 : line.startsWith("+") ? -1 : 0
  }
  return { deleted, skipped: [...skipped], assertionsLost: Math.max(0, lost) }
}

// ---------- a PR ----------

type Rollup = { conclusion?: string; state?: string; status?: string }[]
const FAILED = ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]
const PASSED = ["SUCCESS", "NEUTRAL", "SKIPPED"]
export function checksRollup(rollup: Rollup): "pass" | "fail" | "pending" | "none" {
  if (!rollup.length) return "none"
  const states = rollup.map(c => (c.conclusion || c.state || c.status || "").toUpperCase())
  if (states.some(s => FAILED.includes(s))) return "fail"
  return states.every(s => PASSED.includes(s)) ? "pass" : "pending"
}

type PrUnit = { id: string; repo: string; branch: string; pr?: string | null }
const jsonOf = (text: string) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// A built unit's PR, as GitHub has it, and what its diff does to the tests.
export async function prChecks(u: PrUnit, sh: Sh): Promise<Check[]> {
  if (!u.pr) return [warn(`${u.id}-pr`, `${u.repo}: no PR`)]
  const pr = jsonOf((await sh(["gh", "pr", "view", u.pr, "--json", "isDraft,headRefName,baseRefName,statusCheckRollup,state"], { timeoutMs: 30_000 })).out)
  if (!pr) return [warn(`${u.id}-pr`, `${u.repo}: GitHub did not answer for its PR`)]
  const slug = u.pr.match(/github\.com\/([^/]+\/[^/]+)\//)?.[1] ?? ""
  const base = (await sh(["gh", "repo", "view", slug, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"])).out || "master"
  const rollup = checksRollup(pr.statusCheckRollup ?? [])
  const gaming = gamingIn((await sh(["gh", "pr", "diff", u.pr], { timeoutMs: 60_000 })).out)
  const name = `${u.repo}`
  return [
    pr.isDraft || pr.state === "MERGED" ? ok(`${u.id}-draft`, `${name}: draft PR`) : warn(`${u.id}-draft`, `${name}: the PR is not a draft`),
    !u.branch || pr.headRefName === u.branch ? ok(`${u.id}-branch`, `${name}: on the plan's branch`) : warn(`${u.id}-branch`, `${name}: on ${pr.headRefName}, not the plan's ${u.branch}`),
    pr.baseRefName === base ? ok(`${u.id}-base`, `${name}: against ${base}`) : warn(`${u.id}-base`, `${name}: against ${pr.baseRefName}, not ${base}`),
    rollup === "pass" ? ok(`${u.id}-ci`, `${name}: checks pass`) : warn(`${u.id}-ci`, `${name}: checks ${rollup === "fail" ? "fail" : rollup === "pending" ? "still run" : "did not run"}`),
    testsCheck(`${u.id}-tests`, name, gaming),
  ]
}

// What a PR's diff took away from its tests, as one check.
function testsCheck(id: string, name: string, gaming: ReturnType<typeof gamingIn>): Check {
  const lost = [gaming.deleted.length && `deleted ${gaming.deleted.join(", ")}`, gaming.skipped.length && `switched off in ${gaming.skipped.join(", ")}`, gaming.assertionsLost && `${gaming.assertionsLost} assertions fewer`].filter(Boolean)
  return lost.length ? warn(id, `${name}: tests weakened`, lost.join(" · ")) : ok(id, `${name}: no test taken away`)
}

// ---------- the repos, the run ----------

// The repos the agents read, as they were: no change left in any of them.
export async function reposClean(dirs: string[], sh: Sh): Promise<Check[]> {
  const dirty: string[] = []
  for (const dir of dirs) if ((await sh(["git", "-C", dir, "status", "--porcelain"])).out.trim()) dirty.push(dir.split("/").pop()!)
  return [dirty.length ? warn("repos", "Repos changed", dirty.join(", ")) : ok("repos", "Repos untouched")]
}

const MAX_MS = 90 * 60_000
const MAX_COST = 15
export function overLimits(ms: number, cost: number): Check[] {
  return [
    ...(ms > MAX_MS ? [warn("time", "The run took long", `${Math.round(ms / 60_000)} min`)] : []),
    ...(cost > MAX_COST ? [warn("cost", "The run cost a lot", `≈$${Math.round(cost)}`)] : []),
  ]
}
