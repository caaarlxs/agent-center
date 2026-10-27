// The reply box under a conversation: text (kept as a draft per chat), files,
// dictation, the session's mode and model, and what will happen to the
// message (the session is open, busy, asleep or stuck). The bridge mod
// delivers what is sent into the session. Also the small upward menu
// (Picker) that "New session" uses for the same settings.
import { html, useContext, useEffect, useLayoutEffect, useRef, useState } from "../vendor/preact-htm.js"
import { AttachButton, Attachments, uploadFile, useAttachments, withFiles } from "./attachments.js"
import { UsageMeter } from "./components.js"
import { Ctx } from "./ctx.js"
import { Icon } from "./icons.js"
import { MicButton, useWhisper } from "./mic.js"
import { keep, load, post } from "./util.js"
import { canDictate, dictate } from "./voice.js"

// What you were writing in each chat stays when you go to another one and
// come back: the text also across reloads (for a few days), the files only
// while the page stays open.
const DRAFT_MS = 3 * 24 * 60 * 60 * 1000
const draftFiles = new Map()

function loadDraft(id) {
  const draft = load("drafts", {})[id]
  return draft && Date.now() - draft.at < DRAFT_MS ? draft.text : ""
}

function keepDraft(id, text) {
  const all = load("drafts", {})
  for (const [key, draft] of Object.entries(all)) if (Date.now() - draft.at > DRAFT_MS) delete all[key]
  if (text.trim()) all[id] = { text, at: Date.now() }
  else delete all[id]
  keep("drafts", all)
}

export function Composer({ id, card, bridge, isWorking, onSent }) {
  const ui = useContext(Ctx)
  const [text, setText] = useState(() => loadDraft(id))
  const [isSending, setSending] = useState(false)
  // The previews stay alive with the draft: the files come back with the chat.
  const attach = useAttachments(draftFiles.get(id) ?? [], { isKept: true })
  const files = attach.files
  useEffect(() => {
    const timer = setTimeout(() => keepDraft(id, text), 300)
    return () => clearTimeout(timer)
  }, [text])
  // Saved at once too when the chat closes, so the last keystrokes are not lost.
  const latest = useRef(text)
  latest.current = text
  const alive = useRef(true)
  useEffect(() => () => (keepDraft(id, latest.current), (alive.current = false)), [])
  useEffect(() => {
    if (files.length) draftFiles.set(id, files)
    else draftFiles.delete(id)
  }, [files])
  const area = useRef()

  useEffect(() => {
    ui.registerComposer({
      focus: () => {
        const el = area.current
        if (!el) return
        el.focus({ preventScroll: true })
        el.setSelectionRange(el.value.length, el.value.length) // after a kept draft
      },
      // A reply to complete (a template): put it in the field, cursor at the end.
      fill: value => {
        setText(value)
        requestAnimationFrame(() => {
          const el = area.current
          if (!el) return
          el.focus()
          el.setSelectionRange(value.length, value.length)
        })
      },
    })
    return () => ui.registerComposer(null)
  }, [])
  // Grow with the text. The pane may still be taking its width when the field
  // first lays out (a narrow field makes one line look tall), so measure again
  // whenever its width changes.
  const measure = () => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }
  useLayoutEffect(measure, [text])
  useEffect(() => {
    let width = 0
    const observer = new ResizeObserver(([entry]) => {
      if (Math.round(entry.contentRect.width) === width) return
      width = Math.round(entry.contentRect.width)
      measure()
    })
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [])

  const send = async () => {
    if ((!text.trim() && !files.length) || isSending) return
    if (bridge?.isArchived) return ui.toast("Archived in Claude: unarchive it there (Open in Claude), then write")
    setSending(true)
    let paths = []
    try {
      for (const f of files) paths.push(await uploadFile(id, f.file))
    } catch (err) {
      setSending(false)
      return ui.toast(err.message)
    }
    const body = withFiles(text.trim(), paths)
    const res = await post(`/api/sessions/${id}/send`, { text: body })
    setSending(false)
    if (!res.body.ok) return ui.toast(res.body.error ?? "Could not send")
    setText("")
    attach.clear()
    if (res.body.activated) ui.toast("The session was asleep: waking it in the background")
    onSent({ id: res.body.messageId, text: body, isOpen: res.body.isOpen || res.body.activated })
  }

  // Dictation with Whisper on this Mac when the server has it (any browser).
  const whisper = useWhisper()
  const addHeard = heard => (setText(t => (t && !/\s$/.test(t) ? `${t} ` : t) + heard), area.current?.focus())

  // Dictation: what is heard goes after the text that was there.
  const [listening, setListening] = useState(null) // { stop, isLocal } | "starting"
  useEffect(() => () => listening?.stop?.(), [listening])
  const toggleMic = async () => {
    if (listening) return listening.stop?.()
    setListening("starting")
    const base = text && !/\s$/.test(text) ? `${text} ` : text
    try {
      const session = await dictate({
        onText: (heard, interim) => setText(base + heard + interim),
        onEnd: error => {
          setListening(null)
          if (error === "not-allowed") ui.toast("Chrome has no permission to use the microphone")
          else if (error && error !== "no-speech" && error !== "aborted") ui.toast(`Dictation stopped: ${error}`)
          area.current?.focus()
        },
      })
      setListening(session)
    } catch {
      setListening(null)
      ui.toast("Could not start dictation")
    }
  }

  // The mod's heartbeat pauses while a tool runs: a recent beat means busy.
  const isBusy = isWorking && bridge?.lastSeen && Date.now() - bridge.lastSeen < 15 * 60_000
  const [isWaking, setWaking] = useState(false)
  const wake = async () => {
    setWaking(true)
    const res = await post(`/api/sessions/${id}/activate`)
    if (!res.body.ok) ui.toast(res.body.error ?? "Could not wake the session")
    setTimeout(() => alive.current && setWaking(false), 8000)
  }
  // Claude stops idle sessions (30 min, or sooner when memory is short); the
  // server wakes them in the background and tries again while messages wait.
  const isStuck = !!bridge?.stuck?.length || !!bridge?.wake?.untrusted || !!bridge?.wake?.atCap || !!bridge?.isArchived
  const state = !bridge
    ? ["", "Checking the session…"]
    : bridge.isArchived
      ? ["bad", "Archived in Claude: it does not wake until you unarchive it there (Open in Claude)"]
    : bridge.wake?.untrusted
      ? ["bad", "Claude does not trust this session's folder: open it in Claude and accept"]
    : bridge.wake?.atCap && bridge.pending && !bridge.isOpen
      ? ["bad", "Claude already runs as many sessions as this Mac's memory allows, so it does not wake this one in the background: write to it in Claude, or close sessions you are not using"]
    : bridge.stuck?.length
      ? ["bad", "The session did not wake: open it in Claude"]
    : bridge.isOpen
      ? ["on", "Session open: it arrives in a few seconds"]
      : isBusy
        ? ["busy", "Busy: delivered when the turn ends"]
        : bridge.pending || isWaking
          ? ["busy", "Waking the session in the background…"]
          : ["", "Session asleep: when you send, it wakes in the background"]
  const canWake = bridge && !bridge.isOpen && !isBusy && !isWaking && !bridge.pending

  return html`<form class="composer" onSubmit=${e => (e.preventDefault(), send())} ...${attach.dropProps}>
    <div class="composer-box">
      <${Attachments} files=${files} onRemove=${attach.remove} />
      <textarea ref=${area} rows="1" value=${text} placeholder="Reply… (paste or drag images and files)"
        onPaste=${attach.onPaste}
        onInput=${e => setText(e.target.value)}
        onKeyDown=${e => {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) (e.preventDefault(), listening?.stop?.(), send())
          if (e.key === "Escape") e.currentTarget.blur()
        }}></textarea>
      <div class="composer-tools">
        <${AttachButton} onFiles=${attach.add} />
        ${whisper && html`<${MicButton} onText=${addHeard} onError=${ui.toast} />`}
        ${!whisper && canDictate && html`<button type="button" class=${`icon-btn mic ${listening ? "on" : ""}`} onClick=${toggleMic}
          title=${listening ? `Stop dictation${listening.isLocal ? " (on this Mac)" : listening === "starting" ? "" : " (Chrome uses Google's servers)"}` : "Dictate"}>
          <${Icon} name="mic" size=${15} /></button>`}
        ${card && html`<span class="tools-sep"></span><${SessionSettings} id=${id} card=${card} bridge=${bridge} />`}
        <span class="tools-spacer"></span>
        ${isWorking && card && html`<button type="button" class="btn subtle stop" onClick=${() => ui.stopSession(card)}
          title="Stops the running turn, like Esc in Claude desktop (S)"><${Icon} name="stop" size=${12} />Stop</button>`}
        ${isStuck
          ? html`<button type="button" class="btn subtle wake" onClick=${() => ui.launch(id)}
              title="Opens the session in Claude desktop">Open in Claude</button>`
          : canWake && html`<button type="button" class="btn subtle wake" onClick=${wake}
              title="Starts the session in Claude, in the background, so it gets messages">Wake</button>`}
        <button class="btn primary send" disabled=${(!text.trim() && !files.length) || isSending || !!bridge?.isArchived}
          title=${bridge?.isArchived ? "Archived in Claude: unarchive it there to write" : "Send (↵) · new line (⇧↵)"}>
          <${Icon} name="send" size=${14} /></button>
      </div>
    </div>
    <div class="composer-foot">
      <span class=${`live ${state[0]}`}><i></i>${state[1]}</span>
      ${card?.usage && html`<${UsageMeter} usage=${card.usage} wide />`}
    </div>
  </form>`
}

// ---------- permission mode, model and effort ----------

export const MODES = [
  ["default", "Ask", "Asks for approval before each risky action"],
  ["acceptEdits", "Accept edits", "Edits files without asking; asks for the rest"],
  ["plan", "Plan", "Only researches and proposes a plan; changes nothing"],
  ["auto", "Auto", "A classifier decides what to allow without asking you"],
  ["bypassPermissions", "Bypass permissions", "Asks nothing: use it with care"],
]
export const MODELS = [
  ["claude-fable-5-1", "Fable 5.1", "The most capable"],
  ["claude-opus-5-5", "Opus 5.5", "Very capable, for complex work"],
  ["claude-sonnet-5-5", "Sonnet 5.5", "Fast and capable"],
  ["claude-haiku-5-5", "Haiku 5.5", "The fastest and cheapest"],
]
export const EFFORTS = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]]
const modelKey = model => MODELS.find(([id]) => model?.startsWith(id))?.[0] ?? model ?? ""

// A small menu that opens upward from a pill (the reply box sits at the
// bottom): the whole pill opens it, Esc or a click elsewhere closes it.
export function Picker({ icon, value, options, onPick, isDisabled, isWaiting, title }) {
  const [isOpen, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    if (!isOpen) return
    const away = e => !ref.current?.contains(e.target) && setOpen(false)
    const esc = e => e.key === "Escape" && (e.stopImmediatePropagation(), e.preventDefault(), setOpen(false))
    document.addEventListener("pointerdown", away)
    window.addEventListener("keydown", esc, true)
    return () => (document.removeEventListener("pointerdown", away), window.removeEventListener("keydown", esc, true))
  }, [isOpen])
  const current = options.find(([v]) => v === value)
  return html`<span class="picker-wrap" ref=${ref}>
    <button type="button" class=${`sess-set ${isOpen ? "open" : ""} ${isWaiting ? "waiting" : ""}`} disabled=${isDisabled}
      title=${title} aria-haspopup="menu" aria-expanded=${isOpen} onClick=${() => setOpen(o => !o)}>
      <${Icon} name=${icon} size=${13} /><span class="sess-value">${current?.[1] ?? value ?? "—"}</span>
      <${Icon} name="down" size=${11} class="chev" />
    </button>
    ${isOpen && html`<div class="menu up" role="menu">
      ${options.map(([v, label, hint]) => html`<button key=${v} type="button" role="menuitemradio" aria-checked=${v === value}
        class=${v === value ? "on" : ""} onClick=${() => (setOpen(false), v !== value && onPick(v))}>
        <span class="pick-text"><b>${label}</b>${hint && html`<span>${hint}</span>`}</span>
        ${v === value && html`<${Icon} name="check" size=${13} />`}
      </button>`)}
    </div>`}
  </span>`
}

// The session's settings, changed through its bridge mod (v4): the mode with
// the desktop app's own tool (its approval card for a mode that asks less),
// the model as /model (the turns use it; the app's picker keeps its old label).
// Effort is shown only: the app sends its own with every message.
function SessionSettings({ id, card, bridge }) {
  const ui = useContext(Ctx)
  const [asked, setAsked] = useState(null) // { requestId, key, value } until the mod answers
  useEffect(() => {
    if (!asked || bridge?.settings?.id !== asked.requestId) return
    const failed = Object.entries(bridge.settings.results).filter(([, r]) => r !== "ok")
    ui.toast(failed.length ? `Could not change: ${failed.map(([, r]) => r).join(" · ")}` : "Change applied")
    setAsked(null)
  }, [bridge?.settings?.id])
  const change = async (key, value) => {
    const res = await post(`/api/sessions/${id}/settings`, { [key]: value })
    if (!res.body.ok) return ui.toast(res.body.error ?? "Could not request the change")
    // A session in Auto changes its mode when the conversation asks: sent as a message.
    if (res.body.messageId) return ui.toast("Sent as a message: in Auto, Claude changes the mode when the conversation asks")
    setAsked({ requestId: res.body.requestId, key, value })
    ui.toast(res.body.isOpen ? "Change sent: it applies as soon as the session is free" : "Change saved: it applies when the session opens")
  }
  const isOld = bridge && bridge.version < 4
  const valueOf = (key, current) => (asked?.key === key ? asked.value : current ?? "")
  const select = (key, options, current, title) => {
    const value = valueOf(key, current)
    const list = value && !options.some(([v]) => v === value) ? [[value, value, ""], ...options] : options
    return html`<${Picker} icon=${{ mode: "lock", model: "bot" }[key]} value=${value} options=${list}
      isDisabled=${!bridge || isOld} isWaiting=${asked?.key === key} onPick=${v => change(key, v)}
      title=${isOld ? "This session started with an older bridge mod: close it and open it again" : title} />`
  }
  const effort = EFFORTS.find(([v]) => v === card?.effort)?.[1]
  return html`<div class="sess-settings">
    ${select("mode", MODES, card?.mode, "Permission mode")}
    ${select("model", MODELS, modelKey(card?.usage?.model), "Model. Claude desktop still shows the previous one in its picker, but the session uses this one")}
    ${effort && html`<span class="sess-set readonly" title="Effort (read-only). Change it in Claude desktop: it sends its own with every message">
      <${Icon} name="gauge" size=${13} /><span class="sess-value">${effort}</span></span>`}
  </div>`
}
