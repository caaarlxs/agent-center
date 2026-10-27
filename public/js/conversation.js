// The "Conversation" tab: the session's transcript, read live (new lines every
// few seconds, older ones on demand), shaped as the desktop app shows it: the
// person's messages (pasted text folded, sent files as pictures or chips),
// Claude's answers, tool runs, plans, "next step" boxes, questions with
// options (answered from here through the bridge mod), tasks it suggests for
// a session of their own (started from here), and the messages sent from here
// that the session has not received yet. A message can be forked into a new
// session.
import { html, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "../vendor/preact-htm.js"
import { ATTACH_LINES, IMAGE_FILE, UPLOAD_RE, fileName } from "./attachments.js"
import { BackgroundBox, permit } from "./components.js"
import { Ctx, Kbd } from "./ctx.js"
import { ArtifactCard, FileChips } from "./files.js"
import { Icon } from "./icons.js"
import { clock, get, md, post } from "./util.js"

const FOLLOW_MS = 2000

// "Run" on a shell block (Setup → Run commands): the command runs on this Mac
// in the session's folder (lib/commands.ts), no terminal opens; its output
// shows under the block while it runs, with a button to stop it. The blocks
// are markdown HTML (util.js md), so one listener on the conversation serves
// them all.
async function onCodeClick(e, sessionId) {
  const run = e.target.closest?.(".code-run")
  const stop = e.target.closest?.(".code-stop")
  if (stop) {
    stop.disabled = true
    await post(`/api/sessions/${sessionId}/execstop`, { commandId: stop.closest(".code-out").dataset.command })
    return
  }
  if (!run || run.disabled) return
  const box = run.closest(".code-box")
  const command = box.querySelector("pre")?.innerText.trim()
  if (!command) return
  box.querySelector(".code-out")?.remove()
  const out = document.createElement("div")
  out.className = "code-out"
  out.innerHTML = `<div class="code-out-head"><span class="dot run"></span><span class="grow">Running in the session's folder…</span><button type="button" class="link-btn code-stop">Stop</button></div><pre class="code-log"></pre>`
  box.append(out)
  const head = out.querySelector(".code-out-head")
  const log = out.querySelector(".code-log")
  const end = (tone, text) => (head.innerHTML = `<span class="${tone}">●</span><span class="grow"></span>`, (head.querySelector(".grow").textContent = text), (run.disabled = false))
  run.disabled = true
  const started = await post(`/api/sessions/${sessionId}/exec`, { command })
  if (!started.body.ok) return end("bad", started.body.error ?? "Could not run it")
  out.dataset.command = started.body.command.id
  while (out.isConnected) {
    const { body } = await post(`/api/sessions/${sessionId}/execstatus`, { commandId: out.dataset.command })
    const c = body.command
    if (!c) return end("bad", body.error ?? "The command is gone")
    const isAtEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 8
    if (log.textContent !== c.output) log.textContent = c.output
    if (isAtEnd) log.scrollTop = log.scrollHeight
    if (!c.isRunning) {
      const took = Math.max(1, Math.round((c.endedAt - c.startedAt) / 1000))
      return c.wasStopped ? end("bad", `Stopped after ${took} s`) : end(c.exitCode === 0 ? "ok" : "bad", `${c.exitCode === 0 ? "Done" : `Ended with code ${c.exitCode}`} in ${took} s`)
    }
    await new Promise(r => setTimeout(r, 800))
  }
  run.disabled = false
}

// The task list moving on: same rules as the server's applyPlanOp.
function applyPlanOp(steps, op) {
  const next = steps.map(s => ({ ...s }))
  if (op.finish) for (const s of next) if (s.status === "in_progress") s.status = "completed"
  for (const n of op.done ?? []) if (next[n - 1]) next[n - 1].status = "completed"
  if (op.advance) {
    const i = next.findIndex(s => s.status === "in_progress")
    if (i >= 0) next[i].status = "completed"
    const j = next.findIndex(s => s.status === "pending")
    if (j >= 0) next[j].status = "in_progress"
  }
  if (op.start && next[op.start - 1]) {
    for (const s of next) if (s.status === "in_progress") s.status = "pending"
    next[op.start - 1].status = "in_progress"
  }
  return next
}

// A live read can start in the middle of a run of tool calls: join them; a
// step of the task list updates the list already shown.
function append(items, more) {
  let out = items
  for (const item of more) {
    const last = out.at(-1)
    if (item.kind === "planStep") {
      const at = out.findLastIndex(i => i.kind === "plan")
      if (at >= 0) out = out.map((i, k) => (k === at ? { ...i, steps: applyPlanOp(i.steps, item.op) } : i))
    } else if (last?.kind === "tools" && item.kind === "tools") out = [...out.slice(0, -1), { ...last, lines: [...last.lines, ...item.lines] }]
    else out = [...out, item]
  }
  return out
}

const squash = t => String(t ?? "").replace(/\s+/g, " ").trim()

// As the app shows a turn: one "next step" box (the last one sent), at the
// end of the turn, with the button the person picked when their next message
// is that button's text (a template counts when the message starts with it).
function normalize(items) {
  const out = []
  let next = null
  const close = reply => {
    if (!next) return
    const pick = reply && next.actions?.find(a => {
      const m = squash(a.message)
      return m && (squash(reply.text) === m || (/[:…]$/.test(m) && squash(reply.text).startsWith(m)))
    })
    out.push(pick ? { ...next, picked: pick.label } : next)
    next = null
  }
  let planAt = -1 // the turn's task list: a rewritten list replaces it
  // Suggestions Claude took back (dismiss_task) say so.
  const gone = new Set(items.filter(i => i.kind === "suggestionGone").map(i => i.taskId))
  for (const item of items) {
    const last = out.at(-1)
    if (item.kind === "suggestionGone") continue
    if (item.kind === "suggestion" && gone.has(item.taskId)) out.push({ ...item, isGone: true })
    else if (item.kind === "next") next = item
    else if (item.kind === "user" && !item.isMidTurn) (close(item), out.push(item), (planAt = -1))
    else if (item.kind === "plan") {
      if (planAt >= 0) out.splice(planAt, 1)
      planAt = out.length
      out.push(item)
    }
    // Tool runs split only by invisible steps (task list moves) are one run.
    else if (item.kind === "tools" && last?.kind === "tools") out[out.length - 1] = { ...last, lines: [...last.lines, ...item.lines] }
    else out.push(item)
  }
  close(null)
  return out
}

function Plan({ item }) {
  const done = item.steps.filter(s => s.status === "completed").length
  return html`<div class="msg plan">
    <div class="plan-head"><${Icon} name="tasks" size=${13} />Plan<span class="muted">${done}/${item.steps.length}</span></div>
    <ul>${item.steps.map(
      (s, i) => html`<li key=${i} class=${s.status}><i></i><span>${s.content}</span></li>`,
    )}</ul>
  </div>`
}

// The app's own answers, in the person's words where the shape is known.
function dialogAnswer(text) {
  const branch = text.match(/new branch named ([^\s.]+)/i)
  if (branch) return `New branch: ${branch[1]}`
  if (/stay|current branch/i.test(text) && /branch/i.test(text)) return "Stay on the current branch"
  return text
}

// What only the desktop app can answer: why, and the button that opens it there.
function AnswerInApp({ sessionId, why }) {
  const ui = useContext(Ctx)
  return html`<div class="answer-in-app">
    <span class="muted small">${why}</span>
    <button class="btn primary" onClick=${() => ui.launch(sessionId)}>Answer in Claude <${Icon} name="external" size=${13} /></button>
  </div>`
}

// A component that waits for the person in the desktop app.
function Dialog({ item, sessionId }) {
  return html`<div class="msg next question-card">
    <p class="next-ask"><span>?</span>${item.label}</p>
    ${item.detail && (item.isLong
      ? html`<details class="paste"><summary>Show the plan</summary><div class="md plan-text" dangerouslySetInnerHTML=${{ __html: md(item.detail) }}></div></details>`
      : html`<p class="muted small">${item.detail}</p>`)}
    ${item.answer
      ? html`<p class="answer"><b>Your answer:</b> ${dialogAnswer(item.answer)}</p>`
      : html`<${AnswerInApp} sessionId=${sessionId} why="You can answer this only in Claude desktop." />`}
  </div>`
}

// A task Claude suggests for a session of its own (spawn_task), as the chip
// in Claude desktop: Start opens "New session" with its prompt and folder (in
// a new worktree), Dismiss puts it away. `state`: what became of it, here or
// in the app ({ state: "started" | "dismissed", session }).
function Suggestion({ item, sessionId, state, onDismiss }) {
  const ui = useContext(Ctx)
  const repo = item.folder?.split("/").pop()
  const start = () => ui.startSuggestion({ root: item.folder, prompt: item.prompt, worktree: true, suggestion: { from: sessionId, taskId: item.taskId } })
  return html`<div class=${`msg suggestion ${state || item.isGone ? "resolved" : ""}`}>
    <p class="suggestion-head"><${Icon} name="fork" size=${12} />Suggested task${repo && html` · in <b>${repo}</b>`}</p>
    <p class="suggestion-title">${item.title}</p>
    ${item.tldr && html`<p class="suggestion-tldr">${item.tldr}</p>`}
    <details class="paste"><summary>Prompt</summary><pre>${item.prompt}</pre></details>
    <div class="suggestion-actions">
      ${item.isGone && !state
        ? html`<span class="muted small">Claude took this suggestion back</span>`
        : state?.state === "started"
        ? html`<span class="small ok">Started</span>
            ${state.session && html`<button class="btn subtle" onClick=${() => ui.openReader(state.session)}>Open the session</button>`}`
        : html`${state?.state === "dismissed" && html`<span class="muted small">Dismissed</span>`}
            <span class="grow"></span>
            ${!state && item.taskId && html`<button class="btn subtle" onClick=${() => onDismiss(item.taskId)}>Dismiss</button>`}
            <button class="btn primary" onClick=${start} disabled=${!item.folder}
              title=${item.folder ? `A new session in a new worktree of ${item.folder}, with this prompt: you can change it before it starts` : "The session's folder is unknown"}>
              ${state ? "Start anyway" : "Start"}…</button>`}
    </div>
  </div>`
}

function Tools({ item }) {
  const [isOpen, setOpen] = useState(false)
  const n = item.lines.length
  return html`<div class="msg tools">
    <button class="tools-head" onClick=${() => setOpen(o => !o)} aria-expanded=${isOpen}>
      <${Icon} name=${isOpen ? "down" : "chevron"} size=${12} />
      <${Icon} name="tool" size=${12} />
      <span>${n === 1 ? "1 action" : `${n} actions`}</span>
      ${!isOpen && html`<span class="tools-last">${item.lines.at(-1)}</span>`}
    </button>
    ${isOpen && html`<ul>${item.lines.map((l, i) => html`<li key=${i} title=${l}>${l}</li>`)}</ul>`}
  </div>`
}

const PASTE_RE = /<pasted[_-]?content\b[^>]*>([\s\S]*?)(?:<\/pasted[_-]?content>|$)/gi
const LONG = 700

// What the person typed, with pasted blocks folded away. Files sent from the
// board travel as paths under uploads/: shown as pictures or as named files,
// and the line that names them for Claude is left out.
function UserText({ text: raw }) {
  const sent = [...raw.matchAll(UPLOAD_RE)].map(m => m[1])
  const images = sent.filter(rel => IMAGE_FILE.test(rel))
  const files = sent.filter(rel => !IMAGE_FILE.test(rel))
  const text = sent.length ? raw.replace(ATTACH_LINES, "") : raw
  const [isOpen, setOpen] = useState(false)
  const parts = []
  let last = 0
  for (const m of text.matchAll(PASTE_RE)) {
    if (m.index > last) parts.push({ typed: text.slice(last, m.index) })
    parts.push({ pasted: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ typed: text.slice(last) })
  const typed = parts.filter(p => p.typed).map(p => p.typed).join("")
  const isLong = typed.length > LONG
  return html`<div class=${`bubble ${isLong && !isOpen ? "clamped" : ""}`}>
    ${parts.map((p, i) =>
      p.typed
        ? html`<span key=${i}>${p.typed.trim()}</span>`
        : html`<details key=${i} class="paste"><summary>Pasted text · ${p.pasted.split("\n").length} ${p.pasted.split("\n").length === 1 ? "line" : "lines"}</summary>
            <pre>${p.pasted}</pre></details>`,
    )}
    ${isLong && html`<button class="more" onClick=${() => setOpen(o => !o)}>${isOpen ? "Show less" : "Show all"}</button>`}
    ${images.length > 0 && html`<div class="bubble-images">
      ${images.map(rel => html`<a key=${rel} href=${`/api/uploads/${rel}`} target="_blank" rel="noreferrer" title="Open the image"><img src=${`/api/uploads/${rel}`} alt="" loading="lazy" /></a>`)}
    </div>`}
    ${files.length > 0 && html`<div class="bubble-files">
      ${files.map(rel => html`<a key=${rel} class="file-chip" href=${`/api/uploads/${rel}`} target="_blank" rel="noreferrer" title="Open the file">
        <${Icon} name="file" size=${14} /><span>${fileName(rel)}</span></a>`)}
    </div>`}
  </div>`
}

// A question with options (AskUserQuestion), and the answer once given.
// While the session waits for it and runs the bridge mod (v5), it is answered
// here (`isAnswerable`): a click on an option (or several, then "Send"), or
// a text of your own; the client's card closes. Otherwise it is answered in
// the client.
function Question({ item, sessionId, isAnswerable, picked, onPick }) {
  const [several, setSeveral] = useState([])
  const [own, setOwn] = useState("")
  const labels = item.options.map(o => o.label)
  const canAnswer = !item.answer && !!isAnswerable
  const shownAnswer = item.answer ?? picked ?? null
  const chosen = canAnswer && item.isMulti ? several : (shownAnswer ?? "").split(",").map(a => a.trim())
  // The app always adds a free-text "Other": an answer outside the options is that.
  const free = shownAnswer && !labels.some(l => shownAnswer.includes(l)) ? shownAnswer : null
  const choose = label => {
    if (!canAnswer) return
    if (item.isMulti) return setSeveral(list => (list.includes(label) ? list.filter(l => l !== label) : [...list, label]))
    onPick(item.text, label)
  }
  // A description that only repeats the label says nothing.
  const hint = o => o.description && o.description.trim().toLowerCase() !== o.label.trim().toLowerCase() ? o.description : null
  return html`<div class=${`msg next question-card ${canAnswer ? "answerable" : ""} ${shownAnswer ? "answered" : ""}`}>
    <p class="next-ask"><span>?</span>${item.text}</p>
    ${item.isMulti && canAnswer && html`<p class="q-help">You can pick several</p>`}
    ${item.options.length > 0 && html`<ul class="options" role=${canAnswer ? (item.isMulti ? "group" : "radiogroup") : undefined}>
      ${item.options.map(
        o => html`<li key=${o.label} class=${chosen.includes(o.label) ? "chosen" : ""}
          role=${canAnswer ? (item.isMulti ? "checkbox" : "radio") : undefined} aria-checked=${canAnswer ? chosen.includes(o.label) : undefined}
          tabIndex=${canAnswer ? 0 : undefined} onClick=${() => choose(o.label)}
          onKeyDown=${e => canAnswer && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), choose(o.label))}>
          <i class=${item.isMulti ? "box" : "radio"}></i>
          <div><b>${o.label}</b>${hint(o) && html`<small>${hint(o)}</small>`}</div>
        </li>`,
      )}
      ${free && html`<li class="other chosen"><i class=${item.isMulti ? "box" : "radio"}></i><div><b>${free}</b><small>Your own answer</small></div></li>`}
    </ul>`}
    ${canAnswer
      ? html`<form class="own-answer" onSubmit=${e => (e.preventDefault(), own.trim() && onPick(item.text, own.trim()))}>
          <input class="field" placeholder="Another answer…" value=${own} onInput=${e => setOwn(e.target.value)} />
          ${item.isMulti
            ? html`<button type="button" class="btn primary" disabled=${!several.length && !own.trim()}
                onClick=${() => onPick(item.text, [...several, ...(own.trim() ? [own.trim()] : [])].join(", "))}>Send</button>`
            : html`<button class="btn" disabled=${!own.trim()}>Send</button>`}
        </form>`
      : !shownAnswer && html`<${AnswerInApp} sessionId=${sessionId} why="You can answer this question only in Claude desktop." />`}
  </div>`
}

function Message({ item, sessionId, onFork, question, picks, onPick, suggestions, onDismiss }) {
  switch (item.kind) {
    case "user":
      return html`<div class="msg user"><${UserText} text=${item.text} />
        <span class="stamp">
          ${onFork && html`<button class="link-btn fork-btn" onClick=${() => onFork(item)}
            title="New session with the conversation up to just before this message; the original does not change"><${Icon} name="fork" size=${12} />Fork</button>`}
          ${item.at && html`<span title=${item.isMidTurn ? "You wrote it while Claude was working" : undefined}>
            ${item.isMidTurn ? "during the turn · " : ""}${clock(Date.parse(item.at))}</span>`}
        </span></div>`
    case "assistant":
      return html`<div class="msg assistant md" dangerouslySetInnerHTML=${{ __html: md(item.text) }}></div>`
    case "tools":
      return html`<${Tools} item=${item} />`
    case "next":
      return html`<div class="msg next">
        ${item.recap && html`<div class="md" dangerouslySetInnerHTML=${{ __html: md(item.recap) }}></div>`}
        ${item.ask && html`<p class="next-ask"><span>?</span>${item.ask}</p>`}
        ${item.picked && html`<p class="picked">${item.picked}</p>`}
      </div>`
    case "chapter":
      return html`<div class="chapter"><span>${item.title}</span></div>`
    case "files":
      return html`<${FileChips} id=${sessionId} paths=${item.paths} caption=${item.caption} />`
    case "artifact":
      return html`<${ArtifactCard} id=${sessionId} path=${item.path} url=${item.url} />`
    case "question":
      return html`<${Question} item=${item} sessionId=${sessionId} onPick=${onPick} picked=${picks?.[item.text]}
        isAnswerable=${question?.questions.some(q => q.question === item.text)} />`
    case "dialog":
      return html`<${Dialog} item=${item} sessionId=${sessionId} />`
    case "plan":
      return html`<${Plan} item=${item} />`
    case "suggestion":
      return html`<${Suggestion} item=${item} sessionId=${sessionId} state=${suggestions?.[item.taskId]} onDismiss=${onDismiss} />`
    default:
      return null
  }
}

// "Fork from here": the new session starts from the conversation up to
// just before this message, with this text (edited or not) as its prompt.
function ForkDialog({ sessionId, item, onClose }) {
  const ui = useContext(Ctx)
  const dialog = useRef()
  const area = useRef()
  const [isBusy, setBusy] = useState(false)
  useEffect(() => {
    dialog.current.showModal()
    const el = area.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const create = async () => {
    const prompt = area.current.value.trim()
    if (!prompt || isBusy) return
    setBusy(true)
    const res = await post(`/api/sessions/${sessionId}/fork`, { messageId: item.key, prompt })
    setBusy(false)
    if (!res.body.ok) return ui.toast(res.body.error ?? "Could not fork")
    onClose()
    ui.toast("Session forked: it works headless, then moves to Claude")
    ui.openReader(res.body.id)
  }
  return html`<dialog class="dialog fork" ref=${dialog} onClose=${onClose} onCancel=${onClose}
    onClick=${e => e.target === dialog.current && onClose()}>
    <h2><${Icon} name="fork" size=${17} />Fork from here</h2>
    <p class="muted">A new session with the whole conversation up to just before this message. Change the message to try another path. The original session does not change.</p>
    <textarea ref=${area} class="field" rows="5" defaultValue=${item.text}
      onKeyDown=${e => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), create())}></textarea>
    <div class="dialog-actions">
      <span class="muted"><${Kbd}>⌘<//><${Kbd}>↵<//> create</span>
      <button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${isBusy} onClick=${create}>${isBusy ? "Creating…" : "Create session"}</button>
    </div>
  </dialog>`
}

// The tool approval the client asks for now, settled here or there.
function PermissionCard({ sessionId, permission }) {
  const ui = useContext(Ctx)
  const { command, file_path, url, description } = permission.input ?? {}
  const what = command ?? file_path ?? url ?? null
  return html`<div class="msg next question-card answerable">
    <p class="next-ask"><span>?</span>Allow Claude to use ${permission.tool}?</p>
    ${description && html`<p class="muted small">${description}</p>`}
    ${what && html`<pre class="permission-what">${what}</pre>`}
    <div class="permission-actions">
      <button class="btn" onClick=${() => permit(ui, sessionId, permission, "deny")}>Deny</button>
      <button class="btn primary" onClick=${() => permit(ui, sessionId, permission, "allow")}>Allow</button>
    </div>
  </div>`
}

export function Conversation({ id, card, pending, onDelivered, onUnsend, stuck = [], isOpen, isBusy, untrusted, atCap, question, permission, failed = [] }) {
  const ui = useContext(Ctx)
  // Answers to the question the session asks gather here until every question
  // of the call has one, then go together (one question: at the first click).
  const [picks, setPicks] = useState({})
  const lastQuestion = useRef(null)
  useEffect(() => {
    if (question?.id) {
      if (question.id !== lastQuestion.current) setPicks({})
      lastQuestion.current = question.id
      return
    }
    if (!lastQuestion.current) return
    // Answered (here or in the client): the answer lands on items already
    // shown, which the follow-up reads never touch, so read them again.
    lastQuestion.current = null
    const timer = setTimeout(async () => {
      const res = await get(`/api/sessions/${id}/messages`)
      if (!res?.items) return
      const fresh = new Map(res.items.map(i => [i.key, i]))
      setPage(p => ({ ...p, items: p.items.map(i => fresh.get(i.key) ?? i) }))
    }, 1500)
    return () => clearTimeout(timer)
  }, [question?.id])
  const pick = async (text, value) => {
    const next = { ...picks, [text]: value }
    setPicks(next)
    if (!question || !question.questions.every(q => next[q.question])) return
    const res = await post(`/api/sessions/${id}/answer`, { id: question.id, answers: next })
    if (!res.body.ok) return (setPicks(picks), ui.toast(res.body.error ?? "Could not answer"))
    ui.toast("Answer sent")
  }
  const [forking, setForking] = useState(null)
  const [page, setPage] = useState({ items: [], start: 0, end: 0, hasMore: false, loaded: false, error: null })
  const [suggestions, setSuggestions] = useState({}) // every read says what became of the suggested tasks
  const [hasNew, setHasNew] = useState(false)
  const box = useRef()
  const stick = useRef(true) // follow the bottom while the reader is there
  const endRef = useRef(0)
  const lastUserCount = useRef(0)

  useEffect(() => {
    let alive = true
    stick.current = true
    setHasNew(false)
    setPage({ items: [], start: 0, end: 0, hasMore: false, loaded: false, error: null })
    setSuggestions({})
    get(`/api/sessions/${id}/messages`).then(res => {
      if (!alive) return
      if (!res || res.error) return setPage(p => ({ ...p, loaded: true, error: res?.error ?? "Could not read the conversation" }))
      endRef.current = res.end
      setSuggestions(res.suggestions ?? {})
      setPage({ items: res.items, start: res.start, end: res.end, hasMore: res.hasMore, loaded: true, error: null })
    })
    const timer = setInterval(async () => {
      if (!endRef.current) return
      const res = await get(`/api/sessions/${id}/messages?after=${endRef.current}`)
      if (alive && res?.suggestions) setSuggestions(s => (JSON.stringify(s) === JSON.stringify(res.suggestions) ? s : res.suggestions))
      if (!alive || !res || res.error || res.end === endRef.current) return
      endRef.current = res.end
      if (res.items.length) {
        setPage(p => ({ ...p, items: append(p.items, res.items), end: res.end }))
        if (!stick.current) setHasNew(true)
      }
    }, FOLLOW_MS)
    return () => ((alive = false), clearInterval(timer))
  }, [id])

  // A message sent from here shows as pending until the transcript has it.
  useEffect(() => {
    const users = page.items.filter(i => i.kind === "user")
    if (users.length !== lastUserCount.current) {
      const fresh = users.slice(lastUserCount.current).map(u => u.text.trim())
      lastUserCount.current = users.length
      // The board delivers several at once in one prompt when Claude does not start the session.
      for (const p of pending) if (fresh.some(f => f === p.text.trim() || f.includes(p.text.trim()))) onDelivered(p.id)
    }
  }, [page.items, pending])

  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [page.items, pending.length, card?.background?.length])

  const shown = useMemo(() => normalize(page.items), [page.items])
  const dismiss = async taskId => {
    setSuggestions(s => ({ ...s, [taskId]: { state: "dismissed", session: null } }))
    const res = await post(`/api/sessions/${id}/suggestion`, { taskId })
    if (!res.body.ok) ui.toast(res.body.error ?? "Could not dismiss it")
  }

  const loadEarlier = async () => {
    const el = box.current
    const before = el.scrollHeight
    const res = await get(`/api/sessions/${id}/messages?before=${page.start}`)
    if (!res || res.error) return
    setPage(p => ({ ...p, items: append(res.items, p.items), start: res.start, hasMore: res.hasMore }))
    requestAnimationFrame(() => (el.scrollTop += el.scrollHeight - before))
  }

  const onScroll = e => {
    const el = e.currentTarget
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (stick.current) setHasNew(false)
  }

  // A file Claude names in the text opens in the Files tab.
  const onClick = e => {
    const link = e.target.closest?.("[data-path]")
    if (link) return ui.showFile(link.dataset.path)
    onCodeClick(e, id)
  }
  return html`<div class="conversation" ref=${box} onScroll=${onScroll} onClick=${onClick}>
    ${!page.loaded && html`<div class="skeleton-msgs"><i></i><i></i><i></i></div>`}
    ${page.error && html`<p class="muted center">${page.error}</p>`}
    ${page.hasMore && html`<button class="btn subtle earlier" onClick=${loadEarlier}>Load earlier messages</button>`}
    ${shown.map(item => html`<${Message} key=${item.key} item=${item} sessionId=${id} onFork=${setForking}
      question=${question} picks=${picks} onPick=${pick} suggestions=${suggestions} onDismiss=${dismiss} />`)}
    ${forking && html`<${ForkDialog} sessionId=${id} item=${forking} onClose=${() => setForking(null)} />`}
    ${card?.column === "asking" && card.choices?.length > 0 && !pending.length && html`<div class="choices reply-choices">
      ${card.choices.map(
        (c, i) => html`<button key=${i} class=${`choice ${i === 0 ? "first" : ""}`} title=${c.message}
          onClick=${() => ui.reply(card, c.message || c.label)}>${c.label}</button>`,
      )}
    </div>`}
    ${pending.map(
      p => html`<div key=${p.id} class="msg user pending"><${UserText} text=${p.text} />
        ${failed.some(f => f.id === p.id)
          ? html`<span class="stamp stuck">Could not deliver: ${failed.find(f => f.id === p.id).reason} ·
              <button class="link-btn" onClick=${() => onUnsend(p)} title="Remove the message and put it back in the field">Undo</button></span>`
          : stuck.includes(p.id) || untrusted || (atCap && !isOpen)
          ? html`<span class="stamp stuck">${untrusted ? "Claude does not trust this session's folder: open it in Claude and accept"
              : atCap ? "Claude is at its limit of open sessions for this Mac's memory and did not wake it: write it in Claude, or close sessions you are not using"
              : "The session did not wake: open it in Claude"} ·
              <button class="link-btn" onClick=${() => ui.launch(id)} title="Opens the session in Claude desktop; when you write in it, it starts and gets the message">Open in Claude</button> ·
              <button class="link-btn" onClick=${() => onUnsend(p)}>Undo</button></span>`
          : html`<span class="stamp">${card?.column === "working" || isBusy ? "Queued: delivered when the turn ends" : isOpen ? "Sending…" : "Waking the session in the background…"}
              · <button class="link-btn" onClick=${() => onUnsend(p)} title="Remove the message before it arrives and put it back in the field">Undo</button></span>`}</div>`,
    )}
    ${permission && html`<${PermissionCard} key=${permission.id} sessionId=${id} permission=${permission} />`}
    <${BackgroundBox} card=${card} />
    ${hasNew &&
    html`<button class="new-below" onClick=${() => {
      stick.current = true
      setHasNew(false)
      box.current.scrollTop = box.current.scrollHeight
    }}><${Icon} name="arrowDown" size=${13} />New messages</button>`}
  </div>`
}
