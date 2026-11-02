// Jira: the tickets your sessions work on, read live from your Jira Cloud site.
// A session names its tickets in its branch and title ("fix/PP-3130-…"); the
// board reads their summary and status for its cards (all at once, every two
// minutes) and a ticket's whole detail when you open it. Your own open tickets
// are a search away. You set it up in Settings › Jira: the site, your email
// and an API token (kept in the macOS keychain, never in a file), and the
// keys of the projects to look for, so a word like "UTF-8" is never a ticket.

import { settings } from "./config"
import { exec } from "./proc"
import { saveSettings } from "./setup"

export type JiraSetup = { site: string; email: string; projects: string[] }
export type TicketBrief = { key: string; summary: string; status: string; tone: "todo" | "doing" | "done"; assignee: string | null; url: string }
export type TicketComment = { author: string; at: number; body: string }
export type Ticket = TicketBrief & {
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

export function ticketOf(raw: any, site: string): Ticket {
  const f = raw?.fields ?? {}
  return {
    ...briefOf(raw, site),
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

async function call(setup: JiraSetup, path: string, init: RequestInit = {}, token?: string): Promise<any> {
  const secret = token ?? (await tokenOf(setup.email))
  if (!secret) throw new Error("No Jira token in the keychain: set Jira up again in Settings")
  const res = await fetch(`${setup.site}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${setup.email}:${secret}`).toString("base64")}`, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401 || res.status === 403) throw new Error("Jira did not accept the email and token")
  if (!res.ok) throw new Error(`Jira answered ${res.status}`)
  return res.json()
}

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

export async function ticket(key: string): Promise<Ticket> {
  const setup = jiraSetup()
  if (!setup) throw new Error("Jira is not set up")
  if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(key)) throw new Error("Not a ticket key")
  const raw = await call(setup, `/rest/api/3/issue/${key}?fields=summary,status,assignee,reporter,priority,issuetype,updated,description,comment`)
  return ticketOf(raw, setup.site)
}

export async function myTickets(): Promise<TicketBrief[]> {
  const setup = jiraSetup()
  if (!setup) throw new Error("Jira is not set up")
  const jql = `assignee = currentUser() AND statusCategory != Done AND project in (${setup.projects.join(",")}) ORDER BY updated DESC`
  const r = await call(setup, "/rest/api/3/search/jql", { method: "POST", body: JSON.stringify({ jql, fields: BRIEF_FIELDS, maxResults: 50 }) })
  return (r?.issues ?? []).map((i: any) => briefOf(i, setup.site))
}
