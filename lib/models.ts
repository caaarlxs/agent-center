// The models a session can use: the newest of each family that the Claude
// Code the desktop app ships knows (Fable 5.2 shows up once the app brings
// it). Read from its binary once per version, a piece at a time, so the
// board never holds the whole file.

import { claudeBinary } from "./launch"

export type Model = { id: string; name: string }

const FAMILIES = ["fable", "opus", "sonnet", "haiku"] // the most capable first
const ID = /claude-(fable|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2}))?(?![\w-])/g

/** The model ids a text names: no dated ones (claude-opus-4-20250514), no longer names. */
export function idsIn(text: string): Set<string> {
  return new Set([...text.matchAll(ID)].map(m => m[0]))
}

const versionOf = (id: string) => {
  const [, , major, minor] = /^claude-(\w+)-(\d+)(?:-(\d+))?$/.exec(id) ?? []
  return [Number(major ?? 0), Number(minor ?? 0)] as const
}
const newer = (a: string, b: string) => {
  const [x, y] = [versionOf(a), versionOf(b)]
  return x[0] !== y[0] ? x[0] > y[0] : x[1] > y[1]
}

/** "claude-fable-5-2" as the app names it: "Fable 5.2". */
export function modelName(id: string): string {
  const m = /^claude-(\w+)-(\d+)(?:-(\d+))?$/.exec(id)
  if (!m) return id
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`
}

/** The newest of each family, the most capable first. */
export function newestModels(ids: Iterable<string>): Model[] {
  const best = new Map<string, string>()
  for (const id of ids) {
    const family = id.split("-")[1]!
    const current = best.get(family)
    if (!current || newer(id, current)) best.set(family, id)
  }
  return FAMILIES.flatMap(f => (best.has(f) ? [{ id: best.get(f)!, name: modelName(best.get(f)!) }] : []))
}

const CHUNK = 8 << 20
const OVERLAP = 64 // an id cut between two pieces is read whole in the next

async function idsInFile(path: string): Promise<Set<string>> {
  const file = Bun.file(path)
  const out = new Set<string>()
  for (let at = 0; at < file.size; at += CHUNK) {
    const text = Buffer.from(await file.slice(Math.max(0, at - OVERLAP), at + CHUNK).arrayBuffer()).toString("latin1")
    for (const id of idsIn(text)) out.add(id)
  }
  return out
}

let known: { path: string; models: Model[] } | null = null

/** The models of the newest Claude Code installed; none when it cannot be read. */
export async function installedModels(): Promise<Model[]> {
  const path = await claudeBinary()
  if (known?.path === path) return known.models
  const models = newestModels(await idsInFile(path).catch(() => new Set<string>()))
  known = { path, models }
  return models
}
