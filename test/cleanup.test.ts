import { describe, expect, it } from "bun:test"
import { archiveOf, cleanupSteps, keptAfter, leftoversOf, wantedBranches, worktreesIn, type Archive, type Found } from "../lib/cleanup"

const P = "/data/pipeline"
const unit = (repo: string, branch: string) => ({ repo, branch }) as never
const archive = (name: string, units: unknown[] = []): Archive => ({ name, path: `${P}/${name}`, at: Number(name.split("-").at(-1)), state: { stage: "build", runs: 3, units } as never })
const found = (extra: Partial<Found> = {}): Found => ({ key: "PP-1", liveDir: `${P}/PP-1`, live: null, archives: [], clones: [], ...extra })

describe("archiveOf", () => {
  it("is a run of this ticket put aside, by Remove or by Start over", () => {
    expect(archiveOf("PP-1.removed-100", "PP-1")).toEqual({ how: "removed", at: 100 })
    expect(archiveOf("PP-1.old-7", "PP-1")).toEqual({ how: "old", at: 7 })
    expect(archiveOf("PP-12.old-7", "PP-1")).toBeNull()
    expect(archiveOf("PP-1", "PP-1")).toBeNull()
  })
})

describe("worktreesIn", () => {
  it("reads each worktree's path and branch, without the clone itself", () => {
    const out = "worktree /r/web\nHEAD a\nbranch refs/heads/master\n\nworktree /p/PP-1/work/U1-web\nHEAD b\nbranch refs/heads/feat/x\nprunable gitdir file points to non-existent location\n\nworktree /p/x\nHEAD c\ndetached\n"
    expect(worktreesIn(out)).toEqual([{ path: "/p/PP-1/work/U1-web", branch: "feat/x" }, { path: "/p/x", branch: null }])
  })
})

describe("wantedBranches", () => {
  it("is the branches the runs put aside built on in that repo, and the ticket's conflicts", () => {
    const a = [archive("PP-1.removed-1", [unit("web", "feat/a"), unit("api", "feat/b")])]
    expect(wantedBranches("PP-1", a, "web", ["master", "feat/a", "feat/b", "conflicts/PP-1-2", "conflicts/PP-10-1"])).toEqual(["feat/a", "conflicts/PP-1-2"])
  })
})

describe("leftoversOf", () => {
  const a = archive("PP-1.removed-1794230462435", [unit("web", "feat/a")])
  it("lists the runs, their worktrees (gone, or in the archive) and their branches, all picked", () => {
    const items = leftoversOf(found({
      archives: [a],
      clones: [{ repo: "web", worktrees: [{ path: `${P}/PP-1/work/U1-web`, branch: "feat/a", exists: false }, { path: "/elsewhere/w", branch: "main-x", exists: true }], branches: [{ name: "feat/a", unpushed: 0 }] }],
    }))
    expect(items.map(i => [i.id, i.isPicked])).toEqual([[`run:${a.name}`, true], [`worktree:web:${P}/PP-1/work/U1-web`, true], ["branch:web:feat/a", true]])
  })
  it("never the live run's worktrees or branches, nor a branch a worktree that stays holds", () => {
    const live = { stage: "build", units: [unit("web", "feat/a")] } as never
    const items = leftoversOf(found({
      live, archives: [a],
      clones: [{ repo: "web", worktrees: [{ path: `${P}/PP-1/work/U1-web`, branch: "feat/a", exists: true }], branches: [{ name: "feat/a", unpushed: 0 }] }],
    }))
    expect(items.map(i => i.kind)).toEqual(["run"])
  })
  it("a branch with commits not on GitHub says so, and is not picked at first", () => {
    const items = leftoversOf(found({ archives: [a], clones: [{ repo: "web", worktrees: [], branches: [{ name: "feat/a", unpushed: 2 }] }] }))
    expect(items.find(i => i.kind === "branch")).toMatchObject({ warn: "2 commits not on GitHub", isPicked: false })
  })
})

describe("cleanupSteps", () => {
  it("removes the worktrees first, then their branches, then the runs", () => {
    const a = archive("PP-1.old-5")
    const picked = [{ id: "run:PP-1.old-5", kind: "run" }, { id: "branch:web:feat/a", kind: "branch" }, { id: "worktree:web:/p/PP-1/work/U1-web", kind: "worktree" }] as never
    expect(cleanupSteps(picked, "/repos", [a])).toEqual([
      { cwd: "/repos/web", cmd: ["git", "worktree", "remove", "--force", "/p/PP-1/work/U1-web"] },
      { cwd: "/repos/web", cmd: ["git", "branch", "-D", "feat/a"] },
      { remove: `${P}/PP-1.old-5` },
    ])
  })
})

describe("a branch kept when its run went", () => {
  it("is remembered, and still shows up once the run is gone", () => {
    const all = [{ id: "run:PP-1.old-5", kind: "run" }, { id: "branch:web:feat/a", kind: "branch" }, { id: "branch:web:conflicts/PP-1-1", kind: "branch" }] as never
    const kept = keptAfter(all, [{ id: "run:PP-1.old-5" }, { id: "branch:web:conflicts/PP-1-1" }] as never)
    expect(kept).toEqual([{ repo: "web", branch: "feat/a" }])
    const items = leftoversOf(found({ kept, clones: [{ repo: "web", worktrees: [], branches: [{ name: "feat/a", unpushed: 0 }] }] }))
    expect(items.map(i => i.id)).toEqual(["branch:web:feat/a"])
  })
})
