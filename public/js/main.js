// Agent Center front end: state, live data, keyboard, and the layout.
import { html, render, useCallback, useContext, useEffect, useMemo, useRef, useState } from "../vendor/preact-htm.js"
import { Board, Inbox } from "./board.js"
import { Canvas } from "./canvas.js"
import { canvasOrder } from "./canvas-layout.js"
import { CARD_COLORS } from "./components.js"
import { newNote } from "./canvas-notes.js"
import { Ctx, Kbd } from "./ctx.js"
import { Digest, Help, NewSession } from "./dialogs.js"
import { Setup } from "./setup.js"
import { Icon } from "./icons.js"
import { useFlip } from "./motion.js"
import { Reader } from "./reader.js"
import { RunDialog } from "./run.js"
import { SearchPalette } from "./search.js"
import { Sidebar } from "./sidebar.js"
import { chime } from "./sound.js"
import { TIERS, Tiers, tierOf, toTier } from "./tiers.js"
import { Toasts } from "./toasts.js"
import { COLUMNS, PARK_OPTIONS, clock, get, isTyping, keep, load, post } from "./util.js"

const OVERRIDE_MS = 6000

// Enter keeps its own job on these (press, pick, tick, unfold): it opens the
// selected conversation only from elsewhere.
const ENTER_KEEPS = "button, a[href], summary, [role=button], [role=option], [role=radio], [role=checkbox], [role=tab], [role=menuitem], [role=menuitemradio]"

// The order the keyboard walks: what the current view shows, top to bottom.
function walkOrder(view, cards, showDone, groupBy, repos) {
  if (view === "canvas") return canvasOrder(cards)
  if (view === "tiers") {
    const pinnedFirst = list => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned))
    return TIERS.filter(t => t.key !== "close" || showDone).flatMap(t => pinnedFirst(cards.filter(c => c.column !== "archived" && tierOf(c) === t.key)))
  }
  const cols = COLUMNS.filter(c => c !== "done" || showDone)
  const pinnedFirst = list => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  if (view === "board" && groupBy === "repo")
    return repos.flatMap(r => cols.flatMap(col => pinnedFirst(cards.filter(c => c.repoRoot === r.root && c.column === col))))
  if (view === "board") return cols.flatMap(col => pinnedFirst(cards.filter(c => c.column === col)))
  const pinned = cards.filter(c => c.pinned && c.column !== "done")
  return [
    ...pinned,
    ...COLUMNS.filter(c => c !== "done" || showDone).flatMap(col =>
      cards.filter(c => c.column === col && !(c.pinned && c.column !== "done")),
    ),
  ]
}

// The reader's tabs that need the whole width: they open as a workspace.
const WORKSPACES = new Set(["changes", "code", "files"])
const SIDE_W = { full: 256, slim: 60 } // the sidebar's width (styles.css --side-w)

function App() {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const [lostAt, setLostAt] = useState(null) // when the live connection dropped
  // Notifications: "on", "off", or "blocked" (Chrome denied them).
  const permission = () => ("Notification" in window ? Notification.permission : "denied")
  const [notify, setNotifyRaw] = useState(() => (permission() === "denied" ? "blocked" : load("notify", "off")))
  // A chime when a session ends its turn or asks you something: "on" or "off".
  const [sound, setSoundRaw] = useState(() => load("sound", "off"))
  // Read aloud (Setup): what a session did when its turn ends, for every
  // session ("all"), only the ones with the bell ("watched") or none ("off").
  const [speech, setSpeechRaw] = useState(() => load("speech", { mode: "off", voice: null, rate: null }))
  const setSpeech = next => (setSpeechRaw(next), keep("speech", next))
  // The sidebar's quick switch: off, or back to the last choice.
  const toggleSpeech = () => {
    const next = speech.mode === "off" ? { ...speech, mode: speech.lastMode ?? "all" } : { ...speech, mode: "off", lastMode: speech.mode }
    setSpeech(next)
    if (next.mode === "off") void post("/api/speak/stop") // and quiet now
    toast(next.mode === "off" ? "Read aloud off" : `Read aloud on: ${next.mode === "all" ? "every session" : "only sessions with the bell"}`)
  }
  // Sessions you asked to hear about once (the bell on a card): a chime, a
  // note and, in another window, a notification when the turn ends or asks.
  const [watched, setWatchedRaw] = useState(() => new Set(load("watched", [])))
  const setWatched = next => (setWatchedRaw(next), keep("watched", [...next]))
  const toggleWatch = card => {
    const next = new Set(watched)
    next.has(card.id) ? next.delete(card.id) : next.add(card.id)
    setWatched(next)
    toast(next.has(card.id) ? `You will hear when “${card.title}” finishes or asks you` : "No more notice for it")
  }
  // First run, or a required step missing (the hook, the bridge mod): the
  // setup opens by itself, until closed once.
  useEffect(() => {
    get("/api/setup").then(res => res && !res.isReady && !load("setupSeen", false) && setDialog(d => d ?? "setup"))
  }, [])
  // Cards that wait for you give a short shake now and then; "off" keeps them still.
  const [shake, setShakeRaw] = useState(() => load("shake", "on"))
  const setShake = v => (setShakeRaw(v), keep("shake", v))
  const [now, setNow] = useState(Date.now())
  const [chosenView, setViewRaw] = useState(load("view", "inbox"))
  const [repoFilter, setRepoFilterRaw] = useState(load("repoFilter", null))
  const [showDone, setShowDoneRaw] = useState(load("showDone", false))
  const [groupBy, setGroupByRaw] = useState(load("groupBy", "none"))
  const [selected, setSelected] = useState(null)
  const [reader, setReader] = useState(null) // { id, tab, file }
  // What the reader pane draws: the open reader, or the one closing, kept
  // until its slide-out ends.
  const [shown, setShown] = useState(null)
  const [parkMenu, setParkMenu] = useState(null)
  const [colorMenu, setColorMenu] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [isSearching, setSearching] = useState(false) // the search palette is open
  const [opened, setOpened] = useState(null) // the search result last opened (a session not on the board)
  const [toasts, setToasts] = useState([])
  const [dialog, setDialog] = useState(null) // "new" | "help" | "digest"
  const [newDraft, setNewDraft] = useState(null) // "New session" filled in: a suggested task
  const [runFor, setRunFor] = useState(null) // the card whose "Run" window is open
  const [isSideOpen, setSideOpen] = useState(false)
  const [isDrawingZone, setDrawingZone] = useState(false) // the next drag on the canvas draws a zone
  // The canvas needs room; on a phone the inbox stands in for it.
  const [isNarrow, setNarrow] = useState(() => matchMedia("(max-width: 860px)").matches)
  // The conversation panel's width: yours when you dragged its edge, wide
  // after the expand button, else the default. The same for every tab.
  const [readerW, setReaderWRaw] = useState(() => load("readerW", null))
  const [isWide, setWide] = useState(false)
  // The sidebar folded to icons, for the canvas's room. Kept in this browser.
  const [isSlim, setSlimRaw] = useState(() => load("sideSlim", false))
  const toggleSlim = () => setSlimRaw(s => (keep("sideSlim", !s), !s))
  const [needsRoom, setNeedsRoom] = useState(false) // a view inside asks for width (Changes side by side)
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setVw(window.innerWidth)
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  useEffect(() => {
    const mq = matchMedia("(max-width: 860px)")
    const on = () => setNarrow(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  // What the window shows: the canvas needs room, so a narrow one shows the
  // inbox instead (title, keyboard order and tools follow).
  const view = isNarrow && chosenView === "canvas" ? "inbox" : chosenView
  const [overrides, setOverrides] = useState({})
  const [taskSignal, setTaskSignal] = useState(0)
  const lastUndo = useRef(null)
  const settleTimer = useRef(null)
  const contentRef = useRef()
  const composerFocus = useRef(null)

  // Choosing a view (the sidebar, keys 1 2 3) also leaves a search.
  const setView = v => (setViewRaw(v), keep("view", v), setDrawingZone(false))
  const setRepoFilter = r => (setRepoFilterRaw(r), keep("repoFilter", r), setSideOpen(false))
  const setShowDone = v => (setShowDoneRaw(v), keep("showDone", v))
  const setGroupBy = v => (setGroupByRaw(v), keep("groupBy", v))

  // ---------- live data ----------
  useEffect(() => {
    const source = new EventSource("/api/stream")
    source.onopen = () => (setConnected(true), setLostAt(null))
    source.onerror = () => (setConnected(false), setLostAt(t => t ?? Date.now()))
    source.onmessage = e => {
      setConnected(true)
      setLostAt(null)
      setData(JSON.parse(e.data))
      setTaskSignal(s => s + 1)
    }
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => (source.close(), clearInterval(tick))
  }, [])

  // The Dock icon counts the sessions that ask you something. A session that
  // starts asking while you look elsewhere raises a macOS notification; a
  // click on it opens that conversation (sw.js forwards the click here).
  // "Run" on the shell blocks shows only while Setup allows it.
  useEffect(() => void document.documentElement.classList.toggle("can-run", !!data?.canRunCommands), [data?.canRunCommands])

  const asked = useRef(null)
  const working = useRef(null)
  useEffect(() => {
    if (!data) return
    const asking = data.cards.filter(c => c.column === "asking")
    if (navigator.setAppBadge) (asking.length ? navigator.setAppBadge(asking.length) : navigator.clearAppBadge()).catch(() => {})
    const before = asked.current
    asked.current = new Set(asking.map(c => c.id))
    // The chime plays wherever you look, the board included: one per update,
    // the higher one when a session starts asking, else when a turn ends.
    const wasWorking = working.current
    working.current = new Set(data.cards.filter(c => c.column === "working").map(c => c.id))
    if (sound === "on" && before && wasWorking) {
      if (asking.some(c => !before.has(c.id))) chime("ask")
      else if ([...wasWorking].some(id => !working.current.has(id) && data.cards.some(c => c.id === id && c.column !== "archived"))) chime("done")
    }
    // Read aloud: its recap, in the Mac's voice (lib/speech.ts). Not the
    // session you are reading on the board right now.
    if (speech.mode !== "off" && before && wasWorking) {
      for (const c of data.cards) {
        const isNew = (wasWorking.has(c.id) && c.column !== "working" && c.column !== "archived") || (c.column === "asking" && !before.has(c.id))
        if (!isNew || (speech.mode === "watched" && !watched.has(c.id)) || (reader?.id === c.id && document.hasFocus())) continue
        const kind = c.column === "asking" ? (c.state === "permission" ? "permission" : "ask") : "done"
        void post(`/api/sessions/${c.id}/speak`, { kind, voice: speech.voice, rate: speech.rate })
      }
    }
    // A watched session that ends its turn or starts asking: told once, even
    // with the sound off, then no longer watched.
    if (before && wasWorking && watched.size) {
      const told = data.cards.filter(c => watched.has(c.id) && ((wasWorking.has(c.id) && c.column !== "working") || (c.column === "asking" && !before.has(c.id))))
      if (told.length) {
        if (sound !== "on") chime(told.some(c => c.column === "asking") ? "ask" : "done")
        for (const c of told) {
          const what = c.column === "asking" ? (c.state === "permission" ? "needs your approval" : "asks you something") : "finished"
          toast(`“${c.title}” ${what}`)
          if (notify === "on" && permission() === "granted" && !document.hasFocus()) showNotice(c.title, what[0].toUpperCase() + what.slice(1), c.id)
        }
        setWatched(new Set([...watched].filter(id => !told.some(c => c.id === id))))
      }
    }
    if (!before || notify !== "on" || permission() !== "granted" || document.hasFocus()) return
    for (const c of asking) {
      if (before.has(c.id)) continue
      showNotice(c.title, c.ask || (c.state === "permission" ? "Needs approval to continue" : "Asking you something"), c.id)
    }
  }, [data])

  // Through the service worker (its click opens the session); straight from
  // the page when there is none. Resolves to an error message, or null.
  const showNotice = async (title, body, id = "test") => {
    const options = { body, tag: id, data: { id: id === "test" ? null : id }, icon: "/icon-192.png", renotify: true }
    try {
      const reg = await Promise.race([navigator.serviceWorker?.ready, new Promise(r => setTimeout(r, 2000))])
      if (reg?.showNotification) await reg.showNotification(title, options)
      else new Notification(title, options)
      return null
    } catch (err) {
      console.warn("notification", err)
      return String(err?.message ?? err)
    }
  }

  useEffect(() => {
    const onMessage = e => e.data?.open && openReader(e.data.open)
    navigator.serviceWorker?.addEventListener("message", onMessage)
    // Opened from a notification while no window was open (?open=<session>),
    // or a link to a view or a dialog (?view=board, ?dialog=setup).
    const params = new URLSearchParams(location.search)
    const id = params.get("open")
    const linkedView = params.get("view")
    const linkedDialog = params.get("dialog")
    if (["inbox", "board", "canvas", "tiers"].includes(linkedView)) setViewRaw(linkedView)
    if (["setup", "help", "new", "digest"].includes(linkedDialog)) setDialog(linkedDialog)
    if (id) openReader(id)
    if (id || linkedView || linkedDialog) history.replaceState(null, "", "/")
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage)
  }, [])

  // Ends the running turn through the bridge mod, like Esc in the app.
  const stopSession = async card => {
    const res = await post(`/api/sessions/${card.id}/stop`)
    toast(res.body.ok ? `Stopping “${card.title}”…` : (res.body.error ?? "Could not stop"))
  }

  const toggleSound = () => {
    const next = sound === "on" ? "off" : "on"
    setSoundRaw(next)
    keep("sound", next)
    if (next === "on") chime("done") // what you will hear
    toast(next === "on" ? "Sound on: a chime when a session finishes or asks you something" : "Sound off")
  }

  const toggleNotify = async () => {
    if (notify === "on") return (setNotifyRaw("off"), keep("notify", "off"))
    if (!("Notification" in window)) return toast("This browser does not support notifications")
    const answer = permission() === "default" ? await Notification.requestPermission() : permission()
    if (answer !== "granted") return (setNotifyRaw("blocked"), toast("Chrome blocks notifications here: turn them on in the site settings"))
    setNotifyRaw("on")
    keep("notify", "on")
    // A first notice right away: proof that Chrome and macOS let it through.
    const error = await showNotice("Notifications on", "This is how a notification arrives when a session asks you something.")
    toast(error ? `Chrome could not show the notification: ${error}` : "Test notification sent. If you do not see it, check the macOS notification settings for this app")
  }

  // Optimistic changes stand until the server agrees, or a few seconds pass.
  useEffect(() => {
    if (!data) return
    setOverrides(o => {
      const left = {}
      for (const [id, ov] of Object.entries(o)) {
        const card = data.cards.find(c => c.id === id)
        const agrees = card && (ov.column === undefined || card.column === ov.column) && (ov.pinned === undefined || card.pinned === ov.pinned) &&
          (ov.isUnread === undefined || card.isUnread === ov.isUnread) && (ov.title === undefined || card.title === ov.title)
        if (!agrees && Date.now() - ov.at < OVERRIDE_MS) left[id] = ov
      }
      return left
    })
  }, [data])

  const cards = useMemo(() => {
    if (!data) return []
    return data.cards
      .map(c => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c))
      .filter(c => !repoFilter || c.repoRoot === repoFilter)
  }, [data, overrides, repoFilter])

  useEffect(() => {
    if (data && repoFilter && !data.repos.some(r => r.root === repoFilter)) setRepoFilter(null)
  }, [data])

  // "Next up" (F): what waits for you, in the order to see it: approvals,
  // then questions (the longest waiting first), then what is new to review
  // (the oldest first). Each press opens the next one, its reply box ready.
  const waiting = useMemo(() => {
    const since = c => c.waitingSince ?? c.lastActivity ?? 0
    const asking = cards.filter(c => c.column === "asking").sort((a, b) => since(a) - since(b))
    return [
      ...asking.filter(c => c.state === "permission"),
      ...asking.filter(c => c.state !== "permission"),
      ...cards.filter(c => c.column === "review").sort((a, b) => (a.lastActivity ?? 0) - (b.lastActivity ?? 0)),
    ]
  }, [cards])

  const order = useMemo(
    () => walkOrder(view, cards, showDone, groupBy, data?.repos ?? []),
    [view, cards, showDone, groupBy, data],
  )

  const wasOpen = useRef(false)
  useEffect(() => {
    if (reader) {
      setShown(reader)
      // Opening (not switching conversations): the content glides in with the pane.
      if (!wasOpen.current && !matchMedia("(prefers-reduced-motion: reduce)").matches)
        requestAnimationFrame(() =>
          document.querySelector(".reader-slot .reader")?.animate(
            [{ opacity: 0, transform: "translateX(28px)" }, { opacity: 1, transform: "none" }],
            { duration: 420, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
          ),
        )
      wasOpen.current = true
      return
    }
    wasOpen.current = false
    const timer = setTimeout(() => setShown(null), 440)
    return () => clearTimeout(timer)
  }, [reader])

  // Back and forward (the mouse's side buttons, the window's arrows) walk the
  // conversations you opened, as in Claude desktop: each one opened is a
  // history entry. Going back, the panel slides out and the one before
  // slides in; to an entry with none open, it closes.
  const fromHistory = useRef(false)
  useEffect(() => {
    const id = reader?.id ?? null
    if (fromHistory.current) return void (fromHistory.current = false)
    if ((history.state?.reader ?? null) !== id) history.pushState({ reader: id }, "")
  }, [reader?.id])
  useEffect(() => {
    const onPop = e => {
      const id = e.state?.reader ?? null
      const now = latest.current.reader?.id ?? null
      if (id === now) return
      fromHistory.current = true
      if (!id) return void (setReader(null), setSelected(null))
      if (!now) return void openReader(id)
      setReader(null)
      setTimeout(() => ((fromHistory.current = true), openReader(id)), 300)
    }
    addEventListener("popstate", onPop)
    return () => removeEventListener("popstate", onPop)
  }, [])

  // Cards travel when they change place; one that leaves flies to where it
  // went: the "Done" button, a folded group, or fades if archived.
  useFlip(contentRef, `${view}|${isNarrow}|${groupBy}|${repoFilter}|${showDone}|${!!data}`, id => {
    // With what was just done here (archived, done…), ahead of the server.
    const card = cards.find(c => c.id === id) ?? data?.cards.find(c => c.id === id)
    return card ? card.column : null
  })

  // ---------- title and dock badge ----------
  useEffect(() => {
    const asking = (data?.cards ?? []).filter(c => c.column === "asking").length
    const unread = (data?.cards ?? []).filter(c => c.isUnread && c.column !== "done").length
    document.title = asking ? `(${asking}) Agent Center` : unread ? `• Agent Center` : "Agent Center"
    if (navigator.setAppBadge) (asking ? navigator.setAppBadge(asking) : navigator.clearAppBadge()).catch(() => {})
  }, [data])

  // ---------- actions ----------
  const dismissToast = id => setToasts(ts => ts.filter(t => t.id !== id))
  const toast = useCallback((text, undo) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(ts => [...ts.slice(-2), { id, text, undo }])
    if (undo) lastUndo.current = () => (dismissToast(id), undo())
    setTimeout(() => dismissToast(id), undo ? 7000 : 3500)
  }, [])

  const OPTIMISTIC = {
    pin: () => ({ pinned: true }),
    unpin: () => ({ pinned: false }),
    park: p => ({ column: "parked", parkedUntil: p.until ?? null }),
    done: () => ({ column: "done", pinned: false }),
    archive: () => ({ column: "archived", pinned: false }),
    unseen: () => ({ column: "review", isUnread: true }),
    color: p => ({ color: p.color || null }),
    tier: p => ({ tier: p.tier || "other" }),
  }
  const INVERSE = { pin: "unpin", unpin: "pin", park: "unpark", done: "undone", archive: "unarchive", unseen: "seen" }
  const MESSAGES = { done: "Marked as done", park: "Moved to Later", pin: "Pinned", unpin: "Unpinned", archive: "Archived", unseen: "Marked to review" }

  // Undo drops the optimistic change at once instead of waiting for it to expire.
  const forget = ids =>
    setOverrides(o => {
      const rest = { ...o }
      for (const id of ids) delete rest[id]
      return rest
    })

  // While an archived card falls (motion.js), the cards around it wait before
  // closing the gap: their move and their stacking change are held back.
  const holdForDrop = () => {
    const root = contentRef.current
    if (!root) return
    root.setAttribute("data-settling", "")
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => root.removeAttribute("data-settling"), 900)
  }

  const act = useCallback(async (card, action, payload = {}) => {
    // Keep the keyboard's place when the card leaves the list.
    if ((action === "done" && !showDone) || action === "park") {
      const i = order.findIndex(c => c.id === card.id)
      const next = order[i + 1] ?? order[i - 1]
      if (selected === card.id) setSelected(next?.id ?? null)
    }
    // Marked to review while open: what the open reader shows must not count as seen again.
    if (action === "unseen") keepUnread.current.add(card.id)
    const patch = OPTIMISTIC[action]?.(payload)
    if (action === "archive") holdForDrop()
    if (patch) setOverrides(o => ({ ...o, [card.id]: { ...patch, at: Date.now() } }))
    const res = await post(`/api/sessions/${card.id}/${action}`, payload)
    if (!res.body.ok) {
      forget([card.id])
      return toast(res.body.error ?? "Could not save")
    }
    const inverse = INVERSE[action]
    if (MESSAGES[action])
      toast(`${MESSAGES[action]}: ${card.title}`, inverse && (() => (forget([card.id]), post(`/api/sessions/${card.id}/${inverse}`))))
  }, [order, selected, showDone])

  // The tier list: a row up or down, or to the one named. "Close" marks it done.
  const moveToTier = useCallback(async (card, key) => {
    const steps = toTier(card, key)
    if (!steps) return
    for (const [action, payload] of steps) await act(card, action, payload)
    if (key !== "close" && key !== "paused") toast(`${TIERS.find(t => t.key === key).label}: ${card.title}`)
  }, [act])

  const archiveAll = useCallback(async list => {
    const at = Date.now()
    holdForDrop()
    setOverrides(o => ({ ...o, ...Object.fromEntries(list.map(c => [c.id, { column: "archived", at }])) }))
    await Promise.all(list.map(c => post(`/api/sessions/${c.id}/archive`)))
    toast(`${list.length === 1 ? "1 session archived" : `${list.length} sessions archived`}`, () => {
      forget(list.map(c => c.id))
      return Promise.all(list.map(c => post(`/api/sessions/${c.id}/unarchive`)))
    })
  }, [])

  const launch = useCallback(async id => {
    const res = await post(`/api/sessions/${id}/open`)
    if (!res.body.ok) toast(res.body.error ?? "Could not open the session")
  }, [])

  const seenPosts = useRef({})
  const keepUnread = useRef(new Set()) // marked "to review" by hand: not seen until opened again
  const markSeen = id => {
    setOverrides(o => ({ ...o, [id]: { ...o[id], isUnread: false, at: Date.now() } }))
    if (Date.now() - (seenPosts.current[id] ?? 0) < 3000) return
    seenPosts.current[id] = Date.now()
    post(`/api/sessions/${id}/seen`)
  }

  // Every link opens in a new window (the links inside messages too), so the
  // board never navigates away from itself.
  useEffect(() => {
    const onClick = e => {
      const a = e.target.closest?.("a[href]")
      if (!a || e.defaultPrevented || a.getAttribute("href").startsWith("#") || a.hasAttribute("download")) return
      e.preventDefault()
      window.open(a.href, "_blank", "noopener,noreferrer")
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])
  // Opened with a click on a card: the cursor waits in the reply field, ready
  // to type. Not from the keyboard (the shortcuts would stop working) nor on a
  // phone (the keyboard would cover the conversation).
  const lastPointer = useRef(0)
  useEffect(() => {
    const onDown = () => (lastPointer.current = Date.now())
    addEventListener("pointerdown", onDown, true)
    return () => removeEventListener("pointerdown", onDown, true)
  }, [])
  const openReader = useCallback((id, tab = "chat") => {
    setSelected(id)
    setReader({ id, tab })
    setParkMenu(null)
    keepUnread.current.delete(id)
    markSeen(id)
    if (tab === "chat" && Date.now() - lastPointer.current < 1000 && !matchMedia("(max-width: 860px)").matches)
      setTimeout(() => composerFocus.current?.focus(), 120)
  }, [])

  // Opens what waits for you after the one open now, its reply box ready.
  const nextUp = () => {
    if (!waiting.length) return toast("Nothing waits for you")
    const i = waiting.findIndex(c => c.id === reader?.id)
    if (i !== -1 && waiting.length === 1) return toast("Nothing else waits for you")
    const next = waiting[(i + 1) % waiting.length]
    openReader(next.id)
    // On the canvas, the canvas also goes to it (canvas.js).
    window.dispatchEvent(new CustomEvent("canvas:focus", { detail: next.id }))
    setTimeout(() => composerFocus.current?.focus(), 150)
  }

  // While a conversation is open, what arrives in it counts as seen.
  useEffect(() => {
    const card = reader && data?.cards.find(c => c.id === reader.id)
    if (card?.isUnread && !keepUnread.current.has(card.id)) markSeen(card.id)
  }, [reader?.id, data])

  // A reply Claude offered, or any text, delivered by the bridge mod. A reply
  // that ends asking for more ("…is: ") is a template: it goes to the reply
  // field to be completed, never sent as is.
  const reply = useCallback(async (card, text) => {
    if (/[:…]\s*$|\.\.\.\s*$/.test(text)) {
      setSelected(card.id)
      setReader({ id: card.id, tab: "chat" })
      setTimeout(() => composerFocus.current?.fill(text.trimEnd() + " "), 120)
      return
    }
    const res = await post(`/api/sessions/${card.id}/send`, { text })
    if (!res.body.ok) return toast(res.body.error ?? "Could not send")
    toast(res.body.isOpen ? `Replied: “${text.slice(0, 60)}”` : "Reply queued: it arrives when the session is free")
  }, [])

  const rename = useCallback(async (card, title) => {
    setOverrides(o => ({ ...o, [card.id]: { ...o[card.id], title: title || card.title, at: Date.now() } }))
    const res = await post(`/api/sessions/${card.id}/rename`, { title })
    if (!res.body.ok) toast(res.body.error ?? "Could not rename")
  }, [])

  // options: the first turn's mode, model and effort; worktree; the suggested
  // task it starts (suggestion).
  const newSession = async (folder, prompt, send, options = {}) => {
    const res = await post("/api/new", { folder, prompt, send, ...options })
    if (!res.body.ok) {
      toast(res.body.error ?? "Could not create the session")
      return false
    }
    if (res.body.id) {
      toast(options.worktree ? "Session created in a new worktree: Claude is working" : "Session created: Claude is working")
      setTimeout(() => openReader(res.body.id), 600)
    } else toast("New session opened in Claude")
    return true
  }

  // A click on empty space closes the reader; a click on another session
  // switches it (the row's own handler), and controls keep working.
  useEffect(() => {
    if (!reader) return
    const KEEP = ".reader, .reader-resize, .card, .ccard, .note, .row, .menu, dialog, .toasts, button, a, input, textarea, select, label, .scrim"
    const onDown = e => {
      if (e.button !== 0 || e.target.closest(KEEP)) return
      setReader(null)
      setSelected(null) // closing the conversation lets go of its card too
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [!!reader])

  // ---------- keyboard ----------
  // The handler is added once and reads the newest state from a ref, so two
  // keys pressed between renders both see what the first one did.
  const latest = useRef({})
  latest.current = { dialog, isSearching, parkMenu, colorMenu, reader, selected, cards, order, act, launch, openReader, nextUp, view, moveToTier }
  useEffect(() => {
    const onKey = e => {
      const { dialog, isSearching, parkMenu, colorMenu, reader, selected, cards, order, act, launch, openReader, nextUp, view, moveToTier } = latest.current
      if (dialog || isSearching) return // the palette handles its own keys
      const typing = isTyping(e.target)
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
      // "?" arrives as Shift+/ on some layouts and drivers.
      if (!typing && (e.key === "?" || (e.code === "Slash" && e.shiftKey))) return (e.preventDefault(), setDialog("help"))
      if (cmdK || (e.key === "/" && !typing)) {
        e.preventDefault()
        setSearching(true)
        return
      }
      if (e.key === "Escape") {
        if (typing) e.target.blur()
        else if (parkMenu) setParkMenu(latest.current.parkMenu = null)
        else if (colorMenu) setColorMenu(latest.current.colorMenu = null)
        // A workspace (Changes, Code, Files) goes back to the conversation first.
        else if (reader && WORKSPACES.has(reader.tab)) setReader((latest.current.reader = { ...reader, tab: "chat" }))
        else if (reader) (setReader((latest.current.reader = null)), setSelected((latest.current.selected = null)))
        else setSelected((latest.current.selected = null))
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const card = cards.find(c => c.id === selected)
      if (parkMenu && card) {
        const option = PARK_OPTIONS.find(o => o.key === e.key)
        if (option) {
          e.preventDefault()
          setParkMenu(null)
          act(card, "park", { until: option.until() })
          return
        }
      }
      if (colorMenu && card && /^[0-9]$/.test(e.key)) {
        // 1–7 pick a colour, 0 takes it off; the views' 1 2 3 wait.
        const color = e.key === "0" ? "" : CARD_COLORS[Number(e.key) - 1]?.key
        if (color === undefined) return
        e.preventDefault()
        setColorMenu(null)
        act(card, "color", { color })
        return
      }
      const move = step => {
        e.preventDefault()
        if (!order.length) return
        const i = order.findIndex(c => c.id === selected)
        const next = order[i === -1 ? (step > 0 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, i + step))]
        setSelected((latest.current.selected = next.id))
        setParkMenu(null)
        setColorMenu(null)
        if (reader) setReader(r => (latest.current.reader = { ...r, id: next.id }))
        // Focus on a card goes along, so Enter (or Space) there opens the selected one.
        const hasCardFocus = !!document.activeElement?.closest?.(".content [data-id]")
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-id="${next.id}"]`)
          if (hasCardFocus) el?.focus({ preventScroll: true })
          el?.scrollIntoView({ block: "nearest" })
        })
      }
      switch (e.key) {
        case "j": case "ArrowDown": return move(1)
        case "k": case "ArrowUp": return move(-1)
        case "Enter":
          if (selected && !e.defaultPrevented && !e.target.closest?.(ENTER_KEEPS)) (e.preventDefault(), openReader(selected))
          return
        case "o": if (selected) launch(selected); return
        case "t":
          if (!selected) return
          e.preventDefault()
          setReader(r => (r?.id === selected ? r : { id: selected, tab: "chat" }))
          setTimeout(() => window.dispatchEvent(new Event("agents:rename")), 50)
          return
        case "r":
          if (!selected) return
          e.preventDefault()
          setReader({ id: selected, tab: "chat" })
          setTimeout(() => composerFocus.current?.focus(), 50)
          return
        case "p": if (card) act(card, card.pinned ? "unpin" : "pin"); return
        case "a": if (card) card.column === "parked" ? act(card, "unpark") : card.column !== "done" && setParkMenu(m => (m ? null : card.id)); return
        case "e": if (card) act(card, card.column === "done" ? "undone" : "done"); return
        case "c": if (card) setColorMenu(m => (m ? null : card.id)); return
        case "z": if (lastUndo.current) (lastUndo.current(), (lastUndo.current = null)); return
        case "g": return setGroupByRaw(g => (keep("groupBy", g === "repo" ? "none" : "repo"), g === "repo" ? "none" : "repo"))
        case "1": return setView("inbox")
        case "2": return setView("board")
        case "3": return setView("canvas")
        case "4": return setView("tiers")
        case "[": case "]": {
          // On the tier list: the selected card one row up ([) or down (]).
          if (!card || view !== "tiers") return
          const i = TIERS.findIndex(t => t.key === tierOf(card))
          const next = TIERS[i + (e.key === "[" ? -1 : 1)]
          if (next) (e.preventDefault(), moveToTier(card, next.key))
          return
        }
        case "n": e.preventDefault(); return setDialog("new")
        case "f": e.preventDefault(); return nextUp()
        case "d": e.preventDefault(); return setDialog("digest")
        case "s": if (card?.column === "working") stopSession(card); return
        case "u": if (card?.column === "pending") act(card, "unseen"); return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ---------- the panel's width ----------
  // The conversation is a side panel; Changes, Code and Files are workspaces:
  // the panel takes the whole width beside the sidebar (Esc goes back).
  const baseW = readerW ?? Math.min(760, Math.max(420, Math.round(vw * 0.42)))
  const isWorkspace = WORKSPACES.has(shown?.tab)
  const wantsWide = isWide || needsRoom
  const readerWidth = isWorkspace ? vw - (isSlim ? SIDE_W.slim : SIDE_W.full) : Math.min(vw - 300, wantsWide ? Math.max(baseW, Math.round(vw * 0.75)) : baseW)
  const resizeReader = e => {
    e.preventDefault()
    const app = e.currentTarget.closest(".app")
    app.classList.add("resizing")
    const move = ev => {
      const w = Math.round(Math.min(window.innerWidth - 300, Math.max(380, window.innerWidth - ev.clientX)))
      app.style.setProperty("--reader-w", `${w}px`)
    }
    const up = ev => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      app.classList.remove("resizing")
      const w = Math.round(Math.min(window.innerWidth - 300, Math.max(380, window.innerWidth - ev.clientX)))
      setWide(false)
      setReaderWRaw(w)
      keep("readerW", w)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  // ---------- layout ----------
  const ui = {
    now, selected, reader, parkMenu, colorMenu, dragging, taskSignal,
    setParkMenu, setColorMenu, setDragging, setView, setRepoFilter, act, moveToTier, archiveAll, launch, openReader, toast, dismissToast, newSession,
    reply, rename,
    closeReader: () => (setReader(null), setSelected(null)),
    setReaderTab: tab => setReader(r => ({ ...r, tab })),
    // One of the open session's files, in its Files tab.
    showFile: file => setReader(r => r && { ...r, tab: "files", file }),
    openDialog: name => (setSideOpen(false), setDialog(name)),
    // A task a session suggested: "New session" with its folder and prompt.
    startSuggestion: draft => (setNewDraft(draft), setDialog("new")),
    fillComposer: text => composerFocus.current?.fill(text),
    openRun: card => setRunFor(card),
    toggleWide: () => setWide(w => !w),
    setNeedsRoom,
    isSlim,
    toggleSlim,
    stopSession,
    toggleNotify,
    toggleSound,
    shake,
    setShake,
    speech,
    setSpeech,
    toggleSpeech,
    registerComposer: fn => (composerFocus.current = fn),
    watched,
    toggleWatch,
  }
  const readerCard = shown && data?.cards.find(c => c.id === shown.id)
  const readerResult = shown && opened?.id === shown.id ? opened : null
  const repoName = repoFilter && data?.repos.find(r => r.root === repoFilter)?.name

  return html`<${Ctx.Provider} value=${ui}>
    <div class=${`app ${reader ? "with-reader" : ""} ${view === "canvas" ? "on-canvas" : ""} ${isSideOpen ? "side-open" : ""} ${dragging ? "is-dragging" : ""} ${shake === "off" ? "no-shake" : ""} ${isSlim ? "slim" : ""}`}
      style=${`--reader-w:${readerWidth}px`}>
      ${data ? html`<${Sidebar} data=${data} repoFilter=${repoFilter} view=${view} connected=${connected} notify=${notify} sound=${sound} />`
        : html`<aside class="sidebar"><div class="brand"><span class="logo"><i></i><i></i><i></i></span>Agent Center</div></aside>`}
      <div class="scrim" onClick=${() => setSideOpen(false)}></div>
      <main class="main">
        <header class="topbar">
          <button class="icon-btn only-narrow" onClick=${() => setSideOpen(o => !o)} title="Menu"><${Icon} name="sidebar" /></button>
          <h1>${{ board: "Board", canvas: "Canvas", tiers: "Tiers" }[view] ?? "Inbox"}${repoName && html`<button class="crumb" onClick=${() => setRepoFilter(null)}
            title="You only see this repo. Click to see all">${repoName}<${Icon} name="x" size=${11} /></button>`}</h1>
          <button class="search" onClick=${() => setSearching(true)} title="Search all conversations (⌘K or /)">
            <${Icon} name="search" size=${15} /><span class="search-ph">Search…</span>
            <span class="search-keys"><${Kbd}>⌘K<//></span>
          </button>
          ${view === "board" && html`<div class="segmented" role="group" aria-label="Group">
            <button class=${groupBy !== "repo" ? "on" : ""} onClick=${() => setGroupBy("none")} title="No grouping (G)">Columns</button>
            <button class=${groupBy === "repo" ? "on" : ""} onClick=${() => setGroupBy("repo")} title="Lanes per repo (G)">By repo</button>
          </div>`}
          ${view === "canvas" && html`<button class=${`btn ${isDrawingZone ? "on" : ""}`} aria-pressed=${isDrawingZone}
            title="Draw a named zone on the canvas to group cards (Esc cancels)" onClick=${() => setDrawingZone(!isDrawingZone)}>
            <${Icon} name="plus" size=${14} /><span class="lbl">Zone</span></button>`}
          ${view === "canvas" && html`<button class="btn" title="Add a note (or double-click the empty canvas)"
            onClick=${() => post("/api/canvas/notes", { notes: [...(data?.notes ?? []), newNote(data?.notes ?? [])] })}>
            <${Icon} name="plus" size=${14} /><span class="lbl">Note</span></button>`}
          ${view !== "canvas" && html`<button class=${`btn ${showDone ? "on" : ""}`} data-fly="done" onClick=${() => setShowDone(!showDone)} title="Show done sessions">Done</button>`}
          <button class=${`btn next-up ${waiting.length ? "has" : ""}`} onClick=${nextUp}
            title=${waiting.length ? `Open what waits for you next: ${waiting.length} (approvals, questions, then what is new) · F` : "Nothing waits for you · F"}>
            Next up${waiting.length > 0 && html`<span class="n">${waiting.length}</span>`}<${Kbd}>F<//></button>
          <button class="btn primary only-narrow" onClick=${() => setDialog("new")} title="New session (N)"><${Icon} name="plus" size=${15} /></button>
        </header>
        <${Offline} lostAt=${lostAt} hasData=${!!data} />
        <${UpdateBanner} update=${data?.update} />
        <div class="content" ref=${contentRef}>
          ${!data
            ? html`<div class="skeleton-rows">${[1, 2, 3, 4, 5].map(i => html`<i key=${i}></i>`)}</div>`
            : view === "board"
                ? html`<${Board} cards=${cards} showDone=${showDone} groupBy=${groupBy} repos=${data.repos} />`
                : view === "tiers"
                ? html`<${Tiers} cards=${cards} showDone=${showDone} />`
              : view === "canvas"
                  ? html`<${Canvas} cards=${cards} zones=${data.zones ?? []} notes=${data.notes ?? []}
                      isDrawingZone=${isDrawingZone} onZoneDrawn=${() => setDrawingZone(false)} />`
                  : html`<${Inbox} cards=${cards} showDone=${showDone} />`}
        </div>
      </main>
      <div class="reader-slot">
        ${shown && html`<div class="reader-resize" onPointerDown=${resizeReader} onDblClick=${() => (setReaderWRaw(null), keep("readerW", null))}
          title="Drag to change the width · double-click: default width"></div>`}
        ${shown && html`<${Reader} key=${shown.id} id=${shown.id} card=${readerCard} result=${readerResult} tab=${shown.tab} file=${shown.file} isWide=${wantsWide} isWorkspace=${isWorkspace}
          hasTasks=${data?.features?.organizer !== false} />`}
      </div>
      <${Toasts} toasts=${toasts} />
      ${dialog === "new" && html`<${NewSession} initialRoot=${repoFilter} draft=${newDraft} onClose=${() => (setDialog(null), setNewDraft(null))} />`}
      ${dialog === "help" && html`<${Help} onClose=${() => setDialog(null)} />`}
      ${dialog === "digest" && html`<${Digest} onClose=${() => setDialog(null)} />`}
      ${isSearching && html`<${SearchPalette} cards=${data?.cards ?? []} onClose=${() => setSearching(false)}
        onOpen=${r => (setOpened(r), openReader(r.id))} />`}
      ${dialog === "setup" && html`<${Setup} notify=${notify} sound=${sound} onClose=${() => (keep("setupSeen", true), setDialog(null))} />`}
      ${runFor && html`<${RunDialog} card=${runFor} onClose=${() => setRunFor(null)} />`}
    </div>
  <//>`
}

// The server does not answer. A short drop (a restart) stays quiet; after a
// few seconds the page says so, and that what it shows may be old.
function Offline({ lostAt, hasData }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!lostAt) return
    const timer = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(timer)
  }, [lostAt])
  if (!lostAt || Date.now() - lostAt < 4000) return null
  return html`<div class="banner offline" role="alert">
    <strong>The server is not responding${hasData ? ` since ${clock(lostAt)}` : ""}.</strong>
    ${hasData ? " What you see may be out of date." : ""} macOS restarts it on its own; the page retries every few seconds.
    If it stays down, check <code>~/organizer/agent-center/logs/server.log</code>.
  </div>`
}

// After a `git pull`: something runs older code than the repository holds
// (lib/freshness.ts): the server, this page, the hook or the bridge mod.
// One click brings it all up to date, then the page reloads once the
// server answers again.
const isStale = (update, loadedPage) => update.server || update.hook || update.bridge || update.page !== loadedPage

function UpdateBanner({ update }) {
  const ui = useContext(Ctx)
  const loadedPage = useRef(null)
  const [isBusy, setBusy] = useState(false)
  if (update && loadedPage.current === null) loadedPage.current = update.page
  if (!update || !isStale(update, loadedPage.current)) return null
  const run = async () => {
    setBusy(true)
    const res = await post("/api/update")
    if (!res.body.ok) return (setBusy(false), ui.toast(res.body.error ?? "Could not update"))
    if (res.body.needsRestart) return (setBusy(false), ui.toast("Restart the server to finish"))
    if (res.body.isRestarting) await serverBack()
    location.reload()
  }
  return html`<div class="banner update" role="status">
    <span>A newer version of Agent Center is on disk.</span>
    <button class="btn primary" disabled=${isBusy} onClick=${run}>${isBusy ? "Updating…" : "Update"}</button>
  </div>`
}

// The server restarting: answered again, or given up after half a minute.
async function serverBack() {
  await new Promise(r => setTimeout(r, 800))
  for (let i = 0; i < 60; i++) {
    if (await get("/api/update")) return
    await new Promise(r => setTimeout(r, 500))
  }
}

render(html`<${App} />`, document.getElementById("app"))
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {})
