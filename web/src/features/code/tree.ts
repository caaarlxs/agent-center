// A repository's file list as a tree, and the "go to file" ranking. Pure:
// tested on their own.

export type Folder = { path: string; dirs: Map<string, Folder>; files: string[] }

// Paths → folders and files; each folder knows its own path.
export function treeOf(paths: string[]): Folder {
  const root: Folder = { path: "", dirs: new Map(), files: [] }
  for (const path of paths) {
    let node = root
    const parts = path.split("/")
    parts.slice(0, -1).forEach((part, i) => {
      if (!node.dirs.has(part)) node.dirs.set(part, { path: parts.slice(0, i + 1).join("/"), dirs: new Map(), files: [] })
      node = node.dirs.get(part)!
    })
    node.files.push(path)
  }
  return root
}

// The folders above a path: "a/b/c.ts" → ["a", "a/b"].
export const parentsOf = (path: string) => path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))

// The folders holding a changed file (git's status), for the tree's dots.
export function changedFolders(status: Record<string, string>): Set<string> {
  return new Set(Object.keys(status).flatMap(parentsOf))
}

// "Go to file": the paths holding the query's letters in order; the ones whose
// name holds the query whole come first, then the path, then the shortest.
export function rankFiles(paths: string[], query: string, max = 50): string[] {
  const q = query.toLowerCase().replace(/\s+/g, "")
  if (!q) return paths.slice(0, max)
  const out: [string, number][] = []
  for (const path of paths) {
    const p = path.toLowerCase()
    let i = 0
    for (const ch of p) if (ch === q[i]) i++
    if (i < q.length) continue
    const name = p.split("/").pop()!
    out.push([path, (name.includes(q) ? 0 : p.includes(q) ? 1 : 2) * 1000 + path.length])
  }
  return out.sort((a, b) => a[1] - b[1]).slice(0, max).map(([path]) => path)
}
