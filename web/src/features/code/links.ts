// A file or folder the conversation names (`backend/app.py`, `src/api.ts:42`,
// `/Users/…/repo/README.md`), placed in the session's repository as the Code
// tab shows it. Only what is in its tree is a place: `main`, a branch or a
// file not written yet stay text. Relative names are read from the
// repository's root; absolute ones only count inside it.
import { useEffect, useState } from "react"
import { get } from "@/lib/api"
import type { CodeTree } from "@/lib/api-types"
import { parentsOf } from "./tree"

export type CodeIndex = { root: string; files: Set<string>; dirs: Set<string> }
export type CodePlace = { path: string; line?: number; isDir: boolean }

export function indexOf(tree: Pick<CodeTree, "root" | "files">): CodeIndex {
  return { root: tree.root.replace(/\/+$/, ""), files: new Set(tree.files), dirs: new Set(tree.files.flatMap(parentsOf)) }
}

// "x.ts:42", "x.ts:42:7" and "x.ts#L42" name a line.
const LINE = /(?::(\d+)(?::\d+)?|#L(\d+))$/

/** Where `text` points in the repository, if it names one of its files or folders. */
export function placeOf(text: string, index: CodeIndex): CodePlace | null {
  let name = text.trim().replace(/^["'`]|["'`]$/g, "")
  if (!name || name.length > 400 || /\s/.test(name)) return null
  const line = name.match(LINE)
  if (line) name = name.slice(0, line.index)
  const home = index.root.match(/^\/Users\/[^/]+/)?.[0]
  if (home && name.startsWith("~/")) name = home + name.slice(1)
  if (name.startsWith("/")) {
    if (!name.startsWith(index.root + "/")) return null
    name = name.slice(index.root.length + 1)
  }
  name = name.replace(/^\.\//, "").replace(/\/+$/, "")
  const at = line ? Number(line[1] ?? line[2]) : undefined
  if (index.files.has(name)) return { path: name, ...(at ? { line: at } : {}), isDir: false }
  if (index.dirs.has(name)) return { path: name, isDir: true }
  return null
}

// One read of a session's tree for every message that asks, kept a minute.
const KEEP_MS = 60_000
const cache = new Map<string, { at: number; index: Promise<CodeIndex | null> }>()

function indexFor(id: string) {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.index
  const index = get<CodeTree>(`/api/sessions/${encodeURIComponent(id)}/codetree`).then(indexOf, () => null)
  cache.set(id, { at: Date.now(), index })
  return index
}

/** The session's repository index, read only when `wanted` (a message names something that may be a path). */
export function useCodeIndex(id: string | null, wanted: boolean): CodeIndex | null {
  const [index, setIndex] = useState<CodeIndex | null>(null)
  useEffect(() => {
    if (!id || !wanted) return
    let alive = true
    void indexFor(id).then(i => alive && setIndex(i))
    return () => {
      alive = false
    }
  }, [id, wanted])
  return index
}

// Text that may name a path: a slash or a file's extension, no spaces.
export const mayBePath = (text: string) => /^[^\s]{2,400}$/.test(text.trim()) && /\/|\.[A-Za-z0-9]{1,8}(?::\d+|#L\d+)?$/.test(text.trim())
