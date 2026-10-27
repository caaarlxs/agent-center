// Messages for a session Claude desktop does not start: it runs as many
// sessions as the Mac's memory allows and turns down every background start
// past that (lib/wake.ts). The board then runs the turn itself, as it does a
// new session's first one: Claude Code resumes the same session headless
// (`--resume`, same id and transcript) in its folder, with its permission
// mode, model and effort, and the messages as one prompt. The client shows
// the turn when it opens the session again; while it runs, the board does not
// open it there (lib/client.ts), so no two processes share the transcript.

import { putBack, takeQueued } from "./bridge"
import { EFFORTS, MODES } from "./config"
import { readDesktop } from "./desktop"
import { launch, running } from "./launch"
import { refreshSoon } from "./live"
import { groupOf } from "./snapshot"

export async function deliverHere(id: string): Promise<boolean> {
  const group = groupOf(id)
  if (!group || running.has(id)) return false
  const messages = await takeQueued(id)
  if (!messages.length) return false
  const app = (await readDesktop()).byCli.get(id)
  const extra = ["--resume", id]
  if (app?.model && /^claude-[\w.-]+$/.test(app.model)) extra.push("--model", app.model)
  if (app?.effort && EFFORTS.includes(app.effort)) extra.push("--effort", app.effort)
  // As a fork: a session in plan or ask mode must not start editing on its own.
  const asked = app?.permissionMode ?? group.lead.mode
  const mode = MODES.includes(String(asked)) ? String(asked) : "default"
  try {
    const ran = await launch(group.lead.cwd, messages.map(m => m.text).join("\n\n"), () => refreshSoon(), extra, mode)
    if (ran !== id) console.error(`delivered here: Claude Code resumed ${id} as ${ran}`)
    console.log(`delivered ${messages.length} message(s) to ${id} here: Claude desktop is at its cap`)
    refreshSoon()
    return true
  } catch (err) {
    console.error(`could not deliver to ${id} here: ${err}`)
    await putBack(id, messages)
    return false
  }
}
