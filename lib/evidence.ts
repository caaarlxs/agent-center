// What a test (or a check in prod) leaves to show each criterion: files in
// the ticket's evidence/ folder (a screenshot, the PDF staging made, a request
// and its response, rows before and after). The board serves them only as
// what they are (pictures, PDFs, data and text, never a page that could run)
// and only from that folder.
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

export type EvidenceFile = { name: string; caption: string | null }

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", json: "application/json; charset=utf-8", csv: "text/csv; charset=utf-8", txt: "text/plain; charset=utf-8", log: "text/plain; charset=utf-8",
}
export const MAX_BYTES = 10 * 1024 * 1024

export function evidenceType(name: string): string | null {
  if (!/^[A-Za-z0-9][\w.-]*$/.test(name) || name.includes("..")) return null
  return TYPES[name.split(".").pop()!.toLowerCase()] ?? null
}

// A criterion's files, as test.json lists them.
export const filesIn = (v: unknown): EvidenceFile[] =>
  (Array.isArray(v) ? v : []).flatMap((f: any) => {
    const name = String(f?.path ?? "").replace(/^evidence\//, "")
    return f && typeof f === "object" && evidenceType(name) ? [{ name, caption: typeof f.caption === "string" && f.caption.trim() ? f.caption.trim() : null }] : []
  })

// The files that are there, and not too big to serve or attach.
export const keptFiles = (dir: string, files: EvidenceFile[]) =>
  files.filter(f => {
    const path = join(dir, "evidence", f.name)
    return existsSync(path) && statSync(path).size <= MAX_BYTES
  })

// What goes to Jira of a test's evidence: a few files a person wants to see without the board
// (the rest stays here), never one Jira already has as it is. The test picks them (`jira` in its
// result); without its pick, the board takes one a criterion, the failing first, a document before
// a picture before data.
export const JIRA_MAX = 6
const RANK = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "json", "csv", "txt", "log"]
const rankOf = (name: string) => RANK.indexOf(name.split(".").pop()!.toLowerCase())
export function forJira(picked: string[], results: { status: string; files?: EvidenceFile[] }[], isSent: (name: string) => boolean, max = JIRA_MAX): string[] {
  const kept = new Set(results.flatMap(r => (r.files ?? []).map(f => f.name)))
  const chosen = picked.map(p => p.replace(/^evidence\//, "")).filter(n => kept.has(n))
  const fallback = [...results].sort((a, b) => Number(b.status === "fail") - Number(a.status === "fail"))
    .flatMap(r => [...(r.files ?? [])].sort((a, b) => rankOf(a.name) - rankOf(b.name)).slice(0, 1).map(f => f.name))
  return [...new Set(chosen.length ? chosen : fallback)].filter(n => !isSent(n)).slice(0, max)
}
