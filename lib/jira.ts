// Jira: the tickets your sessions work on, read live from your Jira Cloud site.
// A session is linked to a ticket when it was started from it, when you link
// it by hand, when its branch or title names it ("fix/PP-3130-…"), or when you
// name it in a message of your own (not Claude: a daily brief lists many); the
// board reads their summary and status for its cards (all at once, every two
// minutes) and a ticket's whole detail when you open it. Your own open tickets
// are a search away (yours, the ones you reported, the open sprint, or by
// text), with their status, type, priority and sprint; and on a ticket
// assigned to you, the board moves its status or adds a comment, never on
// anyone else's. You set it up in Settings › Jira: the site, your email
// and an API token (kept in the macOS keychain, never in a file), and the
// keys of the projects to look for, so a word like "UTF-8" is never a ticket.

import type { TreeTicket } from "./scope"
import { adfOf } from "./adf"
import { stat } from "node:fs/promises"
import { settings } from "./config"
import { readAppended } from "./files"
import { exec } from "./proc"
import { saveSettings } from "./setup"
import { transcriptPath } from "./transcript"

export type JiraSetup = { site: string; email: string; projects: string[] }
// What kind of work a ticket is, whatever the site calls its types.
export type TicketKind = "epic" | "story" | "task" | "subtask" | "bug"
export type TicketBrief = { key: string; summary: string; status: string; tone: "todo" | "doing" | "done"; kind: TicketKind; assignee: string | null; url: string }
// Why a session is linked to a ticket: started from it, linked by hand, its branch or title, your words.
export type LinkWhy = "started" | "linked" | "branch" | "named"
export type SessionTicket = TicketBrief & { why: LinkWhy }
// Another ticket named from this one: its parent, a child, a link.
export type TicketRef = { key: string; summary: string; type: string | null; kind: TicketKind; status: string; tone: TicketBrief["tone"]; url: string; isMine?: boolean /* known for what sits in a ticket */ }
// A ticket in a list: what a card needs, and its type, priority, sprint and
// last change; what it sits in (its parent) and the epic above it.
export type TicketRow = TicketBrief & {
  statusId: string; type: string | null; priority: string | null; sprint: string | null; updated: number
  parent: TicketRef | null; epic: TicketRef | null
  isMine: boolean // assigned to you: the board may move it
}
// A column of the team's board: its name and the statuses it holds.
export type BoardColumn = { name: string; statusIds: string[] }
export type Transition = { id: string; name: string; to: string; toId: string; tone: TicketBrief["tone"] }
export type TicketFilter = "mine" | "reported" | "sprint" | "all"
export type TicketComment = { author: string; at: number; body: string }
export type TicketLink = { how: string; ticket: TicketRef }
export type Ticket = TicketBrief & {
  isMine: boolean // assigned to you: the board may move it and comment
  type: string | null
  priority: string | null
  reporter: string | null
  reporterId: string | null // to mention them
  sprint: string | null
  created: number
  updated: number
  parent: TicketRef | null
  children: TicketRef[]
  links: TicketLink[]
  description: string
  comments: TicketComment[]
}

const KEYCHAIN = "agent-center.jira"
const BRIEF_FIELDS = ["summary", "status", "assignee", "issuetype"]
const BRIEF_TTL_MS = 120_000

// ---------- what is a ticket ----------

// The ticket keys in some texts, of the projects named only, in order, once.
export function keysIn(texts: (string | null | undefined)[], projects: string[]): string[] {
  if (!projects.length) return []
  const wanted = new Set(projects.map(p => p.toUpperCase()))
  const out: string[] = []
  for (const text of texts)
    for (const m of (text ?? "").matchAll(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,6})(?![0-9])/g)) {
      const key = `${m[1]!.toUpperCase()}-${m[2]}`
      if (wanted.has(m[1]!.toUpperCase()) && !out.includes(key)) out.push(key)
    }
  return out
}

// The tickets a session works on, and why: those it was started from or you
// linked, those its branch or title names, then those you named in your own
// messages more than in passing (mentionCounts), the most named first (three
// of these at most); none you unlinked.
export function sessionKeys(
  links: { started?: string[]; linked?: string[]; off?: string[] },
  named: string[], mentions: Map<string, number>, projects: string[],
): { key: string; why: LinkWhy }[] {
  const wanted = new Set(projects.map(p => p.toUpperCase()))
  const off = new Set(links.off ?? [])
  const out = new Map<string, LinkWhy>()
  const add = (keys: string[], why: LinkWhy) => { for (const k of keys) if (!off.has(k) && !out.has(k)) out.set(k, why) }
  add(links.started ?? [], "started")
  add(links.linked ?? [], "linked")
  add(named, "branch")
  const hand = out.size
  add([...mentions].filter(([k, n]) => n >= 2 && wanted.has(k.split("-")[0]!)).sort((a, b) => b[1] - a[1]).map(([k]) => k), "named")
  return [...out].slice(0, Math.max(hand, 3)).map(([key, why]) => ({ key, why }))
}

// What you wrote yourself in a transcript line: a message of yours, not
// Claude's answers, what tools gave back, injected context or the summary
// left when the conversation was compacted. Null for any other line.
function userText(line: string): string | null {
  let d: any
  try {
    d = JSON.parse(line)
  } catch {
    return null
  }
  if (d?.isMeta || d?.isCompactSummary || d?.type !== "user") return null
  const content = d?.message?.content
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : ""
  if (!text.trim() || /^\s*<(command-|local-command|system-reminder|task-notification)/.test(text)) return null
  return text
}

// The ticket keys a transcript line names in your own words (a git log or a
// daily brief names many tickets nobody works on). A message naming more than
// three is a list, not work on them.
export function userKeys(line: string): string[] {
  const text = userText(line)
  if (text === null) return []
  const keys = [...new Set([...text.matchAll(KEY)].map(m => m[1]!))]
  return keys.length > 3 ? [] : keys
}
const KEY = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,9}-\d{1,6})(?![0-9])/g

// In how many of your messages each ticket key shows. Your first message
// weighs as two: it says what the session is for. A ticket needs two to be
// linked (sessionKeys), so one named once in passing later stays out.
type Scan = { counts: Map<string, number>; hasFirst: boolean }
export function mentionCounts(lines: string[], scan: Scan = { counts: new Map(), hasFirst: false }) {
  for (const line of lines) {
    if (scan.hasFirst && !/[A-Z]-\d/.test(line)) continue
    if (userText(line) === null) continue
    const weight = scan.hasFirst ? 1 : 2
    scan.hasFirst = true
    for (const k of userKeys(line)) scan.counts.set(k, (scan.counts.get(k) ?? 0) + weight)
  }
  return scan.counts
}

// Read once, then only what the transcript adds.
const mentionScans = new Map<string, Scan & { offset: number }>()
export async function mentionsIn(ids: string[]): Promise<Map<string, number>> {
  const total = new Map<string, number>()
  for (const id of ids) {
    const path = await transcriptPath(id)
    if (!path) continue
    const { size } = await stat(path).catch(() => ({ size: 0 }))
    let scan = mentionScans.get(id)
    if (!scan || size < scan.offset) mentionScans.set(id, (scan = { offset: 0, counts: new Map(), hasFirst: false }))
    const s = scan
    s.offset = await readAppended(path, s.offset, size, text => void mentionCounts(text.split("\n"), s))
    for (const [k, n] of s.counts) total.set(k, (total.get(k) ?? 0) + n)
  }
  return total
}

// A site as the board keeps it: https and no trailing slash ("deale.atlassian.net" works too).
export function siteOf(raw: string): string | null {
  const text = raw.trim().replace(/\/+$/, "")
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`)
    return url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

// ---------- Jira's own document format (ADF) as Markdown ----------

type Node = { type?: string; text?: string; content?: Node[]; attrs?: Record<string, any>; marks?: { type: string; attrs?: Record<string, any> }[] }

function inline(nodes: Node[] = []): string {
  return nodes.map(n => {
    if (n.type === "text") {
      let t = n.text ?? ""
      for (const m of n.marks ?? []) {
        if (m.type === "strong") t = `**${t}**`
        else if (m.type === "em") t = `*${t}*`
        else if (m.type === "code") t = `\`${t}\``
        else if (m.type === "strike") t = `~~${t}~~`
        else if (m.type === "link" && m.attrs?.href) t = `[${t}](${m.attrs.href})`
      }
      return t
    }
    if (n.type === "hardBreak") return "\n"
    if (n.type === "mention") return n.attrs?.text ?? "@someone"
    if (n.type === "emoji") return n.attrs?.text ?? n.attrs?.shortName ?? ""
    if (n.type === "inlineCard") return n.attrs?.url ?? ""
    return inline(n.content)
  }).join("")
}

function block(n: Node, depth = 0): string {
  const pad = "  ".repeat(depth)
  switch (n.type) {
    case "paragraph": return inline(n.content)
    case "heading": return `${"#".repeat(Math.min(6, n.attrs?.level ?? 2))} ${inline(n.content)}`
    case "codeBlock": return "```" + (n.attrs?.language ?? "") + "\n" + inline(n.content) + "\n```"
    case "blockquote": return (n.content ?? []).map(c => block(c, depth)).join("\n\n").split("\n").map(l => `> ${l}`).join("\n")
    case "rule": return "---"
    case "bulletList":
    case "orderedList":
      return (n.content ?? []).map((item, i) => {
        const [first, ...rest] = item.content ?? []
        const mark = n.type === "orderedList" ? `${i + 1}.` : "-"
        const head = `${pad}${mark} ${first ? block(first, depth + 1) : ""}`
        return [head, ...rest.map(c => block(c, depth + 1))].join("\n")
      }).join("\n")
    case "mediaSingle":
    case "mediaGroup": return "_(attachment)_"
    case "table":
      return (n.content ?? []).map(row => `| ${(row.content ?? []).map(cell => (cell.content ?? []).map(c => block(c)).join(" ")).join(" | ")} |`).join("\n")
    default: return n.content ? (n.content ?? []).map(c => block(c, depth)).join("\n\n") : inline([n])
  }
}

export const markdownOf = (doc: unknown): string => {
  if (!doc || typeof doc !== "object") return typeof doc === "string" ? doc : ""
  return ((doc as Node).content ?? []).map(n => block(n)).filter(Boolean).join("\n\n").trim()
}

// ---------- what Jira answers ----------

const TONE: Record<string, TicketBrief["tone"]> = { new: "todo", indeterminate: "doing", done: "done" }

// The kind of a ticket's type: by its place in the hierarchy (epics above,
// sub-tasks below), then by its name, in English or Spanish.
export function kindOf(type: any): TicketKind {
  const name = String(type?.name ?? "").toLowerCase()
  if (type?.hierarchyLevel >= 1 || /epic|épica/.test(name)) return "epic"
  if (type?.subtask === true || type?.hierarchyLevel < 0 || /sub/.test(name)) return "subtask"
  if (/bug|error|incidencia|fallo/.test(name)) return "bug"
  if (/story|historia/.test(name)) return "story"
  return "task"
}

export function briefOf(raw: any, site: string): TicketBrief {
  const f = raw?.fields ?? {}
  return {
    key: String(raw?.key ?? ""),
    summary: String(f.summary ?? ""),
    status: String(f.status?.name ?? ""),
    tone: TONE[f.status?.statusCategory?.key] ?? "todo",
    kind: kindOf(f.issuetype),
    assignee: f.assignee?.displayName ?? null,
    url: `${site}/browse/${raw?.key}`,
  }
}

// Another ticket as Jira names it inside this one (its parent, a sub-task, a link).
export function refOf(raw: any, site: string): TicketRef | null {
  if (!raw?.key) return null
  const f = raw.fields ?? {}
  return {
    key: String(raw.key), summary: String(f.summary ?? ""), type: f.issuetype?.name ?? null, kind: kindOf(f.issuetype),
    status: String(f.status?.name ?? ""), tone: TONE[f.status?.statusCategory?.key] ?? "todo", url: `${site}/browse/${raw.key}`,
  }
}

// The open sprint's name, from Jira's sprint field (its id varies per site).
const sprintOf = (value: unknown): string | null => {
  const list = Array.isArray(value) ? value : []
  const open = list.find((s: any) => s?.state === "active") ?? list.at(-1)
  return open?.name ?? null
}

// A ticket in a list. Its epic: its parent when that is one, else its
// parent's parent when the search knows it (`epics`: parent key to epic).
export function rowOf(raw: any, site: string, sprintField: string | null, epics: Map<string, TicketRef> = new Map(), me: string | null = null): TicketRow {
  const f = raw?.fields ?? {}
  const parent = refOf(f.parent, site)
  const kind = kindOf(f.issuetype)
  return {
    ...briefOf(raw, site),
    statusId: String(f.status?.id ?? ""),
    type: f.issuetype?.name ?? null,
    priority: f.priority?.name ?? null,
    sprint: sprintField ? sprintOf(f[sprintField]) : null,
    updated: Date.parse(f.updated ?? "") || 0,
    parent,
    epic: kind === "epic" ? null : parent?.kind === "epic" ? parent : parent ? (epics.get(parent.key) ?? null) : null,
    isMine: !!me && f.assignee?.accountId === me,
  }
}

// What a search asks for: your open tickets, those you reported, the open
// sprint's, or all the project's; and some words. A key is that ticket, whatever the filter.
const WHO: Record<TicketFilter, string | null> = { mine: "assignee = currentUser() AND statusCategory != Done", reported: "reporter = currentUser()", sprint: "sprint in openSprints()", all: null }
export function jqlOf(filter: TicketFilter, projects: string[], text = ""): string {
  const scope = `project in (${projects.join(",")})`
  const words = text.trim().replace(/["\\]/g, " ").trim()
  const key = /^[A-Z][A-Z0-9]+-\d+$/i.test(words) ? words.toUpperCase() : null
  const parts = key ? [scope, `key = ${key}`] : [scope, WHO[filter], words ? `text ~ "${words}"` : null]
  return parts.filter(Boolean).join(" AND ") + " ORDER BY updated DESC"
}

// The columns of the team's board: of the boards given, the one whose
// columns hold most of the statuses seen; none when no board holds any.
export function pickColumns(boards: BoardColumn[][], seen: string[]): BoardColumn[] {
  let best: BoardColumn[] = []
  let most = 0
  for (const columns of boards) {
    const held = seen.filter(id => columns.some(c => c.statusIds.includes(id))).length
    if (held > most) (best = columns), (most = held)
  }
  return best
}

// A comment as Jira's document: a paragraph per line.
export const docOf = (text: string) => ({
  type: "doc",
  version: 1,
  content: text.split("\n").map(line => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph", content: [] })),
})

// Its links as Jira words them from this side ("blocks", "is blocked by").
const linksOf = (list: any[] = [], site: string): TicketLink[] =>
  list.flatMap(l => {
    const ticket = refOf(l.outwardIssue ?? l.inwardIssue, site)
    return ticket ? [{ how: String((l.outwardIssue ? l.type?.outward : l.type?.inward) ?? "relates to"), ticket }] : []
  })

export function ticketOf(raw: any, site: string, me: string | null = null, sprintField: string | null = null, children: TicketRef[] = []): Ticket {
  const f = raw?.fields ?? {}
  const subtasks = (f.subtasks ?? []).map((t: any) => refOf(t, site)).filter(Boolean) as TicketRef[]
  return {
    ...briefOf(raw, site),
    isMine: !!me && f.assignee?.accountId === me,
    type: f.issuetype?.name ?? null,
    priority: f.priority?.name ?? null,
    reporter: f.reporter?.displayName ?? null,
    reporterId: f.reporter?.accountId ?? null,
    sprint: sprintField ? sprintOf(f[sprintField]) : null,
    created: Date.parse(f.created ?? "") || 0,
    updated: Date.parse(f.updated ?? "") || 0,
    parent: refOf(f.parent, site),
    children: [...subtasks, ...children.filter(c => !subtasks.some(t => t.key === c.key))],
    links: linksOf(f.issuelinks, site),
    description: markdownOf(f.description),
    comments: (f.comment?.comments ?? []).map((c: any) => ({ author: c.author?.displayName ?? "Someone", at: Date.parse(c.created ?? "") || 0, body: markdownOf(c.body) })),
  }
}

// ---------- the connection ----------

export const jiraSetup = (): JiraSetup | null => (settings.jira?.site && settings.jira.email ? settings.jira : null)

async function tokenOf(email: string): Promise<string | null> {
  const { code, stdout } = await exec(["security", "find-generic-password", "-s", KEYCHAIN, "-a", email, "-w"])
  return code === 0 ? stdout.trim() : null
}

// One request to Jira, signed with your token; an error in words when it fails.
async function request(setup: JiraSetup, path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const secret = token ?? (await tokenOf(setup.email))
  if (!secret) throw new Error("No Jira token in the keychain: set Jira up again in Settings")
  const res = await fetch(`${setup.site}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), Authorization: `Basic ${Buffer.from(`${setup.email}:${secret}`).toString("base64")}`, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401 || res.status === 403) throw new Error("Jira did not accept the email and token")
  if (!res.ok) throw new Error(`Jira answered ${res.status}`)
  return res
}
const call = async (setup: JiraSetup, path: string, init: RequestInit = {}, token?: string): Promise<any> => (await request(setup, path, init, token)).json()

// Checks the details with Jira, then keeps them: the token in the keychain, the rest in the settings.
export async function connect(input: { site?: unknown; email?: unknown; token?: unknown; projects?: unknown }) {
  const site = siteOf(String(input.site ?? ""))
  const email = String(input.email ?? "").trim()
  const token = String(input.token ?? "").trim()
  const projects = String(input.projects ?? "").split(/[\s,]+/).map(p => p.toUpperCase()).filter(p => /^[A-Z][A-Z0-9]{1,9}$/.test(p))
  if (!site) throw new Error("The site should look like yourcompany.atlassian.net")
  if (!email.includes("@")) throw new Error("The email should be the one you sign in to Jira with")
  if (!projects.length) throw new Error("Name at least one project key, such as PP")
  const setup = { site, email, projects }
  const known = token || (await tokenOf(email))
  if (!known) throw new Error("Paste an API token from id.atlassian.com")
  const me = await call(setup, "/rest/api/3/myself", {}, known)
  if (token) {
    // Through stdin, so the token never shows in the list of running commands.
    const quote = (s: string) => `"${s.replace(/(["\\])/g, "\\$1")}"`
    const { code } = await exec(["security", "-i"], { input: `add-generic-password -U -s ${quote(KEYCHAIN)} -a ${quote(email)} -w ${quote(token)}\n` })
    if (code !== 0) throw new Error("Could not keep the token in the keychain")
  }
  await saveSettings({ jira: setup })
  briefs.clear()
  return { ...setup, name: String(me?.displayName ?? email) }
}

export async function disconnect() {
  const setup = jiraSetup()
  if (setup) await exec(["security", "delete-generic-password", "-s", KEYCHAIN, "-a", setup.email])
  await saveSettings({ jira: undefined })
  briefs.clear()
}

// ---------- the cards' tickets: cached, refreshed behind ----------

const briefs = new Map<string, { brief: TicketBrief | null; at: number }>()
let fetching = false

// What the cache holds for these keys now; the ones it lacks or that are old
// are asked for in one search, behind.
export function briefsFor(keys: string[]): TicketBrief[] {
  const setup = jiraSetup()
  if (!setup || !keys.length) return []
  const stale = keys.filter(k => Date.now() - (briefs.get(k)?.at ?? 0) > BRIEF_TTL_MS)
  if (stale.length && !fetching) {
    fetching = true
    const jql = `key in (${stale.slice(0, 100).join(",")})`
    void call(setup, "/rest/api/3/search/jql", { method: "POST", body: JSON.stringify({ jql, fields: BRIEF_FIELDS, maxResults: 100 }) })
      .then(r => {
        const found = new Map<string, TicketBrief>((r?.issues ?? []).map((i: any) => [i.key, briefOf(i, setup.site)]))
        for (const k of stale) briefs.set(k, { brief: found.get(k) ?? null, at: Date.now() })
      })
      .catch(() => { for (const k of stale) briefs.set(k, { brief: briefs.get(k)?.brief ?? null, at: Date.now() }) })
      .finally(() => (fetching = false))
  }
  return keys.map(k => briefs.get(k)?.brief).filter((b): b is TicketBrief => !!b)
}

// A session's tickets with why they are its own, as the cache has them.
export function sessionTickets(links: { key: string; why: LinkWhy }[]): SessionTicket[] {
  const found = new Map(briefsFor(links.map(l => l.key)).map(b => [b.key, b]))
  return links.flatMap(l => (found.has(l.key) ? [{ ...found.get(l.key)!, why: l.why }] : []))
}

// ---------- one ticket, and yours ----------

// Who you are on the site, and its sprint field: asked once.
let me: { site: string; id: string } | null = null
async function myId(setup: JiraSetup) {
  if (me?.site === setup.site) return me.id
  const r = await call(setup, "/rest/api/3/myself")
  me = { site: setup.site, id: String(r?.accountId ?? "") }
  return me.id
}
let sprintField: { site: string; id: string | null } | null = null
async function sprintFieldOf(setup: JiraSetup) {
  if (sprintField?.site === setup.site) return sprintField.id
  const fields = await call(setup, "/rest/api/3/field").catch(() => [])
  const found = (fields as any[]).find(f => f?.schema?.custom === "com.pyxis.greenhopper.jira:gh-sprint")
  sprintField = { site: setup.site, id: found?.id ?? null }
  return sprintField.id
}

const setupOrThrow = () => {
  const setup = jiraSetup()
  if (!setup) throw new Error("Jira is not set up")
  return setup
}
const keyOrThrow = (key: string) => {
  if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(key)) throw new Error("Not a ticket key")
  return key
}

const REF_FIELDS = ["summary", "status", "issuetype", "assignee"]
const search = (setup: JiraSetup, jql: string, fields: string[], maxResults = 100) =>
  call(setup, "/rest/api/3/search/jql", { method: "POST", body: JSON.stringify({ jql, fields, maxResults }) }).then(r => (r?.issues ?? []) as any[])

// Everything under a ticket, at any depth (an epic's stories, their sub-tasks), level by
// level: each with its kind, its parent, and whether it is yours.
const DEPTH = 3
const MAX_TREE = 150
const treeTicketOf = (raw: any, me: string | null): TreeTicket => {
  const f = raw?.fields ?? {}
  return { key: String(raw.key), kind: kindOf(f.issuetype), parent: f.parent?.key ? String(f.parent.key) : null, summary: String(f.summary ?? ""), isMine: !!me && f.assignee?.accountId === me }
}
export async function descendantsOf(key: string): Promise<TreeTicket[]> {
  const setup = setupOrThrow()
  const me = await myId(setup)
  const out: TreeTicket[] = []
  for (let level = [keyOrThrow(key)], depth = 0; level.length && depth < DEPTH && out.length < MAX_TREE; depth++) {
    const found = await search(setup, `parent in (${level.join(",")}) ORDER BY rank`, [...REF_FIELDS, "parent"], 100)
    const next = found.map(i => treeTicketOf(i, me))
    out.push(...next.filter(n => !out.some(o => o.key === n.key)))
    level = next.filter(n => n.kind !== "subtask").map(n => n.key)
  }
  return out.slice(0, MAX_TREE)
}

// A ticket whole: and what sits in it (its sub-tasks, or an epic's tickets).
export async function ticket(key: string): Promise<Ticket> {
  const setup = setupOrThrow()
  const sprint = await sprintFieldOf(setup)
  const fields = ["summary", "status", "assignee", "reporter", "priority", "issuetype", "created", "updated", "description", "comment", "parent", "subtasks", "issuelinks", ...(sprint ? [sprint] : [])]
  const [raw, inside] = await Promise.all([
    call(setup, `/rest/api/3/issue/${keyOrThrow(key)}?fields=${fields.join(",")}`),
    search(setup, `parent = ${key} ORDER BY status, rank`, REF_FIELDS, 50).catch(() => []),
  ])
  const me = await myId(setup)
  const refs = inside.flatMap(i => {
    const ref = refOf(i, setup.site)
    return ref ? [{ ...ref, isMine: !!me && i.fields?.assignee?.accountId === me }] : []
  })
  return ticketOf(raw, setup.site, me, sprint, refs)
}

// The columns of each board of your projects, left to right: asked every ten minutes.
let boardColumns: { site: string; at: number; boards: BoardColumn[][] } | null = null
async function boardColumnsOf(setup: JiraSetup) {
  if (boardColumns?.site === setup.site && Date.now() - boardColumns.at < 600_000) return boardColumns.boards
  const out: BoardColumn[][] = []
  for (const project of setup.projects) {
    const boards = await call(setup, `/rest/agile/1.0/board?projectKeyOrId=${project}&maxResults=10`).catch(() => null)
    for (const b of boards?.values ?? []) {
      const config = await call(setup, `/rest/agile/1.0/board/${b.id}/configuration`).catch(() => null)
      // A column with no status (a kanban board's own backlog) holds no ticket.
      const columns: BoardColumn[] = (config?.columnConfig?.columns ?? []).map((c: any) => ({ name: String(c.name ?? ""), statusIds: (c.statuses ?? []).map((s: any) => String(s.id)) }))
      out.push(columns.filter(c => c.statusIds.length))
    }
  }
  boardColumns = { site: setup.site, at: Date.now(), boards: out }
  return out
}

// The epics above the tickets whose parent is not one (a sub-task's story's epic): one search more.
async function epicsAbove(setup: JiraSetup, issues: any[]): Promise<Map<string, TicketRef>> {
  const parents = [...new Set(issues.map(i => i.fields?.parent).filter(p => p?.key && kindOf(p.fields?.issuetype) !== "epic").map(p => String(p.key)))]
  if (!parents.length) return new Map()
  const found = await search(setup, `key in (${parents.slice(0, 100).join(",")})`, ["parent"]).catch(() => [])
  const out = new Map<string, TicketRef>()
  for (const p of found) {
    const epic = refOf(p.fields?.parent, setup.site)
    if (epic?.kind === "epic") out.set(String(p.key), epic)
  }
  return out
}

// Some tickets as rows, with what each sits in (its parent, the epic above):
// a session's tickets, drawn as a tree. Kept a minute per set of keys.
const rowsKept = new Map<string, { at: number; rows: Promise<TicketRow[]> }>()
export function ticketRows(keys: string[]): Promise<TicketRow[]> {
  const setup = setupOrThrow()
  const wanted = [...new Set(keys)].filter(k => /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(k)).slice(0, 50)
  if (!wanted.length) return Promise.resolve([])
  const id = wanted.slice().sort().join(",")
  const had = rowsKept.get(id)
  if (had && Date.now() - had.at < 60_000) return had.rows
  const rows = (async () => {
    const issues = await search(setup, `key in (${wanted.join(",")})`, [...BRIEF_FIELDS, "parent"])
    const epics = await epicsAbove(setup, issues)
    return issues.map(i => rowOf(i, setup.site, null, epics))
  })()
  rowsKept.set(id, { at: Date.now(), rows })
  rows.catch(() => rowsKept.delete(id))
  return rows
}

export async function searchTickets(filter: TicketFilter, text = ""): Promise<{ tickets: TicketRow[]; columns: BoardColumn[] }> {
  const setup = setupOrThrow()
  const sprint = await sprintFieldOf(setup)
  const fields = [...BRIEF_FIELDS, "priority", "updated", "parent", ...(sprint ? [sprint] : [])]
  const issues = await search(setup, jqlOf(filter, setup.projects, text), fields)
  const epics = await epicsAbove(setup, issues)
  const me = await myId(setup)
  const tickets: TicketRow[] = issues.map(i => rowOf(i, setup.site, sprint, epics, me))
  const columns = pickColumns(await boardColumnsOf(setup), [...new Set(tickets.map(t => t.statusId))])
  return { tickets, columns }
}

// ---------- what you may do on yours ----------

// A ticket assigned to you, else an error: the board writes on nobody else's.
async function mineOrThrow(setup: JiraSetup, key: string) {
  const raw = await call(setup, `/rest/api/3/issue/${keyOrThrow(key)}?fields=assignee`)
  if (raw?.fields?.assignee?.accountId !== (await myId(setup))) throw new Error(`${key} is not assigned to you`)
}

export async function transitionsOf(key: string): Promise<Transition[]> {
  const setup = setupOrThrow()
  const r = await call(setup, `/rest/api/3/issue/${keyOrThrow(key)}/transitions`)
  return (r?.transitions ?? []).map((t: any) => ({ id: String(t.id), name: String(t.name), to: String(t.to?.name ?? t.name), toId: String(t.to?.id ?? ""), tone: TONE[t.to?.statusCategory?.key] ?? "todo" }))
}

export async function moveTicket(key: string, transitionId: string) {
  const setup = setupOrThrow()
  await mineOrThrow(setup, key)
  if (!(await transitionsOf(key)).some(t => t.id === transitionId)) throw new Error("That move is not open for this ticket now")
  await request(setup, `/rest/api/3/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: transitionId } }) }) // no body back (204)
  briefs.delete(key)
}

// A comment that opens with a mention of each person (Jira tells them).
export const docWith = (text: string, mentions: string[]) => {
  const doc = docOf(text)
  if (!mentions.length) return doc
  const tags = mentions.flatMap(id => [{ type: "mention", attrs: { id } }, { type: "text", text: " " }])
  return { ...doc, content: [{ type: "paragraph", content: tags }, ...doc.content] }
}

// A comment on a ticket of yours; it can mention people (never you).
export async function commentOn(key: string, text: string, mentions: string[] = []) {
  const setup = setupOrThrow()
  const body = text.trim()
  if (!body) throw new Error("Write something first")
  await mineOrThrow(setup, key)
  const me = await myId(setup)
  const others = [...new Set(mentions)].filter(id => id && id !== me)
  await call(setup, `/rest/api/3/issue/${key}/comment`, { method: "POST", body: JSON.stringify({ body: docWith(body.slice(0, 10_000), others) }) })
}

// The ticket, now yours: only when you ask for it (to run the pipeline on it).
export async function assignToMe(key: string) {
  const setup = setupOrThrow()
  await request(setup, `/rest/api/3/issue/${keyOrThrow(key)}/assignee`, { method: "PUT", body: JSON.stringify({ accountId: await myId(setup) }) }) // no body back (204)
  briefs.delete(key)
}

// Labels added and removed on a ticket of yours (the pipeline's).
export async function labelTicket(key: string, add: string[], remove: string[]) {
  const setup = setupOrThrow()
  await mineOrThrow(setup, key)
  const labels = [...add.map(l => ({ add: l })), ...remove.map(l => ({ remove: l }))]
  if (labels.length) await request(setup, `/rest/api/3/issue/${key}`, { method: "PUT", body: JSON.stringify({ update: { labels } }) }) // no body back (204)
  briefs.delete(key)
}

// ---------- the pipeline's status moves (lib/jira-flow.ts) ----------

// A ticket's status and whether it is yours: what a move needs to know first.
export async function issueState(key: string): Promise<{ status: string; mine: boolean } | null> {
  const setup = setupOrThrow()
  const raw = await call(setup, `/rest/api/3/issue/${keyOrThrow(key)}?fields=status,assignee`).catch(() => null)
  if (!raw?.fields) return null
  return { status: String(raw.fields.status?.id ?? ""), mine: raw.fields.assignee?.accountId === (await myId(setup)) }
}

// The statuses a ticket's workflow lets it move to now.
export const openStatuses = async (key: string) => (await transitionsOf(key)).map(t => t.toId)

// A ticket of yours to a status, by the move that leads there now.
export async function moveToStatus(key: string, statusId: string) {
  const move = (await transitionsOf(key)).find(t => t.toId === statusId)
  if (!move) throw new Error("That move is not open for this ticket now")
  await moveTicket(key, move.id)
}

// A sub-task under a ticket of yours, assigned to you: its key.
// A description is Markdown (adf.ts); a priority, Jira's name for it.
export async function createSubtask(parent: string, summary: string, typeId: string, description?: string, priority?: string | null): Promise<string> {
  const setup = setupOrThrow()
  await mineOrThrow(setup, parent)
  const fields = { project: { key: parent.split("-")[0] }, parent: { key: parent }, summary: summary.slice(0, 250), issuetype: { id: typeId }, assignee: { accountId: await myId(setup) },
    ...(description ? { description: adfOf(description.slice(0, 30_000)) } : {}), ...(priority ? { priority: { name: priority } } : {}) }
  const r = await call(setup, "/rest/api/3/issue", { method: "POST", body: JSON.stringify({ fields }) })
  briefs.delete(parent)
  return String(r?.key ?? "")
}

// ---------- Confluence (the same site and token) ----------

// The Confluence pages some texts link to, each once, in order.
export function confluenceIds(texts: (string | null | undefined)[]): string[] {
  const ids = texts.flatMap(t => [...(t ?? "").matchAll(/\/wiki\/(?:spaces\/[^/\s)]+\/pages\/|pages\/viewpage\.action\?pageId=)(\d+)/g)].map(m => m[1]!))
  return [...new Set(ids)]
}

export type ConfluencePage = { id: string; title: string; version: number; url: string; md: string }

// A page as it is now: its title, version and body in Markdown (struck lines stay struck).
export async function confluencePage(id: string): Promise<ConfluencePage | null> {
  if (!/^\d{1,15}$/.test(id)) return null
  const setup = setupOrThrow()
  const r = await call(setup, `/wiki/api/v2/pages/${id}?body-format=atlas_doc_format`).catch(() => null)
  if (!r?.id) return null
  const body = (() => { try { return JSON.parse(r.body?.atlas_doc_format?.value ?? "null") } catch { return null } })()
  return { id: String(r.id), title: String(r.title ?? ""), version: Number(r.version?.number ?? 0), url: `${setup.site}/wiki${r._links?.webui ?? ""}`, md: markdownOf(body) }
}

// What a ticket links to outside Jira (Confluence's "mentioned in", web links): their addresses.
export async function remoteLinks(key: string): Promise<string[]> {
  const setup = setupOrThrow()
  const r = await call(setup, `/rest/api/3/issue/${keyOrThrow(key)}/remotelink`).catch(() => [])
  return (Array.isArray(r) ? r : []).map((l: any) => String(l?.object?.url ?? "")).filter(Boolean)
}

// Files attached to a ticket of yours (a test's evidence).
export async function attachTo(key: string, paths: string[]) {
  const setup = setupOrThrow()
  await mineOrThrow(setup, key)
  const form = new FormData()
  for (const path of paths) form.append("file", Bun.file(path), path.split("/").pop())
  await request(setup, `/rest/api/3/issue/${key}/attachments`, { method: "POST", body: form, headers: { "X-Atlassian-Token": "no-check" } })
  briefs.delete(key)
}

// Two tickets related ("relates to"): the link shows on both; one of them must be yours.
export async function relateTickets(key: string, yours: string) {
  const setup = setupOrThrow()
  await mineOrThrow(setup, yours)
  await request(setup, "/rest/api/3/issueLink", { method: "POST", body: JSON.stringify({ type: { name: "Relates" }, inwardIssue: { key: keyOrThrow(key) }, outwardIssue: { key: yours } }) })
  briefs.delete(yours)
}

// A new ticket, assigned to you (the board writes only on what is yours): its key. Its
// description is Markdown (adf.ts), shown in Jira with its bold, lists and code.
export async function createIssue(f: { project: string; typeId: string; summary: string; description: string; labels: string[]; priority?: string | null }): Promise<string> {
  const setup = setupOrThrow()
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(f.project)) throw new Error("Not a project key")
  const fields = { project: { key: f.project }, issuetype: { id: f.typeId }, summary: f.summary.slice(0, 250), description: adfOf(f.description.slice(0, 30_000)), labels: f.labels, assignee: { accountId: await myId(setup) },
    ...(f.priority ? { priority: { name: f.priority } } : {}) }
  const r = await call(setup, "/rest/api/3/issue", { method: "POST", body: JSON.stringify({ fields }) })
  return String(r?.key ?? "")
}
