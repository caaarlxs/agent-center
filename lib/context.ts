// The context Claude starts every session with, shown and edited from the board
// ("General context"):
//   - ~/.claude/CLAUDE.md, the instructions for every session in every project;
//   - each project's memory, ~/.claude/projects/<folder>/memory/*.md: what the
//     person asked Claude to remember there (MEMORY.md is its index).
// Only those files are read or written. A save keeps the version before it
// (<file>.before-edit) and refuses when the file changed on disk since it was
// read, so an edit made elsewhere (by a session, say) is never lost.
import { copyFile, readdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { CLAUDE_DIR, HOME, PROJECTS_DIR } from "./config"
import { knownRepos } from "./repo"

export const CONTEXT_PATH = join(CLAUDE_DIR, "CLAUDE.md")
const MAX_BYTES = 512 * 1024

// `version`: the file's modification time, 0 when there is no file yet.
export type ContextFile = { path: string; text: string; version: number }
// One project's memory: its folder (when the board knows it) and its files, MEMORY.md first.
export type MemoryGroup = { dir: string; label: string; folder: string | null; files: { path: string; name: string }[] }
export type ContextList = { global: string; memories: MemoryGroup[] }

// How Claude Code names a folder's project dir: every character that is not a
// letter or a digit becomes "-".
const encode = (folder: string) => folder.replace(/[^A-Za-z0-9]/g, "-")
const SAFE = /^[^/\\]+$/
const isMemoryFile = (path: string) => {
  const name = basename(path)
  const memory = dirname(path)
  const dir = basename(dirname(memory))
  return name.endsWith(".md") && SAFE.test(name) && basename(memory) === "memory" && SAFE.test(dir) && dirname(dirname(memory)) === PROJECTS_DIR
}
export const isContextPath = (path: unknown): path is string => typeof path === "string" && (path === CONTEXT_PATH || isMemoryFile(path))

// The folders the board knows, and the ones above them up to home: the names
// for the project dirs.
async function folderNames() {
  const names = new Map<string, string>()
  const add = (folder: string) => void (folder.startsWith(HOME) && names.set(encode(folder), folder))
  add(HOME)
  for (const { root } of await knownRepos().catch(() => []))
    for (let f = root; f.length > HOME.length && f !== dirname(f); f = dirname(f)) add(f)
  return names
}

export async function listContext(): Promise<ContextList> {
  const names = await folderNames()
  const memories: MemoryGroup[] = []
  for (const dir of await readdir(PROJECTS_DIR).catch(() => [] as string[])) {
    const memory = join(PROJECTS_DIR, dir, "memory")
    const files = (await readdir(memory).catch(() => [] as string[])).filter(n => n.endsWith(".md") && SAFE.test(n))
    if (!files.length) continue
    files.sort((a, b) => Number(b === "MEMORY.md") - Number(a === "MEMORY.md") || a.localeCompare(b))
    const folder = names.get(dir) ?? null
    // A folder the board does not know: what follows the longest one it knows above it.
    const parent = [...names.keys()].filter(k => dir.startsWith(`${k}-`)).sort((x, y) => y.length - x.length)[0]
    const label = folder ? (folder === HOME ? "~" : basename(folder)) : parent ? dir.slice(parent.length + 1) : dir.replace(/^-+/, "")
    memories.push({ dir, label, folder, files: files.map(name => ({ path: join(memory, name), name })) })
  }
  memories.sort((a, b) => Number(b.label === "~") - Number(a.label === "~") || a.label.localeCompare(b.label))
  return { global: CONTEXT_PATH, memories }
}

export async function readContext(path: string = CONTEXT_PATH): Promise<ContextFile> {
  const info = await stat(path).catch(() => null)
  const text = info ? await readFile(path, "utf8") : ""
  return { path, text, version: info?.mtimeMs ?? 0 }
}

// Answers the saved file, or an error message.
export async function writeContext(path: unknown, text: unknown, version: unknown): Promise<ContextFile | string> {
  if (!isContextPath(path)) return "not a context file"
  if (typeof text !== "string") return "no text"
  if (Buffer.byteLength(text) > MAX_BYTES) return "too long"
  const now = await readContext(path)
  if (Number(version) !== now.version) return "changed"
  // A memory file is only edited here, never made: its folder must be there.
  if (path !== CONTEXT_PATH && !now.version) return "not a context file"
  if (now.version) await copyFile(path, `${path}.before-edit`)
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, text.endsWith("\n") || !text ? text : `${text}\n`)
  await rename(temp, path)
  return readContext(path)
}
