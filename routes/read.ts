// What the page reads: the board, its live stream, conversations, changes,
// PRs, tasks, runs, files sent and search. GET only; none changes anything
// the person decided.

import { sessionCommits, sessionRepos } from "../lib/session-commits"
import { ICONS, chosenIcon } from "../lib/app-icon"
import { basename } from "node:path"
import { status as bridgeStatus } from "../lib/bridge"
import { changesOf, commitDiff } from "../lib/changes"
import { sessionChanges, sessionVersions } from "../lib/session-changes"
import { isContextPath, listContext, readContext } from "../lib/context"
import { editorThemes } from "../lib/editor-theme"
import { codeTree, marksOf, readCode, searchCode, versionsOf } from "../lib/code"
import { HOME } from "../lib/config"
import { board } from "../lib/board"
import { isArchivedInApp, readDesktop, suggestionStates } from "../lib/desktop"
import { lastDigest } from "../lib/digest"
import { detail as prDetail, lookup as prLookup, openThreads } from "../lib/github"
import { json } from "../lib/http"
import { latestJson, latestState, stream } from "../lib/live"
import { blockerFor, report } from "../lib/diagnose"
import { freshness } from "../lib/freshness"
import { monacoState } from "../lib/monaco"
import { documentHtml, quickLook, WORD, WORKBOOK, workbookHtml } from "../lib/office"
import { readTasks } from "../lib/organizer"
import { branchState, knownRepos, repoInfo } from "../lib/repo"
import { commandFor, status as runStatus, suggest as suggestRun } from "../lib/runner"
import { fold, search } from "../lib/search"
import { sessionEvents } from "../lib/session-events"
import { sessionFile, sessionFiles } from "../lib/session-files"
import { defaultVoice, listVoices } from "../lib/speech"
import { setupStatus } from "../lib/setup"
import { readSessions } from "../lib/sessions"
import { groupOf, prRefs } from "../lib/snapshot"
import { refreshLinks, sessionOf } from "../lib/task-links"
import { readMessages } from "../lib/transcript"
import { isReady as voiceReady } from "../lib/transcribe"
import { uploadedFile } from "../lib/uploads"
import { wakeState } from "../lib/wake"

// A session whose title holds every word comes first (its conversation may
// mention them less than others that only talk about it), then the newest.
async function searchResults(query: string) {
  const [hits, desktop, sessions, state] = await Promise.all([search(query), readDesktop(), readSessions(), latestState()])
  const onBoard = new Set(sessions.map(s => s.session_id))
  // A name given on the board ("renamed") counts as the title too.
  const named = new Map((state?.cards ?? []).map(c => [c.id, c]))
  const terms = fold(query).split(/\s+/).filter(t => t.length > 1)
  const inTitle = (r: { title: string }) => terms.every(t => fold(r.title).includes(t))
  const results = await Promise.all(
    hits.map(async h => {
      const app = desktop.byCli.get(h.sessionId)
      const repo = h.cwd ? await repoInfo(h.cwd) : null
      return {
        id: h.sessionId,
        hostId: app?.hostId ?? null,
        title: named.get(h.sessionId)?.title || app?.title || h.firstPrompt || h.sessionId,
        repo: repo?.name ?? null,
        updatedAt: h.updatedAt,
        matches: h.matches,
        snippet: h.snippet,
        role: h.role as "user" | "assistant" | null, // null: only its title matches
        isOnBoard: onBoard.has(h.sessionId),
        isArchived: !!app?.isArchived,
      }
    }),
  )
  // A title the app gave can say what its conversation never does in so many words.
  const found = new Set(results.map(r => r.id))
  for (const app of desktop.byHost.values()) {
    if (!app.cliId || found.has(app.cliId) || !app.title || !inTitle({ title: app.title })) continue
    found.add(app.cliId)
    results.push({
      id: app.cliId, hostId: app.hostId, title: app.title, repo: app.cwd ? (await repoInfo(app.cwd)).name : null,
      updatedAt: app.lastActivityAt ?? 0, matches: 0, snippet: "", role: null,
      isOnBoard: onBoard.has(app.cliId), isArchived: app.isArchived,
    })
  }
  for (const c of named.values()) {
    if (found.has(c.id) || !inTitle(c)) continue
    found.add(c.id)
    results.push({
      id: c.id, hostId: c.hostId, title: c.title, repo: c.repo, updatedAt: c.lastActivity ?? 0, matches: 0, snippet: "", role: null,
      isOnBoard: true, isArchived: c.isArchived,
    })
  }
  return results.sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)) || b.updatedAt - a.updatedAt)
}

// A file sent from the board. Pictures and PDFs open in the browser; anything
// else downloads, so a sent HTML or SVG never runs on the board's origin.
async function sentFile(rel: string) {
  const file = uploadedFile(rel)
  if (!file || !(await file.exists())) return new Response("Not found", { status: 404 })
  const type = file.type.split(";")[0]!
  const isShown = (type.startsWith("image/") && type !== "image/svg+xml") || type === "application/pdf"
  const name = (file.name ?? "").split("/").pop()!.replace(/^\d+-[0-9a-f]{6}-?/, "")
  return new Response(file, {
    headers: {
      "x-content-type-options": "nosniff",
      ...(isShown ? {} : { "content-security-policy": "sandbox", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` }),
    },
  })
}

// A byte offset in a query string, or undefined; NaN when not one.
const offset = (value: string | null) => (value === null ? undefined : Number(value))

// A session's file for the viewer: text as text (markdown is drawn by the
// page), pictures and PDFs as they are, HTML in a sandbox (no scripts' access
// to this board), anything else for download.
const TEXT_EXT = /^(md|markdown|txt|text|log|csv|tsv|json|jsonl|ya?ml|toml|ini|env|xml|svg|sql|sh|zsh|bash|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|js|jsx|ts|tsx|mjs|cjs|css|scss|vue|svelte|astro|graphql|proto|tf|dockerfile|gitignore|lock)$/
const MEDIA: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav",
}
function viewable(path: string, ext: string) {
  const headers: Record<string, string> = { "x-content-type-options": "nosniff", "cache-control": "no-store" }
  if (ext === "html" || ext === "htm") Object.assign(headers, { "content-type": "text/html; charset=utf-8", "content-security-policy": "sandbox allow-scripts" })
  else if (TEXT_EXT.test(ext) || ext === "") headers["content-type"] = "text/plain; charset=utf-8"
  else if (MEDIA[ext]) headers["content-type"] = MEDIA[ext]
  else Object.assign(headers, { "content-type": "application/octet-stream", "content-security-policy": "sandbox", "content-disposition": "attachment" })
  return new Response(Bun.file(path), { headers })
}

async function sessionRead(id: string, what: string, url: URL) {
  if (!groupOf(id)) await latestJson() // right after a restart no snapshot has run yet
  const group = groupOf(id)
  switch (what) {
    case "messages": {
      const page = await readMessages(id, { before: offset(url.searchParams.get("before")), after: offset(url.searchParams.get("after")) })
      if (!page) return json({ error: "Cannot find this session's transcript" }, 404)
      // A suggested task runs in the session's repository (not its worktree)
      // unless it names a folder; what became of each one, on every read.
      const root = group ? (await repoInfo(group.lead.cwd)).root : null
      for (const item of page.items) if (item.kind === "suggestion") item.folder ??= root
      return json({ ...page, suggestions: await suggestionStates(group?.ids ?? [id], board.suggestions ?? {}) })
    }
    // The "Code" tab: the folder's files, and one of them as text.
    case "codetree":
      return group ? json(await codeTree(group.lead.cwd)) : json({ error: "unknown session" }, 404)
    case "codefile": {
      if (!group) return json({ error: "unknown session" }, 404)
      const { status = 200, ...file } = await readCode(group.lead.cwd, url.searchParams.get("path") ?? "", url.searchParams.has("time"))
      return json(file, status)
    }
    case "codesearch": {
      if (!group) return json({ error: "unknown session" }, 404)
      const q = url.searchParams
      return json(await searchCode(group.lead.cwd, q.get("q") ?? "", { caseSensitive: q.has("case"), regex: q.has("regex") }))
    }
    // What changed in a file, by line, for the editor's margin.
    case "codemarks": {
      if (!group) return json({ error: "unknown session" }, 404)
      const marks = await marksOf(group.lead.cwd, url.searchParams.get("path") ?? "")
      return marks ? json({ marks }) : json({ error: "This file is not in the session's folder" }, 404)
    }
    // A changed file before and after, for the side-by-side view of "Changes".
    case "codeversions": {
      if (!group) return json({ error: "unknown session" }, 404)
      // A file outside the repository: its texts from the session's own edits.
      if (url.searchParams.has("session")) {
        const own = await sessionVersions(group.ids, url.searchParams.get("path") ?? "", group.lead.cwd)
        return own ? json(own) : json({ error: "This session did not change that file" }, 404)
      }
      const { status = 200, ...res } = await versionsOf(group.lead.cwd, url.searchParams.get("path") ?? "", url.searchParams.get("old"))
      return json(res, status)
    }
    // The repository's diff (its folder's), and what the session changed outside it.
    case "changes": {
      if (!group) return json({ error: "unknown session" }, 404)
      const repo = await changesOf(group.lead.cwd)
      const own = await sessionChanges(group.ids, group.lead.cwd, repo?.root ?? null)
      if (repo) return json({ ...repo, files: [...repo.files, ...own] })
      if (own.length) return json({ root: group.lead.cwd, branch: null, base: null, files: own, truncated: false })
      return json({ error: "Nothing changed: this session's folder is not a git repository, and the session edited no file" }, 404)
    }
    // The history of every repository it touched (lib/session-commits.ts).
    case "commits":
      if (!group) return json({ error: "unknown session" }, 404)
      return json({ repos: await sessionCommits(group.ids, group.lead.cwd) })
    // One of those commits' own changes: only in a repository the session touched.
    case "commit": {
      if (!group) return json({ error: "unknown session" }, 404)
      const root = url.searchParams.get("root") ?? ""
      const hash = url.searchParams.get("hash") ?? ""
      if (!/^[0-9a-f]{7,40}$/.test(hash) || !(await sessionRepos(group.ids, group.lead.cwd)).includes(root)) return json({ error: "Not one of this session's commits" }, 404)
      return json({ files: await commitDiff(root, hash) })
    }
    // What changes in it, as it happens, for its open conversation (lib/session-events.ts).
    case "events":
      return sessionEvents(group?.ids ?? [id], group?.id ?? id)
    case "bridge":
      return json({ ...(await bridgeStatus(id)), ...(await blockerFor(id)), wake: wakeState(id), isArchived: await isArchivedInApp(group?.ids ?? [id]) })
    case "prs": {
      const refs = group ? await prRefs(group.ids, group.root, group.branch) : await prRefs([id], HOME, null)
      // The branch's PR resolves to a URL through the summary cache.
      const urls = [...new Set(refs.map(r => (r.ref.startsWith("https://") ? r.ref : prLookup(r.key, r.ref, r.cwd)?.url)).filter(Boolean) as string[])]
      const prs = (await Promise.all(urls.slice(0, 12).map(prDetail))).filter(pr => pr !== null)
      const ofBranch = new Set(refs.filter(r => !r.ref.startsWith("https://")).map(r => prLookup(r.key, r.ref, r.cwd)?.url))
      return json({ prs: prs.map(pr => ({ ...pr, origin: ofBranch.has(pr.url) ? "branch" : "chat" })) })
    }
    // "Ready to merge?": what the PR card does not say on its own. The
    // review comments still open, the session's folder (anything uncommitted
    // or unpushed on the PR's branch) and the session's open tasks.
    case "readiness": {
      const prUrl = url.searchParams.get("url") ?? ""
      const [pr, threads, tasks] = await Promise.all([
        prDetail(prUrl),
        openThreads(prUrl),
        readTasks().then(all => all.filter(t => (group?.ids ?? [id]).includes(sessionOf(t) ?? ""))),
      ])
      const local = group && pr ? await branchState(group.lead.cwd, pr.headRefName) : null
      return json({ threads, local, tasks: tasks.map(t => t.text) })
    }
    // "Run": the saved command of the repo (or a guess) and the run, if any.
    case "run":
      if (!group) return json({ error: "unknown session" }, 404)
      return json({
        command: await commandFor(group.root),
        suggestion: await suggestRun(group.lead.cwd),
        repo: basename(group.root),
        cwd: group.lead.cwd,
        run: await runStatus(id),
      })
    // The "Files" tab: what the session sent, published or wrote.
    case "files":
      return json({ files: await sessionFiles(group?.ids ?? [id]) })
    // One of its files: what it is (fileinfo), then its bytes (file).
    case "fileinfo":
    case "file":
    case "filepreview": {
      const file = await sessionFile(group?.ids ?? [id], url.searchParams.get("path") ?? "", group ? [group.lead.cwd, group.root] : [])
      if (!file) return json({ error: "This session does not name that file, or it is gone" }, 404)
      if (what === "fileinfo") return json(file)
      if (!file.isViewable) return json({ error: "Too large to show here: open it on the Mac" }, 413)
      if (what === "file") return viewable(file.path, file.ext)
      // What the browser cannot show itself: a page, tables or a picture.
      try {
        const sandboxed = { "content-type": "text/html; charset=utf-8", "content-security-policy": "sandbox", "x-content-type-options": "nosniff" }
        if (WORD.test(file.ext)) return new Response(await documentHtml(file.path), { headers: sandboxed })
        if (WORKBOOK.test(file.ext)) return new Response(await workbookHtml(file.path), { headers: sandboxed })
        return new Response(await quickLook(file.path), { headers: { "content-type": "image/png", "x-content-type-options": "nosniff" } })
      } catch (err) {
        return json({ error: (err as Error).message }, 422)
      }
    }
    case "tasks": {
      await refreshLinks()
      const ids = group?.ids ?? [id]
      const tasks = (await readTasks()).filter(t => ids.includes(sessionOf(t) ?? ""))
      return json({ tasks: tasks.map(({ file, line, text, priority, due, project }) => ({ file, line, text, priority, due, project })) })
    }
  }
  return null
}

export async function handleRead(url: URL): Promise<Response | null> {
  const path = url.pathname
  if (path === "/api/state") {
    const text = await latestJson()
    return text ? new Response(text, { headers: { "content-type": "application/json" } }) : json({ error: "The board is not ready" }, 503)
  }
  if (path === "/api/stream") return stream()
  if (path === "/api/repos") return json({ repos: await knownRepos() })
  if (path === "/api/digest") return json({ digest: await lastDigest() })
  if (path === "/api/search") return json({ results: await searchResults(url.searchParams.get("q") ?? "") })
  if (path === "/api/transcribe") return json({ ready: await voiceReady() })
  if (path === "/api/setup") return json(await setupStatus())
  if (path === "/api/app-icon") return json({ icon: chosenIcon(), icons: ICONS })
  if (path === "/api/context") return json(await listContext())
  if (path === "/api/editor-themes") return json({ themes: await editorThemes() })
  if (path === "/api/context/file") {
    const file = url.searchParams.get("path")
    return isContextPath(file) ? json(await readContext(file)) : json({ error: "not a context file" }, 400)
  }
  if (path === "/api/monaco") return json(await monacoState())
  if (path === "/api/update") return json(await freshness({ fresh: true }))
  if (path === "/api/diagnostics") return json({ text: await report() })
  if (path === "/api/voices") return json({ voices: await listVoices(), default: defaultVoice() })
  const file = path.match(/^\/api\/uploads\/(.+)$/)
  if (file) return sentFile(decodeURIComponent(file[1]!))
  const session = path.match(/^\/api\/sessions\/([\w-]+)\/(\w+)$/)
  if (session) return sessionRead(session[1]!, session[2]!, url)
  return null
}
