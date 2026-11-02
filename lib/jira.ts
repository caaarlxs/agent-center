// Jira: the tickets your sessions work on, read live from your Jira Cloud site.
// A session names its tickets in its branch and title ("fix/PP-3130-…") or
// again and again in its conversation; the
// board reads their summary and status for its cards (all at once, every two
// minutes) and a ticket's whole detail when you open it. Your own open tickets
// are a search away (yours, the ones you reported, the open sprint, or by
// text), with their status, type, priority and sprint; and on a ticket
// assigned to you, the board moves its status or adds a comment, never on
// anyone else's. You set it up in Settings › Jira: the site, your email
// and an API token (kept in the macOS keychain, never in a file), and the
// keys of the projects to look for, so a word like "UTF-8" is never a ticket.

import { stat } from "node:fs/promises"
import { settings } from "./config"
import { readAppended } from "./files"
import { exec } from "./proc"
import { saveSettings } from "./setup"
import { transcriptPath } from "./transcript"

export type JiraSetup = { site: string; email: string; projects: string[] }
export type TicketBrief = { key: string; summary: string; status: string; tone: "todo" | "doing" | "done"; assignee: string | null; url: string }
// A ticket in a list: what a card needs, and its type, priority, sprint and last change.
export type TicketRow = TicketBrief & { statusId: string; type: string | null; priority: string | null; sprint: string | null; updated: number }
export type Transition = { id: string; name: string; to: string; tone: TicketBrief["tone"] }
export type TicketFilter = "mine" | "reported" | "sprint"
export type TicketComment = { author: string; at: number; body: string }
export type Ticket = TicketBrief & {
  isMine: boolean // assigned to you: the board may move it and comment
  type: string | null
  priority: string | null
  reporter: string | null
  updated: number
  description: string
  comments: TicketComment[]
}

const KEYCHAIN = "agent-center.jira"
const BRIEF_FIELDS = ["summary", "status", "assignee"]
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

// The tickets a session works on: those its branch and title name, then those
// its conversation names twice or more (a passing mention of another ticket
// is not one), the most named first; three at most.
export function sessionKeys(named: string[], mentions: Map<string, number>, projects: string[]): string[] {
  const wanted = new Set(projects.map(p => p.toUpperCase()))
  const often = [...mentions].filter(([k, n]) => n >= 2 && wanted.has(k.split("-")[0]!)).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  return [...new Set([...named, ...often])].slice(0, 3)
}

// What a transcript line says in the session's own words: your messages and
// Claude's (its text, and what it puts in its tools, such as a commit's
// message); not what tools gave back (a git log names others' tickets).
export function ownWords(line: string): string {
  let d: any
  try {
    d = JSON.parse(line)
  } catch {
    return ""
  }
  if (d?.isMeta) return ""
  const content = d?.message?.content
  if (d?.type === "user") return typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : ""
  if (d?.type === "assistant" && Array.isArray(content))
    return content.map((b: any) => (b?.type === "text" ? b.text : b?.type === "tool_use" ? JSON.stringify(b.input ?? "") : "")).join("\n")
  return ""
}
const KEY = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,9}-\d{1,6})(?![0-9])/g

// How often a session's conversations name each ticket key: read once, then only what they add.
const mentionScans = new Map<string, { offset: number; counts: Map<string, number> }>()
export async function mentionsIn(ids: string[]): Promise<Map<string, number>> {
  const total = new Map<string, number>()
  for (const id of ids) {
    const path = await transcriptPath(id)
    if (!path) continue
    const { size } = await stat(path).catch(() => ({ size: 0 }))
    let scan = mentionScans.get(id)
    if (!scan || size < scan.offset) mentionScans.set(id, (scan = { offset: 0, counts: new Map() }))
    const s = scan
    s.offset = await readAppended(path, s.offset, size, text => {
      for (const line of text.split("\n")) {
        if (!/[A-Z]-\d/.test(line)) continue
        for (const m of ownWords(line).matchAll(KEY)) s.counts.set(m[1]!, (s.counts.get(m[1]!) ?? 0) + 1)
      }
    })
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

export function briefOf(raw: any, site: string): TicketBrief {
  const f = raw?.fields ?? {}
  return {
    key: String(raw?.key ?? ""),
    summary: String(f.summary ?? ""),
    status: String(f.status?.name ?? ""),
    tone: TONE[f.status?.statusCategory?.key] ?? "todo",
    assignee: f.assignee?.displayName ?? null,
    url: `${site}/browse/${raw?.key}`,
  }
}

// The open sprint's name, from Jira's sprint field (its id varies per site).
const sprintOf = (value: unknown): string | null => {
  const list = Array.isArray(value) ? value : []
  const open = list.find((s: any) => s?.state === "active") ?? list.at(-1)
  return open?.name ?? null
}

export function rowOf(raw: any, site: string, sprintField: string | null): TicketRow {
  const f = raw?.fields ?? {}
  return {
    ...briefOf(raw, site),
    statusId: String(f.status?.id ?? ""),
    type: f.issuetype?.name ?? null,
    priority: f.priority?.name ?? null,
    sprint: sprintField ? sprintOf(f[sprintField]) : null,
    updated: Date.parse(f.updated ?? "") || 0,
  }
}

// What a search asks for: your open tickets, those you reported, the open sprint's; and some words.
export function jqlOf(filter: TicketFilter, projects: string[], text = ""): string {
  const scope = `project in (${projects.join(",")})`
  const who = filter === "reported" ? "reporter = currentUser()" : filter === "sprint" ? "sprint in openSprints()" : "assignee = currentUser()"
  const words = text.trim().replace(/["\\]/g, " ").trim()
  return [scope, who, filter === "mine" ? "statusCategory != Done" : null, words ? `text ~ "${words}"` : null].filter(Boolean).join(" AND ") + " ORDER BY updated DESC"
}

// The order of the statuses, as the team's board lays out its columns: of the
// boards given (each its status ids, column by column), the one that holds
// most of the statuses seen; none when no board holds any.
export function pickOrder(boards: string[][], seen: string[]): string[] {
  let best: string[] = []
  let most = 0
  for (const order of boards) {
    const held = seen.filter(id => order.includes(id)).length
    if (held > most) (best = order), (most = held)
  }
  return best
}

// A comment as Jira's document: a paragraph per line.
export const docOf = (text: string) => ({
  type: "doc",
  version: 1,
  content: text.split("\n").map(line => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph", content: [] })),
})

export function ticketOf(raw: any, site: string, me: string | null = null): Ticket {
  const f = raw?.fields ?? {}
  return {
    ...briefOf(raw, site),
    isMine: !!me && f.assignee?.accountId === me,
    type: f.issuetype?.name ?? null,
    priority: f.priority?.name ?? null,
    reporter: f.reporter?.displayName ?? null,
    updated: Date.parse(f.updated ?? "") || 0,
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
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${setup.email}:${secret}`).toString("base64")}`, ...init.headers },
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

export async function ticket(key: string): Promise<Ticket> {
  const setup = setupOrThrow()
  const raw = await call(setup, `/rest/api/3/issue/${keyOrThrow(key)}?fields=summary,status,assignee,reporter,priority,issuetype,updated,description,comment`)
  return ticketOf(raw, setup.site, await myId(setup))
}

// The status order of each board of your projects (its columns, left to right): asked every ten minutes.
let boardOrders: { site: string; at: number; orders: string[][] } | null = null
async function boardOrdersOf(setup: JiraSetup) {
  if (boardOrders?.site === setup.site && Date.now() - boardOrders.at < 600_000) return boardOrders.orders
  const orders: string[][] = []
  for (const project of setup.projects) {
    const boards = await call(setup, `/rest/agile/1.0/board?projectKeyOrId=${project}&maxResults=10`).catch(() => null)
    for (const b of boards?.values ?? []) {
      const config = await call(setup, `/rest/agile/1.0/board/${b.id}/configuration`).catch(() => null)
      orders.push((config?.columnConfig?.columns ?? []).flatMap((c: any) => (c.statuses ?? []).map((s: any) => String(s.id))))
    }
  }
  boardOrders = { site: setup.site, at: Date.now(), orders }
  return orders
}

export async function searchTickets(filter: TicketFilter, text = ""): Promise<{ tickets: TicketRow[]; order: string[] }> {
  const setup = setupOrThrow()
  const sprint = await sprintFieldOf(setup)
  const fields = [...BRIEF_FIELDS, "issuetype", "priority", "updated", ...(sprint ? [sprint] : [])]
  const r = await call(setup, "/rest/api/3/search/jql", { method: "POST", body: JSON.stringify({ jql: jqlOf(filter, setup.projects, text), fields, maxResults: 100 }) })
  const tickets: TicketRow[] = (r?.issues ?? []).map((i: any) => rowOf(i, setup.site, sprint))
  const order = pickOrder(await boardOrdersOf(setup), [...new Set(tickets.map(t => t.statusId))])
  return { tickets, order }
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
  return (r?.transitions ?? []).map((t: any) => ({ id: String(t.id), name: String(t.name), to: String(t.to?.name ?? t.name), tone: TONE[t.to?.statusCategory?.key] ?? "todo" }))
}

export async function moveTicket(key: string, transitionId: string) {
  const setup = setupOrThrow()
  await mineOrThrow(setup, key)
  if (!(await transitionsOf(key)).some(t => t.id === transitionId)) throw new Error("That move is not open for this ticket now")
  await request(setup, `/rest/api/3/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: transitionId } }) }) // no body back (204)
  briefs.delete(key)
}

export async function commentOn(key: string, text: string) {
  const setup = setupOrThrow()
  const body = text.trim()
  if (!body) throw new Error("Write something first")
  await mineOrThrow(setup, key)
  await call(setup, `/rest/api/3/issue/${key}/comment`, { method: "POST", body: JSON.stringify({ body: docOf(body.slice(0, 10_000)) }) })
}
