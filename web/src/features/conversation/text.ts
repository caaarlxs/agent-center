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
