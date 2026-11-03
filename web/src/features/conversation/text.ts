// The rules the conversation draws by (conversation.js, util.js md, files.js),
// pure and tested: how a message of yours splits into typed and pasted parts
// and when it folds, which reply is a template, how the app's own answers read,
// which code and links name a file, a file's type family, a command's end.

const PASTE_RE = /<pasted[_-]?content\b[^>]*>([\s\S]*?)(?:<\/pasted[_-]?content>|$)/gi
export const LONG_TYPED = 700 // more typed text than this folds to 12 lines

export type Part = { typed: string } | { pasted: string }
export function partsOf(text: string): { parts: Part[]; isLong: boolean } {
  const parts: Part[] = []
  let last = 0
  for (const m of text.matchAll(PASTE_RE)) {
    if (m.index > last) parts.push({ typed: text.slice(last, m.index) })
    parts.push({ pasted: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ typed: text.slice(last) })
  const typed = parts.map(p => ("typed" in p ? p.typed : "")).join("")
  return { parts, isLong: typed.length > LONG_TYPED }
}
export const linesText = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`

// A reply that ends asking for more ("…is: ", "…", "...") is a template: it
// goes to the reply box to be completed, never sent as it is.
export const isTemplate = (text: string) => /[:…]\s*$|\.\.\.\s*$/.test(text)

// The app's own answers, in the person's words where the shape is known.
export function dialogAnswer(text: string): string {
  const branch = text.match(/new branch named ([^\s.]+)/i)
  if (branch) return `New branch: ${branch[1]}`
  if (/stay|current branch/i.test(text) && /branch/i.test(text)) return "Stay on the current branch"
  return text
}

// Inline code that is a path (`/Users/…/report.md`, `~/x.py`) opens the file
// in the Files tab; so does a link to a file of the session's folder.
const PATH_CODE = /^(?:~|\/)[^\n]{1,300}\.[A-Za-z0-9]{1,8}$/
export const pathInCode = (code: string) => (PATH_CODE.test(code.trim()) ? code.trim() : null)
export function pathInLink(href: string | undefined): string | null {
  if (!href || /^([a-z][a-z0-9+.-]*:|#)/i.test(href)) return null
  let path = href
  try {
    path = decodeURI(href)
  } catch {}
  return path.replace(/:\d+(:\d+)?$/, "")
}

export const nameOf = (path: string) => path.split("/").pop() || path
export const extOf = (path: string) => (nameOf(path).match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "").toLowerCase()

// A file type's colour family, for its label: sheets green, documents blue…
export type Family = "sheet" | "doc" | "slides" | "pdf" | "media" | "code"
const FAMILY: [RegExp, Family][] = [
  [/^(xlsx|xlsm|xls|csv|tsv|numbers)$/, "sheet"],
  [/^(docx|doc|rtf|rtfd|odt|pages|md|markdown|txt)$/, "doc"],
  [/^(pptx|ppt|key)$/, "slides"],
  [/^pdf$/, "pdf"],
  [/^(png|jpe?g|gif|webp|avif|bmp|ico|svg|mp4|mov|webm|mp3|wav)$/, "media"],
]
export const familyOf = (ext: string): Family => FAMILY.find(([re]) => re.test(ext))?.[1] ?? "code"

// How a command run from a shell block ended.
export type Ran = { isRunning: boolean; startedAt: number; endedAt: number | null; exitCode: number | null; wasStopped: boolean }
export function endOf(c: Ran): { isOk: boolean; text: string } | null {
  if (c.isRunning) return null
  const took = Math.max(1, Math.round(((c.endedAt ?? c.startedAt) - c.startedAt) / 1000))
  if (c.wasStopped) return { isOk: false, text: `Stopped after ${took} s` }
  return c.exitCode === 0 ? { isOk: true, text: `Done in ${took} s` } : { isOk: false, text: `Ended with code ${c.exitCode} in ${took} s` }
}
export const SHELL_LANG = /\blanguage-(bash|sh|shell|zsh)\b/

// A block with no language whose every line is a command (after any
// `NAME=value`), as Claude often writes them: a path list, code or output is not.
const COMMANDS = new Set(("cd ls pwd git gh aws gcloud az bun bunx npm npx pnpm yarn node deno python python3 pip pip3 uv uvx poetry pytest " +
  "make cargo go docker kubectl helm terraform sls serverless curl wget cat tail head less grep rg find fd mkdir rm cp mv ln touch chmod " +
  "echo printf export source open brew claude sed awk jq yq tee ssh scp rsync psql mysql redis-cli sqlite3 launchctl kill pkill ps lsof " +
  "xargs tar zip unzip env sudo time watch diff wc sort uniq ruby rails bundle java mvn gradle swift xcodebuild crapper dryer mutator").split(" "))
const ENV = /^(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)*/
const RUNNABLE = /^(?:\.{1,2}\/|\.venv\/bin\/|venv\/bin\/|node_modules\/\.bin\/|bin\/|\S*\/bin\/)/
const isCommandLine = (line: string) => {
  const first = line.replace(ENV, "").split(/\s/)[0] ?? ""
  return COMMANDS.has(first) || RUNNABLE.test(first)
}
export function isShellLike(text: string): boolean {
  const lines = text.replace(/\\\n/g, " ").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
  return lines.length > 0 && lines.every(isCommandLine)
}

// What makes a command touch something real (prod, a write, a delete):
// Run asks before it runs one of these.
const RISKS = [
  /(?<![\w.])prod(?:uction)?(?!\w)/i,
  /--execute\b|\bEXECUTE=(?:true|1)\b/,
  /\b(?:put|update|delete|batch-write)-item\b/,
  /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*/,
  /--force\b|\bpush\s+-f\b/,
  /\b(?:delete|destroy|drop\s+table|truncate)\b/i,
]
export function riskOf(command: string): string | null {
  for (const re of RISKS) {
    const m = command.match(re)
    if (m) return m[0]
  }
  return null
}
