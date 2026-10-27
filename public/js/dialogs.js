// The app's dialogs: "New session" (a folder, a first prompt with files, and
// the first turn's mode, model and effort), the keyboard shortcuts, and
// "Catch me up" (a summary of what the sessions did since the last one).
import { html, useContext, useEffect, useRef, useState } from "../vendor/preact-htm.js"
import { AttachButton, Attachments, uploadFile, useAttachments, withFiles } from "./attachments.js"
import { StateIcon } from "./components.js"
import { EFFORTS, MODELS, MODES, Picker } from "./composer.js"
import { Ctx, Kbd } from "./ctx.js"
import { Icon } from "./icons.js"
import { MicButton, useWhisper } from "./mic.js"
import { get, hue, keep, load, post, when } from "./util.js"

// A folder from the list (repos and folders used before) or any folder on the
// Mac ("Browse…", the system's picker); the first turn's mode, model and
// effort (remembered for next time); files, as in the reply box; and, in a
// git repository, a new worktree for it. `draft`: a task a session suggested
// ({ root, prompt, worktree, suggestion }), started from its card.
export function NewSession({ initialRoot, draft, onClose }) {
  const ui = useContext(Ctx)
  const [repos, setRepos] = useState(null)
  const [filter, setFilter] = useState("")
  const [root, setRoot] = useState(draft?.root ?? initialRoot)
  // a folder chosen with "Browse…" (or the suggested task's)
  const [picked, setPicked] = useState(draft?.root ? { root: draft.root, name: draft.root.split("/").pop() || draft.root } : null)
  const [prompt, setPrompt] = useState(draft?.prompt ?? "")
  const [worktree, setWorktree] = useState(!!draft?.worktree)
  const [prefs, setPrefs] = useState(() => ({ mode: "auto", model: "claude-fable-5-1", effort: "high", ...load("newPrefs", {}) }))
  const attach = useAttachments()
  const files = attach.files
  const whisper = useWhisper()
  const dialog = useRef()
  useEffect(() => {
    dialog.current.showModal()
    get("/api/repos").then(res => {
      const list = res?.repos ?? []
      setRepos(list)
      setRoot(r => r ?? list[0]?.root ?? null)
    })
  }, [])
  const setPref = (key, value) => setPrefs(p => (keep("newPrefs", { ...p, [key]: value }), { ...p, [key]: value }))
  const all = [...(picked && !(repos ?? []).some(r => r.root === picked.root) ? [picked] : []), ...(repos ?? [])]
  const shown = all.filter(r => !filter || `${r.name} ${r.root}`.toLowerCase().includes(filter.toLowerCase()))
  const explore = async () => {
    const res = await post("/api/pick-folder")
    if (!res.body.ok) return ui.toast(res.body.error ?? "Could not open the folder picker")
    if (!res.body.folder) return
    const folder = res.body.folder
    setPicked({ root: folder, name: folder.split("/").pop() || folder })
    setFilter("")
    setRoot(folder)
  }
  const [isSending, setSending] = useState(false)
  const hasContent = !!prompt.trim() || files.length > 0
  const submit = async (send = hasContent) => {
    if (!root || isSending) return
    setSending(true)
    // The session has no id yet: its files wait in a folder of their own.
    let paths = []
    try {
      const folder = `new-${crypto.randomUUID().slice(0, 8)}`
      for (const f of files) paths.push(await uploadFile(folder, f.file))
    } catch (err) {
      setSending(false)
      return ui.toast(err.message)
    }
    const ok = await ui.newSession(root, withFiles(prompt.trim(), paths), send,
      { ...prefs, worktree: send && worktree, suggestion: send ? draft?.suggestion : undefined })
    setSending(false)
    if (ok) onClose()
  }
  return html`<dialog class="dialog new-session" ref=${dialog} onClose=${onClose} onCancel=${onClose}>
    <form method="dialog" onSubmit=${e => (e.preventDefault(), submit())} ...${attach.dropProps}>
      <h2>${draft?.suggestion ? "Start the suggested task" : "New session"}</h2>
      <div class="folder-row">
        <input class="field" placeholder="Filter folders…" value=${filter} autofocus
          onInput=${e => {
            setFilter(e.target.value)
            const q = e.target.value.toLowerCase()
            const first = all.find(r => `${r.name} ${r.root}`.toLowerCase().includes(q))
            if (first) setRoot(first.root)
          }}
          onKeyDown=${e => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
            e.preventDefault()
            const i = shown.findIndex(r => r.root === root)
            const next = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]
            if (next) {
              setRoot(next.root)
              requestAnimationFrame(() => document.querySelector(".picker .on")?.scrollIntoView({ block: "nearest" }))
            }
          }} />
        <button type="button" class="btn" onClick=${explore} title="Pick any folder on the Mac with the system picker">
          <${Icon} name="search" size=${14} />Browse…</button>
      </div>
      <div class="picker" role="listbox">
        ${!repos && html`<p class="muted">Loading folders…</p>`}
        ${shown.map(
          r => html`<button type="button" key=${r.root} role="option" aria-selected=${root === r.root}
            class=${root === r.root ? "on" : ""} onClick=${() => setRoot(r.root)}>
            <i class="swatch" style=${`--hue:${hue(r.name)}`}></i><b>${r.name}</b><span class="muted ellipsis">${r.root}</span>
          </button>`,
        )}
      </div>
      <div class="prompt-box">
        <${Attachments} files=${files} onRemove=${attach.remove} />
        <textarea class="field" rows="4" placeholder=${whisper ? "What you want Claude to do (optional) — or dictate it" : "What you want Claude to do (optional)"} value=${prompt}
          onInput=${e => setPrompt(e.target.value)} onPaste=${attach.onPaste}
          onKeyDown=${e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), submit())}></textarea>
        <div class="prompt-tools">
          <${AttachButton} onFiles=${attach.add} />
          ${whisper && html`<${MicButton} onError=${ui.toast} onText=${heard => setPrompt(p => (p && !/\s$/.test(p) ? `${p} ` : p) + heard)} />`}
          <span class="tools-sep"></span>
          <${Picker} icon="lock" value=${prefs.mode} options=${MODES} onPick=${v => setPref("mode", v)} title="Permission mode for the first turn" />
          <${Picker} icon="bot" value=${prefs.model} options=${MODELS} onPick=${v => setPref("model", v)} title="Model" />
          <${Picker} icon="gauge" value=${prefs.effort} options=${EFFORTS} onPick=${v => setPref("effort", v)} title="Effort for the first turn" />
          <label class="worktree-toggle" title="Runs in a new git worktree of the folder (.claude/worktrees), on a branch of its own, as Claude desktop does: your checkout is left as it is. Only when you send.">
            <input type="checkbox" checked=${worktree} onChange=${e => setWorktree(e.target.checked)} /><${Icon} name="branch" size=${13} />Worktree</label>
        </div>
      </div>
      <div class="dialog-actions">
        <span class="muted">${hasContent
          ? "Send: the first turn runs here, headless, with this mode, model and effort, and the session shows up at once. Open it in Claude when you want."
          : "Without a prompt, it opens in Claude for you to write there (with Claude's settings)."}</span>
        <button type="button" class="btn" onClick=${() => submit(false)} disabled=${!root || isSending}>Open in Claude</button>
        <button type="submit" class="btn primary" disabled=${!root || !hasContent || isSending}>
          ${isSending ? "Launching…" : "Send"} <${Kbd}>⌘↵<//></button>
      </div>
    </form>
  </dialog>`
}

// ---------- keyboard shortcuts ----------

const SHORTCUTS = [
  ["Move", [["J", "K"], ["↓", "↑"]]],
  ["Open conversation", [["↵"]]],
  ["Reply", [["R"]]],
  ["Rename", [["T"]]],
  ["Open in Claude", [["O"]]],
  ["Pin", [["P"]]],
  ["Colour", [["C"], ["0–7"]]],
  ["Later", [["A"], ["1–5"]]],
  ["Mark as done", [["E"]]],
  ["Undo", [["Z"]]],
  ["Search", [["/"], ["⌘", "K"]]],
  ["Inbox · Board · Canvas · Tiers", [["1"], ["2"], ["3"], ["4"]]],
  ["Tiers: one row up · down", [["["], ["]"]]],
  ["Lanes per repo", [["G"]]],
  ["Next up: what waits for you", [["F"]]],
  ["New session", [["N"]]],
  ["Catch me up", [["D"]]],
  ["Stop the running turn", [["S"]]],
  ["Mark to review", [["U"]]],
  ["Canvas: zoom in · zoom out · fit", [["+"], ["−"], ["0"]]],
  ["Canvas: move the view (hold and drag)", [["Space"]]],
  ["Close", [["Esc"]]],
]

export function Help({ onClose }) {
  const dialog = useRef()
  useEffect(() => dialog.current.showModal(), [])
  return html`<dialog class="dialog help" ref=${dialog} onClose=${onClose} onCancel=${onClose}
    onClick=${e => e.target === dialog.current && onClose()}>
    <h2>Keyboard shortcuts</h2>
    <dl>
      ${SHORTCUTS.map(
        ([label, combos]) => html`<div key=${label}><dt>${label}</dt><dd>
          ${combos.map((keys, i) => html`${i > 0 && html`<span class="muted">or</span>`}${keys.map(k => html`<${Kbd}>${k}<//>`)}`)}
        </dd></div>`,
      )}
    </dl>
  </dialog>`
}

// ---------- "Catch me up" ----------

const DIGEST_GROUPS = [
  ["waiting", "Waiting for you"],
  ["stuck", "Stuck"],
  ["finished", "Finished"],
  ["running", "Running"],
  ["later", "For later"],
]

function DigestRow({ entry, onOpen }) {
  return html`<button class="digest-row" onClick=${() => onOpen(entry.id)} title="Open the conversation">
    <${StateIcon} card=${entry.card} size=${26} />
    <span class="digest-main">
      <span class="digest-title">${entry.title}<span class="digest-repo">${entry.repo}</span></span>
      ${entry.line && html`<span class="digest-line">${entry.line}</span>`}
    </span>
    ${entry.next && html`<span class="digest-next">${entry.next}</span>`}
  </button>`
}

export function Digest({ onClose }) {
  const ui = useContext(Ctx)
  const dialog = useRef()
  const [digest, setDigest] = useState(undefined) // undefined: loading the last one
  const [isWriting, setWriting] = useState(false)
  const [error, setError] = useState(null)
  // Writing takes seconds: the dialog may be closed before the answer comes.
  const alive = useRef(true)
  useEffect(() => (dialog.current.showModal(), () => (alive.current = false)), [])

  const write = async () => {
    setWriting(true)
    setError(null)
    const res = await post("/api/digest")
    if (!alive.current) return
    setWriting(false)
    if (res.body.ok) setDigest(res.body.digest)
    else setError(res.body.error ?? "Could not write the summary")
  }
  // The last one when it is from the last hour and in the current format; a new one otherwise.
  useEffect(() => {
    get("/api/digest").then(res => {
      if (!alive.current) return
      const last = res?.digest ?? null
      const isCurrent = last?.entries && Date.now() - last.at < 60 * 60_000
      setDigest(isCurrent ? last : null)
      if (!isCurrent) write()
    })
  }, [])

  const open = id => (onClose(), ui.openReader(id))
  const entries = digest?.entries ?? []
  const focus = digest?.focus && entries.find(e => e.id === digest.focus.id)

  return html`<dialog class="dialog digest" ref=${dialog} onClose=${onClose} onCancel=${onClose}
    onClick=${e => e.target === dialog.current && onClose()}>
    <header class="digest-head">
      <h2><${Icon} name="sun" size=${18} />Catch me up</h2>
      ${digest && html`<span class="muted">Since ${when(digest.since)}</span>`}
      <button class="btn" disabled=${isWriting} onClick=${write} title="A new summary since the last one">
        ${isWriting ? html`<span class="spinner small"></span>Reading…` : "Refresh"}</button>
    </header>
    ${error && html`<p class="digest-error">${error}</p>`}
    ${!digest && isWriting && html`<div class="digest-wait"><span class="spinner"></span>Claude reads what your sessions did. It takes about 10 seconds.</div>`}
    ${digest && html`<div class=${`digest-body ${isWriting ? "stale" : ""}`}>
      <div class="digest-counts">
        ${DIGEST_GROUPS.map(([key, label]) => {
          const n = entries.filter(e => e.group === key).length
          return n > 0 && html`<span class=${`digest-count g-${key}`}><b>${n}</b> ${label.toLowerCase()}</span>`
        })}
        ${entries.length === 0 && html`<span class="muted">Nothing new since the last summary.</span>`}
      </div>
      ${focus && html`<button class="digest-focus" onClick=${() => open(focus.id)}>
        <span class="digest-focus-label">Start with</span>
        <span class="digest-title">${focus.title}</span>
        <span class="digest-line">${digest.focus.why}</span>
      </button>`}
      ${DIGEST_GROUPS.map(([key, label]) => {
        const list = entries.filter(e => e.group === key)
        return list.length > 0 && html`<section class="digest-group" key=${key}>
          <h3>${label}</h3>
          ${list.map(e => html`<${DigestRow} key=${e.id} entry=${e} onOpen=${open} />`)}
        </section>`
      })}
    </div>`}
    <p class="muted digest-foot">A separate request to Claude with your account: it does not open or touch your sessions. It covers what happened since the last summary and what still waits for you.</p>
  </dialog>`
}
