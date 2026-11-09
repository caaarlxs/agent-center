// Board-wide actions (POST): new sessions, the digest, canvas zones and
// notes, PR actions, tasks, files sent and dictation.

import { commentOn, connect, disconnect, moveTicket } from "../lib/jira"
import { actOnDebt, answerPipeline, askPipeline, checkByHand, isStage, resetPipeline, rollBackPipeline, startPipeline, stopAuto, stepPipeline } from "../lib/pipeline"
import { clearJob, continueJob, isLoose, publishReview, startJob } from "../lib/jobs"
import { chooseIcon, isIcon } from "../lib/app-icon"
import { choosePet, openPack } from "../lib/pets"
import { stat } from "node:fs/promises"
import { applyAction, isTaskId, setNotes, setSuggestion, setZones } from "../lib/board"
import { requestSettings } from "../lib/bridge"
import { activate, newInClient, pickFolder } from "../lib/client"
import { logClientError } from "../lib/client-errors"
import { logMemory } from "../lib/memory-log"
import { EFFORTS, MODES } from "../lib/config"
import { writeContext } from "../lib/context"
import { readDesktop } from "../lib/desktop"
import { makeDigest, type DigestItem } from "../lib/digest"
import { act as prAction } from "../lib/github"
import { errorMessage, json } from "../lib/http"
import { launch } from "../lib/launch"
import { latestState, refreshSoon } from "../lib/live"
import { rescan, stopForgotten } from "../lib/memory"
import { addTask, closeTask, reopenTask } from "../lib/organizer"
import { repoInfo } from "../lib/repo"
import { update } from "../lib/freshness"
import { runStep, setupStatus } from "../lib/setup"
import { cleanPrompt } from "../lib/sessions"
import { speakSample, stopSpeaking } from "../lib/speech"
import { groupOf, knownSessionIds } from "../lib/snapshot"
import { transcribe } from "../lib/transcribe"
import { openFolder, saveFile } from "../lib/uploads"

const isFolder = (path: string) => stat(path).then(st => st.isDirectory(), () => false)

// A new session: sent, its first turn runs headless here with the mode, model
// and effort picked in the dialog, and it moves into the client once that
// turn ends (so it shows up there and can take messages from here); not
// sent, it opens in the client with the prompt written. The client does not
// take Auto (or Bypass) from an imported session: it gives it its default
// mode (`permissions.defaultMode` in ~/.claude/settings.json, else Manual).
// When that is not the mode picked, the board asks for it through the
// session's mod once the client has it; the client asks the person to
// approve it.
const IMPORT_WAIT_MS = 60_000
async function keepMode(id: string, mode: string) {
  for (let waited = 0; waited < IMPORT_WAIT_MS; waited += 2000) {
    await Bun.sleep(2000)
    const now = (await readDesktop()).byCli.get(id)?.permissionMode
    if (now === undefined || now === null) continue // not imported yet
    if (now !== mode) await requestSettings(id, { mode }).catch(() => {})
    return
  }
}
async function newSession(body: Record<string, unknown>) {
  const folder = String(body.folder ?? "")
  if (!folder) return json({ error: "missing folder" }, 400)
  if (!(await isFolder(folder))) return json({ error: "that folder does not exist" }, 400)
  const prompt = String(body.prompt ?? "").trim()
  if (!body.send || !prompt) return json({ ok: await newInClient(folder, prompt) })
  // Auto unless the page asks for another mode.
  const mode = MODES.includes(String(body.mode)) ? String(body.mode) : "auto"
  const extra: string[] = []
  if (/^claude-[\w.-]+$/.test(String(body.model ?? ""))) extra.push("--model", String(body.model))
  if (EFFORTS.includes(String(body.effort))) extra.push("--effort", String(body.effort))
  if (body.worktree === true) {
    if (!(await repoInfo(folder)).branch) return json({ error: "A worktree needs a git repository: that folder is not one" }, 400)
    extra.push("--worktree")
    // Its name, when the page gives one (a ticket's "PP-3050-short-title").
    if (/^[A-Za-z0-9][\w.-]{0,59}$/.test(String(body.worktreeName ?? ""))) extra.push(String(body.worktreeName))
  }
  const suggestion = body.suggestion as { from?: unknown; taskId?: unknown } | undefined
  try {
    const id = await launch(folder, prompt, done => {
      void activate(done)
      void keepMode(done, mode)
    }, extra, mode)
    if (typeof suggestion?.from === "string" && isTaskId(suggestion.taskId)) await setSuggestion(suggestion.taskId, suggestion.from, { session: id })
    if (Array.isArray(body.tickets) && body.tickets.length) await applyAction(id, [id], "tickets", { started: body.tickets.slice(0, 20) })
    refreshSoon()
    return json({ ok: true, id })
  } catch (err) {
    return json({ error: errorMessage(err) }, 500)
  }
}

// "Catch me up": Claude summarises what the sessions did since the last one.
async function digest() {
  const state = await latestState()
  if (!state) return json({ error: "The board is not ready" }, 503)
  const items: DigestItem[] = state.cards.map(c => {
    const lead = groupOf(c.id)?.lead
    return {
      id: c.id, title: c.title, repo: c.repo, branch: c.branch, column: c.column, state: c.state, ask: c.ask,
      recap: cleanPrompt(lead?.summary) ?? null, lastPrompt: cleanPrompt(lead?.last_prompt) ?? null,
      progress: c.progress, prs: c.prs ?? [], lastActivity: c.lastActivity, waitingSince: c.waitingSince,
      isStale: c.isStale, isInterrupted: c.isInterrupted,
    }
  })
  try {
    return json({ ok: true, digest: await makeDigest(items) })
  } catch (err) {
    return json({ error: errorMessage(err) }, 500)
  }
}

// The task goes to the TASKS.md of the session's repository.
async function addSessionTask(body: Record<string, unknown>) {
  const text = String(body.text ?? "").trim()
  const session = typeof body.session === "string" ? body.session : null
  if (!text || !session) return json({ error: "missing text or session" }, 400)
  const cwd = groupOf(session)?.lead.cwd ?? (await readDesktop()).byCli.get(session)?.cwd
  const folder = cwd ? (await repoInfo(cwd)).root : null
  const ok = await addTask(text, folder, session)
  refreshSoon()
  return json({ ok })
}

// The raw-body routes: a file's bytes, or a recording's audio.
export async function handleUpload(req: Request, path: string): Promise<Response | null> {
  // Files: saved before the message that names them; shown back in the
  // conversation. The name travels URI-encoded in x-file-name.
  const upload = path.match(/^\/api\/sessions\/([\w-]+)\/upload$/)
  if (upload) {
    try {
      const name = decodeURIComponent(req.headers.get("x-file-name") ?? "")
      const length = Number(req.headers.get("content-length") ?? NaN)
      return json({ ok: true, path: await saveFile(upload[1]!, name, req.headers.get("content-type") ?? "", req.body, Number.isNaN(length) ? -1 : length) })
    } catch (err) {
      return json({ error: errorMessage(err) }, 400)
    }
  }
  // Dictation with Whisper: the audio of a recording in, its text out.
  if (path === "/api/transcribe") {
    try {
      return json({ ok: true, text: await transcribe(await req.arrayBuffer()) })
    } catch (err) {
      return json({ error: errorMessage(err) }, 500)
    }
  }
  return null
}

export async function handleWrite(path: string, body: Record<string, unknown>): Promise<Response | null> {
  // One step of the setup dialog, done only when the person asks for it.
  const step = path.match(/^\/api\/setup\/(\w+)$/)
  if (step) {
    try {
      await runStep(step[1]!, (body.options ?? {}) as Record<string, unknown>)
      refreshSoon()
      return json({ ok: true, ...(await setupStatus()) })
    } catch (err) {
      return json({ error: errorMessage(err) }, 400)
    }
  }
  switch (path) {
    // Jira: the details checked with Jira, then kept (the token in the keychain).
    case "/api/jira/connect":
      return await connect(body).then(r => json(r), (err: Error) => json({ error: err.message }, 400))
    // On a ticket assigned to you only (lib/jira.ts checks): a new status, a comment.
    case "/api/jira/move":
      return await moveTicket(String(body.key ?? ""), String(body.transition ?? "")).then(() => json({ ok: true }), (err: Error) => json({ error: err.message }, 400))
    case "/api/jira/comment":
      return await commentOn(String(body.key ?? ""), String(body.text ?? "")).then(() => json({ ok: true }), (err: Error) => json({ error: err.message }, 400))
    // The pipeline on a ticket of yours (lib/pipeline.ts): start a stage,
    // answer its questions (to Jira, then the stage again), start over.
    case "/api/pipeline/start":
      return await startPipeline(String(body.key ?? ""), body.take === true, isStage(body.stage) ? body.stage : undefined, Array.isArray(body.fix) ? body.fix.map(String) : undefined, typeof body.auto === "boolean" ? body.auto : undefined).then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    // Points of debt you chose: into one Jira ticket, dismissed, or open again.
    case "/api/pipeline/debt": {
      const action = body.action === "dismiss" || body.action === "reopen" ? body.action : "ticket"
      return await actOnDebt(Array.isArray(body.keys) ? body.keys.map(String) : [], action).then(r => (refreshSoon(), json({ ok: true, ...r })), (err: Error) => json({ error: err.message }, 400))
    }
    // Stop a pipeline that runs on its own: the next stage waits for you.
    case "/api/pipeline/auto":
      return await stopAuto(String(body.key ?? "")).then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    // Criteria the test could not try, checked by you by hand.
    case "/api/pipeline/checked":
      return await checkByHand(String(body.key ?? ""), Array.isArray(body.ids) ? body.ids.map(String) : []).then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    // A question to the agent about what its run left: it answers in the ticket.
    case "/api/pipeline/ask":
      return await askPipeline(String(body.key ?? ""), String(body.about ?? ""), String(body.text ?? "")).then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    case "/api/pipeline/answer":
      return await answerPipeline(String(body.key ?? ""), (body.answers ?? {}) as Record<string, string>).then(() => json({ ok: true }), (err: Error) => json({ error: err.message }, 400))
    // A release's step at hand: go on (with a tag of your own), or past it.
    case "/api/pipeline/step":
      return await stepPipeline(String(body.key ?? ""), String(body.step ?? ""), body.action === "skip" ? "skip" : "approve", typeof body.value === "string" ? body.value : undefined).then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    // Undo what a release did to an environment (staging or prod).
    case "/api/pipeline/rollback":
      return await rollBackPipeline(String(body.key ?? ""), body.env === "prod" ? "prod" : "staging").then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    // A job for one specialist (lib/jobs.ts): a ticket, and the PRs to the reviewer.
    case "/api/jobs/start":
      if (!isLoose(body.stage)) return json({ error: "That specialist takes no jobs yet" }, 400)
      return await startJob(body.stage, { ticket: body.ticket, prs: body.prs }).then(r => (refreshSoon(), json({ ok: true, ...r })), (err: Error) => json({ error: err.message }, 400))
    // A job's work, on in the pipeline; a review's findings you chose, to its PRs.
    case "/api/jobs/continue":
      return await continueJob(String(body.id ?? "")).then(r => (refreshSoon(), json({ ok: true, ...r })), (err: Error) => json({ error: err.message }, 400))
    case "/api/jobs/publish":
      return await publishReview(String(body.id ?? ""), Array.isArray(body.findings) ? body.findings.map(String) : []).then(r => (refreshSoon(), json({ ok: true, ...r })), (err: Error) => json({ error: err.message }, 400))
    case "/api/jobs/clear":
      return await clearJob(String(body.id ?? "")).then(() => (refreshSoon(), json({ ok: true })), (err: Error) => json({ error: err.message }, 400))
    case "/api/pipeline/reset":
      return await resetPipeline(String(body.key ?? "")).then(() => json({ ok: true }), (err: Error) => json({ error: err.message }, 400))
    case "/api/jira/disconnect":
      await disconnect()
      return json({ ok: true })
    // The app's icon: kept, named by the manifest, and put on the installed app in the Dock.
    case "/api/app-icon": {
      if (!isIcon(body.icon)) return json({ error: "No such icon" }, 400)
      return json(await chooseIcon(body.icon))
    }
    // Pets: a pack opened, the pet that walks the board (null: none).
    case "/api/pets/open": {
      const opened = await openPack()
      return typeof opened === "string" ? json({ error: opened }, 400) : json(opened)
    }
    case "/api/pets/choose": {
      const chosen = await choosePet(body.id ?? null)
      return typeof chosen === "string" ? json({ error: chosen }, 400) : json(chosen)
    }
    // The commands sessions left running and nobody uses, all stopped.
    case "/api/memory/stopforgotten": {
      const stopped = await stopForgotten()
      setTimeout(() => void rescan(knownSessionIds()).then(refreshSoon), 1500)
      return json({ ok: true, stopped })
    }
    // A context file (~/.claude/CLAUDE.md or a project's memory), saved from its dialog.
    case "/api/context": {
      const saved = await writeContext(body.path, body.text, body.version)
      if (saved === "changed") return json({ error: "The file changed on disk since you opened it. Reload it to see the newer version." }, 409)
      return typeof saved === "string" ? json({ error: saved }, 400) : json(saved)
    }
    // After a `git pull`: what runs old code, brought up to date (lib/freshness.ts).
    case "/api/update":
      try {
        return json(await update())
      } catch (err) {
        return json({ error: errorMessage(err) }, 500)
      }
    // The read-aloud setting's "Try it".
    case "/api/speak/sample":
      await speakSample({ voice: body.voice, rate: body.rate })
      return json({ ok: true })
    case "/api/speak/stop":
      stopSpeaking()
      return json({ ok: true })
    case "/api/uploads/open":
      return json({ ok: await openFolder() })
    case "/api/pick-folder":
      return json({ ok: true, folder: await pickFolder() })
    // A view in the page that broke (components/common/Guard.tsx).
    case "/api/clienterror":
      await logClientError(body)
      return json({ ok: true })
    // The page's memory, every 10 minutes (lib/memory-log.ts, logs/memory.jsonl).
    case "/api/memory":
      await logMemory(body)
      return json({ ok: true })
    case "/api/new":
      return newSession(body)
    case "/api/digest":
      return digest()
    case "/api/canvas/zones": {
      if (!Array.isArray(body.zones)) return json({ error: "missing zones" }, 400)
      const zones = await setZones(body.zones)
      refreshSoon()
      return json({ ok: true, zones })
    }
    case "/api/canvas/notes": {
      if (!Array.isArray(body.notes)) return json({ error: "missing notes" }, 400)
      const notes = await setNotes(body.notes)
      refreshSoon()
      return json({ ok: true, notes })
    }
    case "/api/prs/action": {
      const res = await prAction(String(body.url ?? ""), String(body.action ?? "") as never, {
        method: ["squash", "merge", "rebase"].includes(String(body.method)) ? (body.method as never) : "squash",
        deleteBranch: body.deleteBranch === true,
      })
      refreshSoon()
      return json(res, res.ok ? 200 : 409)
    }
    case "/api/tasks/close":
    case "/api/tasks/reopen": {
      const task = [String(body.file ?? ""), Number(body.line), String(body.text ?? "")] as const
      const ok = path.endsWith("close") ? await closeTask(...task) : await reopenTask(...task)
      refreshSoon()
      return ok ? json({ ok }) : json({ error: "The task has changed. Reload and try again." }, 409)
    }
    case "/api/tasks/add":
      return addSessionTask(body)
  }
  return null
}
