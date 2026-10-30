// What a commit's refs and merge mean, in words (the Commits tab).
import type { Commit } from "@/lib/api-types"

// A branch once, wherever it is: on this Mac, on GitHub ("origin/…"), or both.
export type Place = { name: string; isHere: boolean; isOnline: boolean; isCurrent: boolean }
export type Shown = { branches: Place[]; tags: string[] }

const REMOTE = /^(origin|upstream)\//

export function placesOf(refs: Commit["refs"]): Shown {
  const branches = new Map<string, Place>()
  const at = (name: string) => branches.get(name) ?? (branches.set(name, { name, isHere: false, isOnline: false, isCurrent: false }), branches.get(name)!)
  const tags: string[] = []
  for (const ref of refs) {
    if (ref.kind === "tag") tags.push(ref.name)
    else if (ref.kind === "remote") at(ref.name.replace(REMOTE, "")).isOnline = true
    else if (ref.name !== "HEAD") {
      const place = at(ref.name)
      place.isHere = true
      place.isCurrent ||= ref.kind === "head"
    }
  }
  // The branch you are on first.
  return { branches: [...branches.values()].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)), tags }
}

// What a merge brought, from git's own message: a pull request, or a branch into another.
export type Merge = { pr: number | null; from: string; into: string | null }
export function mergeOf(subject: string): Merge | null {
  const pr = subject.match(/^Merge pull request #(\d+) from [^/\s]+\/(\S+)/)
  if (pr) return { pr: Number(pr[1]), from: pr[2]!, into: null }
  const branch = subject.match(/^Merge (?:remote-tracking )?branch '([^']+)'(?: of \S+)?(?: into (\S+))?/)
  if (branch) return { pr: null, from: branch[1]!.replace(REMOTE, ""), into: branch[2] ?? null }
  return null
}
