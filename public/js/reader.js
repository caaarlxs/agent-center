// The right pane: one session, with its state, title (renamed here), actions
// and five tabs: the conversation with its reply box (conversation.js,
// composer.js), the changes (changes.js), the PRs (prs.js), the files it
// sent or wrote (files.js) and the tasks (tasks.js). It also keeps the messages sent from here until the transcript
// has them, and polls the session's bridge mod for what it holds.
import { html, useContext, useEffect, useRef, useState } from "../vendor/preact-htm.js"
import { Changes } from "./changes.js"
import { Code } from "./code.js"
import { Actions, RepoTag, StatusChip } from "./components.js"
import { Composer } from "./composer.js"
import { Conversation } from "./conversation.js"
import { Ctx } from "./ctx.js"
import { Files } from "./files.js"
import { Icon } from "./icons.js"
import { Prs } from "./prs.js"
import { Tasks } from "./tasks.js"
import { get, keep, load, plain, post } from "./util.js"

const BRIDGE_MS = 2500

function Title({ card, fallback }) {
  const ui = useContext(Ctx)
  const [isEditing, setEditing] = useState(false)
  const input = useRef()
  // Enter keeps the name and Esc drops it. Both end in a blur (the field goes
  // away), which must neither save twice nor save what Esc dropped.
  const isSettled = useRef(false)
  const finish = isSaving => {
    if (isSettled.current) return
    isSettled.current = true
    const title = input.current.value.trim()
    if (isSaving && title !== card.title) ui.rename(card, title)
    setEditing(false)
  }
  useEffect(() => {
    const start = () => card && setEditing(true)
    window.addEventListener("agents:rename", start)
    return () => window.removeEventListener("agents:rename", start)
  }, [card?.id])
  useEffect(() => {
    if (!isEditing) return
    isSettled.current = false
    input.current?.select()
  }, [isEditing])
  if (!card) return html`<h2>${fallback}</h2>`
  if (isEditing)
    return html`<input ref=${input} class="field title-input" defaultValue=${card.title} maxLength="140"
      onKeyDown=${e => {
        if (e.key === "Enter") finish(true)
        if (e.key === "Escape") (e.stopPropagation(), finish(false))
      }}
      onBlur=${() => finish(true)} />`
  return html`<h2 class="title-edit" title="Double-click or T to rename (on the board only)" onDblClick=${() => setEditing(true)}>
    ${card.title}<button class="icon-btn pencil" onClick=${() => setEditing(true)} aria-label="Rename"><${Icon} name="pencil" size=${13} /></button>
    ${card.hasOwnTitle && html`<span class="tag" title="Name set on the board; Claude desktop keeps its own">renamed</span>`}
  </h2>`
}

// Messages sent from here and not yet in the transcript, per session. Kept in
// this browser, so they still show after closing the panel or reloading; the
// transcript clears them once it has them.
const PENDING_TTL = 24 * 60 * 60_000
const pendingOf = id => (load("pending", {})[id] ?? []).filter(p => Date.now() - (p.at ?? 0) < PENDING_TTL)
function savePending(id, list) {
  const all = load("pending", {})
  if (list.length) all[id] = list
  else delete all[id]
  keep("pending", all)
}

const TABS = [
  ["chat", "chat", "Conversation"],
  ["changes", "diff", "Changes"],
  ["code", "code", "Code"],
  ["prs", "pr", "PRs"],
  ["files", "file", "Files"],
  ["tasks", "tasks", "Tasks"],
]

// hasTasks: the organizer is on (lib/setup.ts); without it there is no Tasks tab.
export function Reader({ id, card, result, tab: asked, file, isWide, isWorkspace = false, hasTasks = true }) {
  const tabs = hasTasks ? TABS : TABS.filter(([key]) => key !== "tasks")
  const tab = tabs.some(([key]) => key === asked) ? asked : "chat"
  const ui = useContext(Ctx)
  const [bridge, setBridge] = useState(null)
  // Code stays alive once opened (its tree, open files, editor), hidden
  // while another tab shows.
  const [hasCode, setHasCode] = useState(tab === "code")
  useEffect(() => void (tab === "code" && setHasCode(true)), [tab])
  const [pending, setPending] = useState(() => pendingOf(id)) // the reader mounts once per session
  useEffect(() => savePending(id, pending), [pending])

  useEffect(() => {
    setBridge(null)
    let alive = true
    const check = () => get(`/api/sessions/${id}/bridge`).then(res => alive && res && setBridge(res))
    check()
    const timer = setInterval(check, BRIDGE_MS)
    return () => ((alive = false), clearInterval(timer))
  }, [id])

  // Takes a message back before the session gets it; its text returns to the field.
  const unsend = async p => {
    const res = await post(`/api/sessions/${id}/unsend`, { messageId: p.id })
    if (!res.body.ok) return ui.toast(res.body.error ?? "Could not undo")
    setPending(ps => ps.filter(x => x.id !== p.id))
    ui.fillComposer(p.text)
  }
  const sent = p => {
    p = { ...p, at: Date.now() }
    setPending(ps => [...ps, p])
    ui.toast("Message sent", () => unsend(p))
  }
  // What waits for the session: sent from here (this browser), plus what the
  // server still holds for it (sent from another window, or before a reload).
  const allPending = [
    ...pending,
    ...(bridge?.queued ?? []).filter(q => !pending.some(p => p.id === q.id)).map(q => ({ ...q, isOpen: false, at: Number(q.id.split("-")[0]) })),
  ]

  // The review comments go as one message, then the conversation shows.
  const sendText = async text => {
    const res = await post(`/api/sessions/${id}/send`, { text })
    if (!res.body.ok) return (ui.toast(res.body.error ?? "Could not send"), false)
    sent({ id: res.body.messageId, text, isOpen: res.body.isOpen || res.body.activated })
    ui.setReaderTab("chat")
    return true
  }

  const title = card?.title ?? plain(result?.title ?? "Conversation")
  const repo = card?.repo ?? result?.repo
  const counts = { prs: card?.prs?.length ?? 0, tasks: card?.taskCount ?? 0 }
  return html`<aside class="reader" aria-label="Conversation">
    <header class="reader-head">
      <div class="reader-bar">
        ${card && html`<${StatusChip} card=${card} />`}
        ${repo && html`<${RepoTag} name=${repo} />`}
        ${card?.branch && html`<span class="branch"><${Icon} name="branch" size=${12} />${card.branch}</span>`}
        <span class="reader-tools">
          ${card && html`<${Actions} card=${card} compact />`}
          <button class="btn primary sm" onClick=${() => ui.launch(id)} title="Open in Claude (O)">
            Open in Claude <${Icon} name="external" size=${12} /></button>
          ${!isWorkspace && html`<button class="icon-btn" onClick=${ui.toggleWide} title=${isWide ? "Normal width" : "Widen the panel"}>
            <${Icon} name=${isWide ? "shrink" : "expand"} size=${15} /></button>`}
          <button class="icon-btn" onClick=${ui.closeReader} title="Close (Esc)"><${Icon} name="x" /></button>
        </span>
      </div>
      <${Title} card=${card} fallback=${title} />
    </header>
    <nav class="tabs" role="tablist">
      ${tabs.map(([key, icon, label]) => html`<button key=${key} id=${`reader-tab-${key}`} role="tab" aria-selected=${tab === key}
        aria-controls="reader-panel" onClick=${() => ui.setReaderTab(key)} title=${label}>
        <${Icon} name=${icon} size=${14} /><span class="tab-label">${label}</span>${counts[key] > 0 && html`<span class="count">${counts[key]}</span>`}</button>`)}
    </nav>
    <div class="tab-panel" id="reader-panel" role="tabpanel" aria-labelledby=${`reader-tab-${tab}`}>
      ${tab === "changes" ? html`<${Changes} id=${id} onSend=${sendText} />` : tab === "code" ? null : tab === "prs" ? html`<${Prs} id=${id} onSend=${sendText} />` : tab === "files" ? html`<${Files} id=${id} file=${file} />` : tab === "chat"
        ? html`<${Conversation} id=${id} card=${card} pending=${allPending} onUnsend=${unsend} stuck=${bridge?.stuck ?? []}
              isOpen=${!!bridge?.isOpen} untrusted=${!!bridge?.wake?.untrusted} atCap=${!!bridge?.wake?.atCap} question=${bridge?.question}
              isBusy=${!!bridge?.busy && Date.now() - (bridge?.lastSeen ?? 0) < 15 * 60_000}
              permission=${bridge?.permission} failed=${bridge?.failed ?? []}
              onDelivered=${pid => setPending(ps => ps.filter(p => p.id !== pid))} />
            <${Composer} id=${id} card=${card} bridge=${bridge} isWorking=${card?.column === "working"} onSent=${sent} />`
        : html`<${Tasks} id=${id} />`}
      ${hasCode && html`<div class="tab-keep" style=${tab === "code" ? "" : "display:none"}><${Code} id=${id} isShown=${tab === "code"} /></div>`}
    </div>
  </aside>`
}
