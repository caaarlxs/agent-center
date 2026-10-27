// The small pieces every view draws on a session: its state icon and chip,
// the line that says why it is where it is, its tags (PRs, tasks, messages
// waiting, work in the background, context used) and its action buttons.
// The board, the inbox, the canvas and the reader all build on these.
import { html, useContext, useEffect, useRef } from "../vendor/preact-htm.js"
import { Ctx, Kbd } from "./ctx.js"
import { Icon } from "./icons.js"
import { RunChip } from "./run.js"
import { PARK_OPTIONS, ago, hue, plain, post, when } from "./util.js"

// "web-finder" → "WF", "triage-bot" → "TB", "api" → "AP".
function initials(name) {
  const parts = String(name ?? "").split(/[-_./\s]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name ?? "?").slice(0, 2)).toUpperCase()
}

export function RepoIcon({ name, size = 20 }) {
  return html`<span class="repo-icon" title=${name} style=${`--hue:${hue(name)};--size:${size}px`}>${initials(name)}</span>`
}

// How long a session has waited for the person: yellow under 10 minutes,
// orange up to 30, red past 30.
export function urgencyOf(card, now) {
  if (card.column !== "asking" || !card.waitingSince) return ""
  const min = (now - card.waitingSince) / 60000
  return min > 30 ? "urgent-high" : min >= 10 ? "urgent-mid" : "urgent-low"
}

// The age a card shows: how long it has waited for you, else its last activity.
export const ageText = (card, now) =>
  card.waitingSince ? `waiting ${ago(card.waitingSince, now)}` : ago(card.lastActivity ?? card.updatedAt, now)

// A focused card or row opens with Enter or Space, as a click would. Keys
// pressed on the buttons inside it stay theirs.
export const onOpenKey = open => e => {
  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
  e.preventDefault()
  open()
}

// A session's state, from what the card says: [key, label]. The key names
// the icon and the colour (StateIcon, StatusChip) on every view.
export function stateOf(card) {
  if (card.column === "done") return ["done", "Done"]
  if (card.column === "asking") return card.state === "permission" ? ["permission", "Needs approval"] : ["asking", "Asking you"]
  if (card.column === "working") return ["working", "Working"]
  if (card.column === "parked") return ["parked", "Later"]
  if (card.isStale) return ["stale", "Stuck"]
  if (card.isInterrupted) return ["stale", "Interrupted"]
  if (card.column === "pending") return ["pending", "Pending"]
  return ["review", "To review"]
}

const STATE_ICON = { asking: "question", permission: "lock", review: "eye", pending: "list", parked: "clock", done: "check", stale: "alert" }

// The state at a glance: a shape and a colour, the same on every view. While
// Claude works, a ring fills with the turn's task list (4 of 6 steps: two
// thirds); with no list, the ring turns.
export function StateIcon({ card, size = 28 }) {
  const [state, label] = stateOf(card)
  const p = card.progress
  const title = p ? `${label}: step ${Math.min(p.done + 1, p.total)} of ${p.total}${p.current ? ` · ${p.current}` : ""}` : label
  if (state === "working") {
    const pct = p ? p.done / p.total : 0.28
    return html`<span class="state-ico s-working" style=${`--size:${size}px`} title=${title} role="img" aria-label=${title}>
      <svg class=${`ring ${p ? "" : "spin"}`} viewBox="0 0 36 36" aria-hidden="true">
        <circle class="track" cx="18" cy="18" r="15.5" />
        <circle class="fill" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray=${`${Math.max(4, pct * 100)} 100`} />
      </svg>
      ${p && size >= 26 ? html`<b class="n">${p.done}/${p.total}</b>` : html`<i class="core"></i>`}
    </span>`
  }
  return html`<span class=${`state-ico s-${state}`} style=${`--size:${size}px`} title=${title} role="img" aria-label=${title}>
    <${Icon} name=${STATE_ICON[state]} size=${Math.round(size * 0.55)} />
  </span>`
}

// The state in words, in the reader's head: [tone, icon]; no icon is a dot.
const CHIP = {
  permission: ["tone-bad", "lock"],
  asking: ["tone-ask"],
  working: ["tone-work"],
  parked: ["tone-muted", "clock"],
  done: ["tone-muted", "check"],
  stale: ["tone-muted"],
  pending: ["tone-pending"],
  review: ["tone-review"],
}

export function StatusChip({ card }) {
  const [state, label] = stateOf(card)
  const [tone, icon] = CHIP[state]
  return html`<span class=${`chip ${tone}`}>${icon
    ? html`<${Icon} name=${icon} size=${12} />`
    : html`<i class=${`dot ${state === "working" ? "pulse" : ""}`}></i>`}${label}</span>`
}

// The line under the title: why the card is where it is. The question when it
// asks (Gist adds the replies), the step under way, or what Claude did.
export function Context({ card, lines = 2 }) {
  if (card.column === "asking") return html`<${Gist} card=${card} lines=${lines} />`
  if (card.column === "working" && card.progress?.current)
    return html`<p class="gist now" style=${`--lines:${lines}`}><span>Now:</span> ${card.progress.current}</p>`
  if (card.recap && card.column !== "working")
    return html`<p class="gist recap" style=${`--lines:${lines}`} title=${plain(card.recap)}>${plain(card.recap)}</p>`
  return null
}

export function RepoTag({ name }) {
  return html`<span class="repo" style=${`--hue:${hue(name)}`}><i></i>${name}</span>`
}

function prLabel(pr, repo) {
  const prRepo = pr.url.split("/")[4]
  return prRepo && prRepo !== repo ? `${prRepo}#${pr.number}` : `#${pr.number}`
}

export function PrChip({ pr, repo, cardId }) {
  const ui = useContext(Ctx)
  const state = pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.isDraft ? "draft" : "open"
  const checks = pr.checks === "pass" ? "✓" : pr.checks === "fail" ? "✗" : pr.checks === "pending" ? "•" : ""
  const title = `${pr.title} — ${{ merged: "merged", closed: "closed", draft: "draft", open: "open" }[state]}${
    pr.checks ? `, checks ${{ pass: "passing", fail: "failing", pending: "running" }[pr.checks]}` : ""
  }${pr.reviewDecision === "APPROVED" ? ", approved" : pr.reviewDecision === "CHANGES_REQUESTED" ? ", changes requested" : ""}`
  return html`<button class=${`pr pr-${state}`} title=${title}
    onClick=${e => (e.stopPropagation(), cardId ? ui.openReader(cardId, "prs") : window.open(pr.url, "_blank"))}>
    <${Icon} name="pr" size=${12} />${prLabel(pr, repo)}${checks && html`<b class=${`checks checks-${pr.checks}`}>${checks}</b>`}
  </button>`
}

// Allow or deny, from the board, the tool approval the client asks for
// (bridge mod v7); the client's own dialog closes either way.
export async function permit(ui, sessionId, permission, decision) {
  const res = await post(`/api/sessions/${sessionId}/permit`, { id: permission.id, decision })
  ui.toast(res.body.ok ? (decision === "allow" ? "Allowed" : "Denied") : (res.body.error ?? "Could not answer"))
}

function PermissionChoices({ card }) {
  const ui = useContext(Ctx)
  const permission = card.bridge.permission
  return html`<div class="choices" onClick=${e => e.stopPropagation()}>
    <button class="choice first" onClick=${() => permit(ui, card.id, permission, "allow")}>Allow</button>
    <button class="choice" onClick=${() => permit(ui, card.id, permission, "deny")}>Deny</button>
  </div>`
}

// A question with options on the card: one question with one answer is
// answered with a click (bridge mod v5); several, or several answers, open the
// conversation; a session without the mod is answered in the client.
function DialogChoices({ card }) {
  const ui = useContext(Ctx)
  const question = card.bridge?.question
  const only = question?.questions.length === 1 && !question.questions[0].multiSelect ? question.questions[0] : null
  const answer = async label => {
    const res = await post(`/api/sessions/${card.id}/answer`, { id: question.id, answers: { [only.question]: label } })
    ui.toast(res.body.ok ? "Answer sent" : (res.body.error ?? "Could not answer"))
  }
  return html`<div class="choices" onClick=${e => e.stopPropagation()}>
    ${only
      ? only.options.map((o, i) => html`<button key=${o.label} class=${`choice ${i === 0 ? "first" : ""}`} title=${o.description ?? o.label}
          onClick=${() => answer(o.label)}>${o.label}</button>`)
      : question
        ? html`<button class="choice first" onClick=${() => ui.openReader(card.id)}>Reply</button>`
        : html`<button class="choice first" title="You can answer this session only in Claude desktop" onClick=${() => ui.launch(card.id)}>
            Answer in Claude ↗</button>`}
  </div>`
}

// Under the title, only what waits on the person: the open question, and
// the replies Claude offered, one click each.
function Gist({ card, lines = 2 }) {
  const ui = useContext(Ctx)
  if (card.column !== "asking" || !card.ask) return null
  return html`<p class="gist ask" style=${`--lines:${lines}`} title=${plain(card.ask)}>${plain(card.ask)}</p>
    ${card.askKind === "dialog" && html`<${DialogChoices} card=${card} />`}
    ${card.askKind === "permission" && card.bridge?.permission && html`<${PermissionChoices} card=${card} />`}
    ${card.choices?.length > 0 && html`<div class="choices" onClick=${e => e.stopPropagation()}>
      ${card.choices.map(
        (c, i) => html`<button key=${i} class=${`choice ${i === 0 ? "first" : ""}`} title=${c.message}
          onClick=${() => ui.reply(card, c.message || c.label)}>${c.label}</button>`,
      )}
    </div>`}`
}

// How full the context is: past 85% a new session is worth it.
export function UsageMeter({ usage, wide = false }) {
  if (!usage) return null
  const pct = Math.min(100, Math.round((usage.context / usage.window) * 100))
  const tone = pct >= 85 ? "bad" : pct >= 65 ? "ask" : "ok"
  const tokens = usage.context >= 1000 ? `${Math.round(usage.context / 1000)}k` : usage.context
  return html`<span class=${`usage tone-${tone} ${wide ? "wide" : ""}`}
    title=${`Context used: ${tokens} of ${usage.window / 1000}k tokens (${pct}%)${pct >= 85 ? " — consider starting a new session" : ""}`}>
    <span class="bar"><i style=${`width:${pct}%`}></i></span>${pct}%${wide ? html` context · ${tokens} tokens` : ""}
  </span>`
}

export function Meta({ card }) {
  const ui = useContext(Ctx)
  return html`<div class="meta">
    ${card.isLaunching && html`<span class="tag tone-work" title="A turn runs here, headless (a new session's first one, or messages Claude desktop did not start the session for); open it in Claude when it ends">headless</span>`}
    ${card.state === "permission" && card.column === "asking" && html`<span class="tag tone-bad">needs approval</span>`}
    <${OverlapChip} card=${card} />
    <${BackgroundChip} card=${card} />
    <${MemoryChip} card=${card} />
    <${RunChip} card=${card} />
    ${card.prs?.map(pr => html`<${PrChip} key=${pr.url} pr=${pr} repo=${card.repo} cardId=${card.id} />`)}
    ${card.taskCount > 0 &&
    html`<button class="tag tasks" title="Show its tasks" onClick=${e => (e.stopPropagation(), ui.openReader(card.id, "tasks"))}>
      <${Icon} name="tasks" size=${12} />${card.taskCount} ${card.taskCount === 1 ? "task" : "tasks"}</button>`}
    ${card.bridge?.pending > 0 && html`<${PendingChip} card=${card} />`}
    ${card.column === "parked" &&
    html`<span class="tag">${card.parkedUntil ? `until ${when(card.parkedUntil)}` : "no date"}</span>`}
    ${card.isWorktree && html`<span class="tag" title=${card.cwd}>worktree</span>`}
    ${card.isArchived && html`<span class="tag">archived in Claude desktop</span>`}
    <${UsageMeter} usage=${card.usage} />
  </div>`
}

// ---------- actions on a session ----------

function ParkMenu({ card, onClose }) {
  const ui = useContext(Ctx)
  const ref = useRef()
  useEffect(() => {
    const away = e => ref.current && !ref.current.contains(e.target) && onClose()
    // Listening only after this tick: the click that opened the menu must not close it.
    const timer = setTimeout(() => document.addEventListener("pointerdown", away), 0)
    return () => (clearTimeout(timer), document.removeEventListener("pointerdown", away))
  }, [])
  return html`<div class="menu" ref=${ref} role="menu" onClick=${e => e.stopPropagation()}>
    <div class="menu-title">Later, until…</div>
    ${PARK_OPTIONS.map(
      o => html`<button key=${o.key} role="menuitem" onClick=${() => (onClose(), ui.act(card, "park", { until: o.until() }))}>
        <span>${o.label}</span><span class="menu-hint">${o.hint ?? ""}<${Kbd}>${o.key}<//></span>
      </button>`,
    )}
  </div>`
}

// The colours a card can wear (lib/board.ts CARD_COLORS), in the order the
// keys 1–7 pick them; 0 takes the colour off.
export const CARD_COLORS = [
  { key: "lilac", label: "Lilac" },
  { key: "blue", label: "Blue" },
  { key: "teal", label: "Teal" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" },
  { key: "orange", label: "Orange" },
  { key: "pink", label: "Pink" },
]

// A row of swatches under the palette button; the one it wears is ringed.
function ColorMenu({ card, onClose }) {
  const ui = useContext(Ctx)
  const ref = useRef()
  useEffect(() => {
    const away = e => ref.current && !ref.current.contains(e.target) && onClose()
    const timer = setTimeout(() => document.addEventListener("pointerdown", away), 0)
    return () => (clearTimeout(timer), document.removeEventListener("pointerdown", away))
  }, [])
  const pick = color => (onClose(), ui.act(card, "color", { color }))
  return html`<div class="menu color-menu" ref=${ref} role="menu" onClick=${e => e.stopPropagation()}>
    <div class="menu-title">Colour</div>
    <div class="swatches">
      <button role="menuitem" class=${`none ${card.color ? "" : "on"}`} title="No colour (0)" aria-label="No colour" onClick=${() => pick("")}></button>
      ${CARD_COLORS.map((c, i) => html`<button key=${c.key} role="menuitem" class=${card.color === c.key ? "on" : ""} data-color=${c.key}
        title=${`${c.label} (${i + 1})`} aria-label=${c.label} onClick=${() => pick(c.key)}></button>`)}
    </div>
  </div>`
}

export function Actions({ card, compact = false }) {
  const ui = useContext(Ctx)
  const isParkOpen = ui.parkMenu === card.id
  const isColorOpen = ui.colorMenu === card.id
  const stop = fn => e => (e.stopPropagation(), fn())
  return html`<div class=${`actions ${compact ? "compact" : ""}`} onClick=${e => e.stopPropagation()}>
    <button class="icon-btn" title="Open in Claude (O)" onClick=${stop(() => ui.launch(card.id))}>
      <${Icon} name="external" size=${15} /></button>
    <button class=${`icon-btn ${card.pinned ? "on" : ""}`} title=${card.pinned ? "Unpin (P)" : "Pin (P)"}
      onClick=${stop(() => ui.act(card, card.pinned ? "unpin" : "pin"))}>
      <${Icon} name="star" size=${15} /></button>
    ${card.column !== "done" && html`<button class=${`icon-btn ${ui.watched?.has(card.id) ? "on" : ""}`}
      title=${ui.watched?.has(card.id) ? "You will hear when it finishes or asks you: click to stop" : "Tell me when it finishes or asks me something"}
      onClick=${stop(() => ui.toggleWatch(card))}><${Icon} name="bell" size=${15} /></button>`}
    <button class=${`icon-btn ${card.run ? "on" : ""}`} title="Run: start this session's project" onClick=${stop(() => ui.openRun(card))}>
      <${Icon} name="play" size=${14} /></button>
    <span class="anchor">
      <button class=${`icon-btn ${card.color ? "tinted" : ""} ${isColorOpen ? "on" : ""}`} title="Colour (C)" aria-haspopup="menu"
        onClick=${stop(() => ui.setColorMenu(isColorOpen ? null : card.id))}>
        <${Icon} name="palette" size=${15} /></button>
      ${isColorOpen && html`<${ColorMenu} card=${card} onClose=${() => ui.setColorMenu(null)} />`}
    </span>
    ${card.column === "pending" &&
    html`<button class="icon-btn" title="Mark to review: back to “To review”, as if you had not opened it (U)"
      onClick=${stop(() => ui.act(card, "unseen"))}><${Icon} name="eye" size=${15} /></button>`}
    ${card.column === "working" &&
    html`<button class="icon-btn stop" title="Stop the running turn (S)" onClick=${stop(() => ui.stopSession(card))}>
      <${Icon} name="stop" size=${14} /></button>`}
    ${card.column === "parked"
      ? html`<button class="icon-btn on" title="Remove from Later (A)" onClick=${stop(() => ui.act(card, "unpark"))}>
          <${Icon} name="clock" size=${15} /></button>`
      : card.column !== "done" &&
        html`<span class="anchor">
          <button class=${`icon-btn ${isParkOpen ? "on" : ""}`} title="Later (A)" aria-haspopup="menu"
            onClick=${stop(() => ui.setParkMenu(isParkOpen ? null : card.id))}>
            <${Icon} name="clock" size=${15} /></button>
          ${isParkOpen && html`<${ParkMenu} card=${card} onClose=${() => ui.setParkMenu(null)} />`}
        </span>`}
    ${card.column === "done"
      ? html`${!card.isArchived &&
          html`<button class="icon-btn" title="Reopen (E)" onClick=${stop(() => ui.act(card, "undone"))}>
            <${Icon} name="undo" size=${15} /></button>`}
          <button class="icon-btn" title="Archive: it leaves the board until the session moves again"
            onClick=${stop(() => ui.act(card, "archive"))}><${Icon} name="archive" size=${15} /></button>`
      : html`<button class="icon-btn" title="Mark as done (E)" onClick=${stop(() => ui.act(card, "done"))}>
          <${Icon} name="check" size=${15} /></button>`}
  </div>`
}

// Two open sessions that may step on each other (lib/snapshot.ts): the same
// files edited in the last hours, or both working in one folder. A click
// opens the other one.
export function OverlapChip({ card }) {
  const ui = useContext(Ctx)
  const list = card.overlaps ?? []
  if (!list.length) return null
  const one = list[0]
  const label = list.length > 1 ? `${list.length} sessions overlap`
    : one.files.length ? `${one.files.length} ${one.files.length === 1 ? "file" : "files"} with ${one.title}` : `Same folder as ${one.title}`
  const title = list.map(o => `• ${o.title}: ${[o.isSameFolder && "working in the same folder", o.files.length && `edited ${o.files.map(f => f.split("/").pop()).join(", ")}`].filter(Boolean).join("; ")}`).join("\n")
  return html`<button class="tag overlap-chip" title=${`It may step on another session:\n${title}\n\nClick to open it`}
    onClick=${e => (e.stopPropagation(), ui.openReader(one.id))}><${Icon} name="alert" size=${12} /><span>${label}</span></button>`
}

// Unread: "New", or what it waits for when that is new (a question, an approval).
export function NewBadge({ card }) {
  if (!card.isUnread) return null
  const waits = card.column === "asking" ? (card.state === "permission" ? "permission" : "ask") : ""
  const text = { ask: "Asks you", permission: "Approval" }[waits] ?? "New"
  return html`<span class=${`new-badge ${waits}`} title=${waits ? "New since you last looked: it waits for you" : "Updated since you last looked at it"}>${text}</span>`
}

// ---------- work left running in the background ----------

const BG_LABEL = { shell: "in the background", subagent: "subagent", monitor: "monitor", workflow: "workflow", current: "in progress" }

function bgTitle(t) {
  return t.description || t.command || BG_LABEL[t.type] || t.type || "task"
}

// On a card: how many things still run in the background, each in the tooltip.
export function BackgroundChip({ card }) {
  const ui = useContext(Ctx)
  const list = card.background ?? []
  if (!list.length) return null
  const title = list.map(t => `• ${bgTitle(t)} (${BG_LABEL[t.type] ?? t.type}, ${ago(t.since, ui.now)})`).join("\n")
  const label = list.every(t => t.type === "current") ? (list.length === 1 ? "1 long command" : `${list.length} long commands`) : `${list.length} running`
  return html`<span class="tag bg-chip" title=${`Running now:\n${title}`}>
    <span class="dot run"></span>${label}</span>`
}

// In the conversation: the same list, like the client's "Background tasks",
// with what each one takes in memory and Stop; then what else the session
// started that still takes memory (a dev server it left running, maybe from
// a turn long gone, an MCP server).
export function BackgroundBox({ card }) {
  const ui = useContext(Ctx)
  const list = card?.background ?? []
  const items = (card?.memory?.items ?? []).filter(i => i.kind !== "session")
  // A task's process: the one whose command line holds the task's command.
  const flat = text => String(text ?? "").replace(/['"]/g, "").replace(/\s+/g, " ").trim()
  const used = new Set()
  const processOf = t => {
    const k = flat(t.command)
    const found = k && items.find(i => !used.has(i.pid) && flat(i.command).includes(k))
    if (found) used.add(found.pid)
    return found
  }
  const rows = list.map(t => ({ task: t, proc: processOf(t) }))
  const others = items.filter(i => !used.has(i.pid) && i.bytes >= 20 * MB)
  if (!rows.length && !others.length) return null
  const stopAt = async i => {
    const res = await post(`/api/sessions/${card.id}/stopprocess`, { pid: i.pid })
    ui.toast(res.body.ok ? `Stopping ${i.label}…` : (res.body.error ?? "Could not stop it"))
  }
  const idleFor = i => (i.idleSince && ui.now - i.idleSince > 5 * 60_000 ? `idle ${ago(i.idleSince, ui.now)}` : "")
  const memCell = i => i && html`${idleFor(i) && html`<span class=${`bg-idle ${i.isForgotten ? "forgotten" : ""}`}
      title=${i.isForgotten ? "Up for hours and unused for a while: likely forgotten" : "No CPU used lately"}>${idleFor(i)}</span>`}
    <span class=${`bg-mem ${i.bytes >= MEMORY_WARN ? "warn" : ""}`}>${memText(i.bytes)}</span>
    <button class="link-btn bg-stop" title=${`Stop it (and what it started)${i.cwd ? `: ${i.cwd}` : ""}`} onClick=${() => stopAt(i)}>Stop</button>`
  return html`<div class="bg-box">
    <div class="bg-head"><span class="dot run"></span>Running now<span class="count">${rows.length + others.length}</span>
      ${card.memory?.total >= MEMORY_WARN && html`<span class="bg-total" title="Memory this session and what it started take on this Mac">${memText(card.memory.total)} in memory</span>`}</div>
    ${rows.map(({ task: t, proc }) => html`<div key=${t.id} class="bg-row" title=${[t.command ?? t.description ?? "", proc?.cwd].filter(Boolean).join("\n")}>
      <${Icon} name=${t.type === "subagent" ? "bot" : "terminal"} size=${13} />
      <span class=${`bg-what ${t.type === "shell" && !t.description ? "mono" : ""}`}>${bgTitle(t)}</span>
      <span class="bg-kind">${BG_LABEL[t.type] ?? t.type}</span>
      <span class="age">${ago(t.since, ui.now)}</span>
      ${memCell(proc)}
    </div>`)}
    ${others.map(i => html`<div key=${i.pid} class="bg-row" title=${[i.command, i.cwd].filter(Boolean).join("\n")}>
      <${Icon} name=${i.kind === "mcp" ? "tool" : "terminal"} size=${13} />
      <span class="bg-what mono">${i.label}</span>
      <span class="bg-kind">${[i.kind === "mcp" ? "MCP server" : i.cwd?.split("/").slice(-2).join("/"), i.isDetached && "left running"].filter(Boolean).join(" · ")}</span>
      <span class="age">${ago(i.since, ui.now)}</span>
      ${memCell(i)}
    </div>`)}
  </div>`
}

// ---------- memory ----------
// What a session and everything it started take on this Mac (lib/memory.ts).

const MB = 1024 ** 2
const GB = 1024 ** 3
export const MEMORY_WARN = 1 * GB // the card shows it from here, orange
const MEMORY_HIGH = 3 * GB // and red from here
export const memText = b => (b >= GB ? `${(b / GB).toLocaleString("en-GB", { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(b / MB))} MB`)

// On a card, once it takes 1 GB: the total, and what takes it in the tooltip.
export function MemoryChip({ card }) {
  const ui = useContext(Ctx)
  const m = card.memory
  if (!m || m.total < MEMORY_WARN) return null
  const lines = m.items
    .filter(i => i.bytes >= 10 * MB)
    .map(i => `• ${i.label}${i.cwd ? ` · ${i.cwd}` : ""} · ${memText(i.bytes)}${i.kind === "session" ? "" : ` · ${ago(i.since, ui.now)}`}${i.isDetached ? " · left running" : ""}${i.isForgotten ? " · unused" : ""}`)
  return html`<button class=${`tag mem-chip ${m.total >= MEMORY_HIGH ? "high" : ""}`}
    title=${`Memory on this Mac: ${memText(m.total)}\n${lines.join("\n")}\n\nClick to see it and stop what you do not need`}
    onClick=${e => (e.stopPropagation(), ui.openReader(card.id))}>
    <${Icon} name="gauge" size=${12} />${memText(m.total)}</button>`
}

// Messages waiting for a session: amber while they wait, red once the
// session did not wake (open the conversation to deliver them).
export function PendingChip({ card }) {
  const ui = useContext(Ctx)
  const stuck = card.bridge?.stuck?.length || (card.bridge?.wake?.untrusted || card.bridge?.wake?.atCap ? card.bridge.pending : 0)
  return html`<button class=${`tag ${stuck ? "tone-bad" : "tone-ask"}`}
    title=${stuck ? "The session did not wake: open the conversation to deliver them" : "Your messages waiting for the session"}
    onClick=${e => (e.stopPropagation(), ui.openReader(card.id))}>
    <${Icon} name="mail" size=${12} />${card.bridge.pending}${stuck ? " undelivered" : ""}</button>`
}
