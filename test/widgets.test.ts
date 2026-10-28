// What a connector's tool gave back, drawn as the desktop app draws it (its
// MCP App widget): lib/widgets.ts reads the result into the widget's data.

import { expect, test } from "bun:test"
import { hasWidget, resultOf, widgetOf } from "../lib/widgets"

const issue = (key: string, summary: string, category: string, extra: Record<string, unknown> = {}) => ({
  id: "1", key, webUrl: `https://acme.atlassian.net/browse/${key}`,
  fields: { summary, status: { name: category === "done" ? "Done" : "In Progress", statusCategory: { key: category } }, issuetype: { name: "Story" }, ...extra },
})

test("only the tools that have a widget in the app", () => {
  expect(hasWidget("mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql")).toBe(true)
  expect(hasWidget("mcp__0b6f1c2e-1111-2222-3333-444455556666__getJiraIssue")).toBe(true)
  expect(hasWidget("mcp__visualize__show_widget")).toBe(true)
  expect(hasWidget("mcp__claude_ai_Atlassian__getAccessibleAtlassianResources")).toBe(false)
  expect(hasWidget("Bash")).toBe(false)
})

test("a Jira search: one row per issue, its status as to do, doing or done", () => {
  const data = { issues: { nodes: [
    issue("PP-1", "Ficha", "indeterminate", { assignee: { displayName: "Andrea" }, project: { name: "Product Project" } }),
    issue("PP-2", "Teaser", "done"),
  ] } }
  expect(widgetOf("mcp__x__searchJiraIssuesUsingJql", {}, { data, text: "" })).toEqual({
    app: "jira",
    issues: [
      { key: "PP-1", summary: "Ficha", url: "https://acme.atlassian.net/browse/PP-1", status: "In Progress", tone: "doing", type: "Story", assignee: "Andrea", project: "Product Project" },
      { key: "PP-2", summary: "Teaser", url: "https://acme.atlassian.net/browse/PP-2", status: "Done", tone: "done", type: "Story", assignee: null, project: null },
    ],
  })
})

test("a Jira result that names no issue still shows the one it acted on", () => {
  const w = widgetOf("mcp__x__transitionJiraIssue", { issueIdOrKey: "PP-9" }, { data: null, text: "Transitioned" })
  expect(w).toEqual({ app: "jira", issues: [{ key: "PP-9", summary: null, url: null, status: null, tone: null, type: null, assignee: null, project: null }] })
})

test("Confluence pages, from a search's results or a page itself", () => {
  const data = { results: [{ content: { title: "Runbook", _links: { webui: "/spaces/OPS/pages/1" } }, title: "Runbook", excerpt: "How to @@@hl@@@deploy@@@endhl@@@", url: "/spaces/OPS/pages/1", resultGlobalContainer: { title: "Ops" } }], _links: { base: "https://acme.atlassian.net/wiki" } }
  expect(widgetOf("mcp__x__searchConfluenceUsingCql", {}, { data, text: "" })).toEqual({
    app: "confluence", pages: [{ title: "Runbook", url: "https://acme.atlassian.net/wiki/spaces/OPS/pages/1", space: "Ops", excerpt: "How to deploy" }],
  })
  const page = { id: "7", title: "Plan", spaceId: "1", _links: { base: "https://acme.atlassian.net/wiki", webui: "/spaces/X/pages/7" } }
  expect(widgetOf("mcp__x__getConfluencePage", {}, { data: page, text: "" })).toEqual({
    app: "confluence", pages: [{ title: "Plan", url: "https://acme.atlassian.net/wiki/spaces/X/pages/7", space: null, excerpt: null }],
  })
})

test("GitHub: who you are, and the pull request or issue a tool wrote", () => {
  const me = { avatar_url: "https://avatars/1", login: "octo", name: "Octo Cat", profile_url: "https://github.com/octo", details: { public_repos: 6, followers: 2 } }
  expect(widgetOf("mcp__x__get_me", {}, { data: me, text: "" })).toEqual({
    app: "github", kind: "user", login: "octo", name: "Octo Cat", avatar: "https://avatars/1", url: "https://github.com/octo", repos: 6, followers: 2,
  })
  const pr = widgetOf("mcp__x__create_pull_request", { owner: "acme", repo: "web", title: "Fix the footer" }, { data: { id: "1", url: "https://github.com/acme/web/pull/12" }, text: "" })
  expect(pr).toEqual({ app: "github", kind: "pr", title: "Fix the footer", url: "https://github.com/acme/web/pull/12", number: 12, repo: "acme/web", state: null })
  const issueW = widgetOf("mcp__x__issue_write", { method: "update", owner: "acme", repo: "web" }, resultOf(null, [{ type: "text", text: '{"html_url":"https://github.com/acme/web/issues/4","title":"Bug","state":"closed"}' }]))
  expect(issueW).toEqual({ app: "github", kind: "issue", title: "Bug", url: "https://github.com/acme/web/issues/4", number: 4, repo: "acme/web", state: "closed" })
})

test("a Slack draft shows what it says and where it goes", () => {
  expect(widgetOf("mcp__x__slack_send_message_draft", { channel_id: "C1", message: "Hola" }, { data: null, text: "Draft saved: https://acme.slack.com/archives/C1" })).toEqual({
    app: "slack", channel: "C1", text: "Hola", url: "https://acme.slack.com/archives/C1",
  })
})

test("a FigJam diagram links to the file", () => {
  expect(widgetOf("mcp__x__generate_diagram", { name: "Flow", mermaidSyntax: "graph TD" }, { data: null, text: "Created https://www.figma.com/board/abc/Flow." })).toEqual({
    app: "figjam", title: "Flow", url: "https://www.figma.com/board/abc/Flow",
  })
})

test("a visual Claude drew (show_widget) keeps its code", () => {
  expect(widgetOf("mcp__visualize__show_widget", { title: "flow", widget_code: "<svg></svg>" }, { data: null, text: "" })).toEqual({ app: "visual", title: "flow", html: "<svg></svg>" })
})

test("nothing to draw: no widget", () => {
  expect(widgetOf("mcp__x__searchJiraIssuesUsingJql", {}, { data: { issues: { nodes: [] } }, text: "" })).toBeNull()
  expect(widgetOf("mcp__x__create_pull_request", {}, { data: null, text: "Error: forbidden" })).toBeNull()
})
