// What the page does to one session (POST /api/sessions/<id>/<action>):
// messages through the bridge mod, answers, stop, settings, waking and
// opening it in the client, forks, runs, and the board's own actions (pin,
// park, done, archive, seen, move, rename, color, tier).

import { applyAction, isBoardAction, isTaskId, setSuggestion } from "../lib/board"
import { answer as answerQuestion, isBusy, permit, requestSettings, send as sendMessage, status as bridgeStatus, stop as stopTurn, unsend } from "../lib/bridge"
import { activate, openInClient } from "../lib/client"
import { isArchivedInApp, readDesktop } from "../lib/desktop"
import { commandStatus, runCommand, stopCommand } from "../lib/commands"
import { EFFORTS, MODES } from "../lib/config"
import { saveCode } from "../lib/code"
import { forkPoint } from "../lib/fork"
import { errorMessage, json } from "../lib/http"
import { launch } from "../lib/launch"
import { latestJson, latestState, refreshSoon } from "../lib/live"
import { rescan, stopProcess } from "../lib/memory"
import { saveCommand, start as startRun, status as runStatus, stop as stopRun } from "../lib/runner"
import { sessionFile } from "../lib/session-files"
import { speakTurn, type Kind } from "../lib/speech"
import { groupOf, knownSessionIds } from "../lib/snapshot"
import { wokeNow } from "../lib/wake"

async function send(id: string, body: Record<string, unknown>) {
  if (await isArchivedInApp(groupOf(id)?.ids ?? [id]))
    return json({ error: "This session is archived in Claude: unarchive it there (Open in Claude), then write" }, 409)
  try {
    const messageId = await sendMessage(id, String(body.text ?? ""))
    refreshSoon()
    const bridge = await bridgeStatus(id)
    // A closed session is woken up so the message does not wait for you;
    // one in a long tool run (no heartbeat meanwhile) is only busy.
    const woke = !bridge.isOpen && !isBusy(bridge) ? await activate(id) : null
    if (woke?.ok) wokeNow(id)
    return json({ ok: true, messageId, ...bridge, activated: !!woke?.ok })
  } catch (err) {
    return json({ error: errorMessage(err) }, 400)
  }
}

// "Fork": a new session with the conversation up to before one message.
async function fork(id: string, body: Record<string, unknown>) {
  const prompt = String(body.prompt ?? "").trim()
  const group = groupOf(id)
  if (!prompt || !group) return json({ error: "missing message or session" }, 400)
  const point = await forkPoint([id, ...group.ids.filter(x => x !== id)], String(body.messageId ?? ""))
  if (!point) return json({ error: "Cannot find that message in the conversation" }, 404)
  const resume = point.answerId ? ["--resume", point.sessionId, "--fork-session", "--resume-session-at", point.answerId] : []
  // The copy keeps the original's permission mode: one in plan or ask mode
  // must not start editing on its own.
  const mode = MODES.includes(String(group.lead.mode)) ? String(group.lead.mode) : "default"
  try {
    const forked = await launch(group.lead.cwd, prompt, done => void activate(done), resume, mode)
    refreshSoon()
    return json({ ok: true, id: forked })
  } catch (err) {
    return json({ error: errorMessage(err) }, 500)
  }
}

// Permission mode, model and effort, changed through the session's mod (v4).
async function settings(id: string, body: Record<string, unknown>) {
  const bridge = await bridgeStatus(id)
  if (bridge.version < 4)
    return json({ error: "This session started with an older bridge mod: close it and open it again to change this from here" }, 409)
  const pick = (key: string, allowed: string[]) => (allowed.includes(String(body[key])) ? String(body[key]) : undefined)
  const changes = {
    mode: pick("mode", MODES),
    model: typeof body.model === "string" && /^[\w.\[\]-]{2,60}$/.test(body.model) ? body.model : undefined,
    effort: pick("effort", EFFORTS),
  }
  if (!changes.mode && !changes.model && !changes.effort) return json({ error: "nothing to change" }, 400)
  // In Auto, the classifier lets the app's tool change the mode only when the
  // conversation asks for it (a change from the mod gets no verdict): there
  // the change goes as your message, and Claude makes it.
  let messageId: string | null = null
  if (changes.mode && (await readDesktop()).byCli.get(groupOf(id)?.id ?? id)?.permissionMode === "auto") {
    messageId = await sendMessage(id, `Switch this session's permission mode to ${changes.mode} with set_session_permission_mode (session_id "self"). Change nothing else, and answer in one line.`)
    changes.mode = undefined
    refreshSoon()
  }
  const requestId = changes.mode || changes.model || changes.effort ? await requestSettings(id, changes) : null
  return json({ ok: true, requestId, messageId, isOpen: bridge.isOpen })
}

export async function handleSession(id: string, action: string, body: Record<string, unknown>): Promise<Response> {
  // Right after a restart no snapshot has run yet: the sessions are unknown.
  if (!groupOf(id)) await latestJson()
  switch (action) {
    case "send":
      return send(id, body)
    case "fork":
      return fork(id, body)
    case "settings":
      return settings(id, body)
    case "run": {
      const group = groupOf(id)
      const command = String(body.command ?? "").trim()
      if (!group || !command) return json({ error: "missing command" }, 400)
      await saveCommand(group.root, command)
      await startRun(id, group.lead.cwd, command)
      refreshSoon()
      return json({ ok: true, run: await runStatus(id) })
    }
    case "stoprun":
      await stopRun(id)
      setTimeout(refreshSoon, 1500)
      return json({ ok: true })
    // "▶" on a shell block: the command runs in the session's folder.
    case "exec": {
      const group = groupOf(id)
      const command = String(body.command ?? "").trim()
      if (!group || !command) return json({ error: "missing command or session" }, 400)
      try {
        return json({ ok: true, command: runCommand(id, group.lead.cwd, command) })
      } catch (err) {
        return json({ error: errorMessage(err) }, 403)
      }
    }
    case "execstatus": {
      const command = commandStatus(id, String(body.commandId ?? ""))
      return command ? json({ ok: true, command }) : json({ error: "unknown command" }, 404)
    }
    case "execstop":
      return json({ ok: await stopCommand(id, String(body.commandId ?? "")) })
    // Stop something the session started (a dev server left running), from
    // its memory reading; never the session's own process.
    case "stopprocess": {
      const ok = await stopProcess(groupOf(id)?.ids ?? [id], Number(body.pid))
      if (!ok) return json({ error: "That process is not one this session started" }, 404)
      setTimeout(() => void rescan(knownSessionIds()).then(refreshSoon), 1500)
      return json({ ok })
    }
    // The answer to the question the session asks, given on the board.
    case "answer":
      try {
        await answerQuestion(id, String(body.id ?? ""), (body.answers ?? {}) as Record<string, string>)
        refreshSoon()
        return json({ ok: true })
      } catch (err) {
        return json({ error: errorMessage(err) }, 409)
      }
    // Allow or deny, on the board, the tool approval the client asks for.
    case "permit":
      try {
        await permit(id, String(body.id ?? ""), String(body.decision ?? ""))
        refreshSoon()
        return json({ ok: true })
      } catch (err) {
        return json({ error: errorMessage(err) }, 409)
      }
    case "unsend": {
      const ok = await unsend(id, String(body.messageId ?? ""))
      refreshSoon()
      return ok ? json({ ok }) : json({ error: "Already delivered: it cannot be undone" }, 409)
    }
    case "stop": {
      const bridge = await bridgeStatus(id)
      if (bridge.version < 2)
        return json({ error: "This session started with an older bridge mod: close it and open it again to stop it from here" }, 409)
      await stopTurn(id)
      refreshSoon()
      return json({ ok: true })
    }
    case "activate": {
      const res = await activate(id)
      if (res.ok) wokeNow(id)
      return json(res, res.ok ? 200 : 409)
    }
    case "open": {
      const res = await openInClient(id)
      return json(res, res.ok || !res.error ? 200 : 409)
    }
    // One of the session's files in its own app on the Mac (Word, Excel…),
    // or shown in Finder (reveal).
    case "openfile": {
      const group = groupOf(id)
      const file = await sessionFile(group?.ids ?? [id], String(body.path ?? ""), group ? [group.lead.cwd, group.root] : [])
      if (!file) return json({ error: "This session does not name that file, or it is gone" }, 404)
      const opened = (await Bun.spawn(["/usr/bin/open", ...(body.reveal ? ["-R"] : []), file.path]).exited) === 0
      return json(opened ? { ok: true } : { error: "macOS could not open it" }, opened ? 200 : 500)
    }
    // A file edited in the "Code" tab, saved if nobody changed it meanwhile.
    case "codesave": {
      const group = groupOf(id)
      if (!group || typeof body.text !== "string") return json({ error: "nothing to save" }, 400)
      const { status = 200, ...res } = await saveCode(group.lead.cwd, String(body.path ?? ""), body.text, Number(body.mtime), body.force === true)
      return json(res, status)
    }
    // A task the session suggested, dismissed on the board (or back again).
    case "suggestion": {
      if (!isTaskId(body.taskId)) return json({ error: "missing task" }, 400)
      await setSuggestion(body.taskId, id, { isDismissed: body.isDismissed !== false })
      return json({ ok: true })
    }
    // Its turn ended, or it asks you: read aloud what it did (lib/speech.ts).
    case "speak": {
      const group = groupOf(id)
      const card = (await latestState())?.cards.find(c => c.id === (group?.id ?? id))
      const kind: Kind = body.kind === "ask" || body.kind === "permission" ? body.kind : "done"
      const said = await speakTurn(group?.id ?? id, card?.title ?? "Una sesión", kind, { voice: body.voice, rate: body.rate })
      return json({ ok: true, said })
    }
  }
  if (!isBoardAction(action)) return json({ error: `unknown action: ${action}` }, 400)
  const group = groupOf(id)
  const error = await applyAction(group?.key ?? id, group?.ids ?? [], action, body)
  if (error) return json({ error }, 400)
  refreshSoon()
  return json({ ok: true })
}
