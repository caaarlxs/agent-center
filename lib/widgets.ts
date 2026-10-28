// The connectors' tools the desktop app draws as a widget (an MCP App: the
// tool names a `ui://` page its server serves), and the same drawn here from
// what the tool gave back. The app's list, from the tools' `_meta.ui`:
// Jira (search, get, create, edit, transition), Confluence (get, search),
// GitHub (get_me, issue_write, create and update a pull request), Slack's
// message draft, FigJam's diagram and the visuals Claude draws (show_widget).
// Widgets that only make sense inside their own page (HubSpot's asset, the
// feedback form, Weave's upload) stay one line.

export type JiraIssue = {
  key: string; summary: string | null; url: string | null; status: string | null
  tone: "todo" | "doing" | "done" | null; type: string | null; assignee: string | null; project: string | null
}
export type ConfluencePage = { title: string; url: string | null; space: string | null; excerpt: string | null }
export type Widget =
  | { app: "jira"; issues: JiraIssue[] }
  | { app: "confluence"; pages: ConfluencePage[] }
  | { app: "github"; kind: "user"; login: string; name: string | null; avatar: string | null; url: string | null; repos: number | null; followers: number | null }
  | { app: "github"; kind: "pr" | "issue"; title: string | null; url: string; number: number; repo: string; state: string | null }
  | { app: "slack"; channel: string | null; text: string; url: string | null }
  | { app: "figjam"; title: string | null; url: string }
  | { app: "visual"; title: string | null; html: string }

// What a tool gave back: its structured content (or its text read as JSON),
// and its text.
export type ToolResult = { data: unknown; text: string }

const JIRA = /^(searchJiraIssuesUsingJql|getJiraIssue|createJiraIssue|editJiraIssue|transitionJiraIssue)$/
const CONFLUENCE = /^(getConfluencePage|searchConfluence|searchConfluenceUsingCql)$/
const GITHUB = /^(get_me|issue_write|create_pull_request|update_pull_request)$/

// A connector's tool by its own name: "mcp__<server>__<tool>".
const toolOf = (name: string) => (name.startsWith("mcp__") ? name.split("__").slice(2).join("__") : "")

export function hasWidget(name: string) {
  const tool = toolOf(name)
  return JIRA.test(tool) || CONFLUENCE.test(tool) || GITHUB.test(tool) ||
    tool === "slack_send_message_draft" || tool === "generate_diagram" || tool === "show_widget"
}

// The tool result's content, as text (a string, or text blocks).
export function resultText(content: unknown): string {
  if (typeof content === "string") return content
  return Array.isArray(content) ? content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("\n") : ""
}

// Structured content when the server sent it, else the text when it is JSON.
export function resultOf(structured: unknown, content: unknown): ToolResult {
  const text = resultText(content)
  if (structured && typeof structured === "object") return { data: structured, text }
  try {
    return { data: JSON.parse(text), text }
  } catch {
    return { data: null, text }
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

// Every object in `data` that `pick` takes, outermost first (not inside one taken).
function collect<T>(data: unknown, pick: (o: any) => T | null, out: T[] = []): T[] {
  if (Array.isArray(data)) for (const v of data) collect(v, pick, out)
  else if (data && typeof data === "object") {
    const hit = pick(data)
    if (hit) out.push(hit)
    else for (const v of Object.values(data)) collect(v, pick, out)
  }
  return out
}

const TONE: Record<string, JiraIssue["tone"]> = { new: "todo", indeterminate: "doing", done: "done" }
const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/

function jiraIssue(o: any): JiraIssue | null {
  if (!ISSUE_KEY.test(String(o.key ?? "")) || !o.fields || typeof o.fields !== "object") return null
  const f = o.fields
  return {
    key: o.key, summary: str(f.summary), url: str(o.webUrl), status: str(f.status?.name),
    tone: TONE[f.status?.statusCategory?.key] ?? null, type: str(f.issuetype?.name),
    assignee: str(f.assignee?.displayName), project: str(f.project?.name),
  }
}

function jira(input: any, { data }: ToolResult): Widget | null {
  const issues = collect(data, jiraIssue)
  const key = str(input?.issueIdOrKey)
  if (!issues.length && key && ISSUE_KEY.test(key))
    issues.push({ key, summary: null, url: null, status: null, tone: null, type: null, assignee: null, project: null })
  return issues.length ? { app: "jira", issues } : null
}

const unmark = (s: string | null) => s && s.replace(/@@@(end)?hl@@@/g, "").replace(/\s+/g, " ").trim()

function confluence({ data }: ToolResult): Widget | null {
  const base = str((data as any)?._links?.base)
  const join = (link: string | null, own: string | null) => {
    if (!link) return null
    if (/^https?:/.test(link)) return link
    return (own ?? base) ? `${own ?? base}${link}` : null
  }
  const page = (o: any): ConfluencePage | null => {
    const title = str(o.title)
    const link = str(o.webUrl) ?? str(o.url) ?? str(o._links?.webui) ?? str(o.content?._links?.webui)
    if (!title || (!link && !o.spaceId && !o.content)) return null
    return { title, url: join(link, str(o._links?.base)), space: str(o.resultGlobalContainer?.title) ?? str(o.space?.name), excerpt: unmark(str(o.excerpt)) }
  }
  const pages = collect(data, page)
  return pages.length ? { app: "confluence", pages } : null
}

const GITHUB_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues)\/(\d+)/

function github(tool: string, input: any, { data, text }: ToolResult): Widget | null {
  const d = data as any
  if (tool === "get_me")
    return str(d?.login)
      ? { app: "github", kind: "user", login: d.login, name: str(d.name), avatar: str(d.avatar_url), url: str(d.profile_url) ?? str(d.html_url), repos: num(d.details?.public_repos), followers: num(d.details?.followers) }
      : null
  const found = collect(data, o => (GITHUB_URL.test(str(o.html_url) ?? str(o.url) ?? "") ? o : null))[0]
  const url = (str(found?.html_url) ?? str(found?.url) ?? text).match(GITHUB_URL)
  if (!url) return null
  return {
    app: "github", kind: url[2] === "pull" ? "pr" : "issue", title: str(found?.title) ?? str(input?.title),
    url: url[0], number: Number(url[3]), repo: url[1]!, state: str(found?.state),
  }
}

const urlIn = (text: string, host: RegExp) => text.match(/https:\/\/[^\s"')<>]+/g)?.map(u => u.replace(/[.,;]+$/, "")).find(u => host.test(u)) ?? null

export function widgetOf(name: string, input: any, result: ToolResult): Widget | null {
  const tool = toolOf(name)
  if (JIRA.test(tool)) return jira(input, result)
  if (CONFLUENCE.test(tool)) return confluence(result)
  if (GITHUB.test(tool)) return github(tool, input, result)
  if (tool === "slack_send_message_draft") {
    const text = str(input?.message) ?? str(input?.text) ?? str(input?.content)
    return text ? { app: "slack", channel: str(input?.channel_name) ?? str(input?.channel) ?? str(input?.channel_id), text, url: urlIn(result.text, /slack\.com/) } : null
  }
  if (tool === "generate_diagram") {
    const url = urlIn(result.text, /figma\.com/)
    return url ? { app: "figjam", title: str(input?.name), url } : null
  }
  if (tool === "show_widget") return str(input?.widget_code) ? { app: "visual", title: str(input?.title), html: input.widget_code } : null
  return null
}
