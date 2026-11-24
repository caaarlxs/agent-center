// An iOS simulator running on this Mac (lib/simulator.ts), beside the
// conversation: its screen as it changes, and your pointer and keyboard on
// it. It is the same simulator Claude desktop or Xcode booted, so the agent
// sees what you do and you see what it does. A click is a tap, a click held
// a long press, a drag a swipe; with the screen clicked, what you type (or
// paste) goes to the field focused there.
//
// It costs only while you look: the picture is asked for while this is open
// and the window shows, and the list of simulators is read again only while
// none runs.
import { Home, Lock, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { openDialog } from "@/app/open-dialog"
import { Button } from "@/components/ui/button"
import { get, post } from "@/lib/api"
import { toast } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { type Sample, type Size, gestureOf, oriented } from "./gesture"

type Device = { udid: string; name: string; os: string }
type Running = { hasTool: boolean; devices: Device[] }

const LOOK_AGAIN_MS = 5000
const TYPING_PAUSE_MS = 250 // what you type goes in one piece once you pause
const KEYS: Record<string, string> = { Enter: "enter", Backspace: "backspace", Tab: "tab", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }
const btn = "inline-grid size-7 shrink-0 place-items-center rounded-[7px] text-text-muted hover:bg-press hover:text-text active:scale-[0.92] disabled:opacity-40 [&_svg]:size-[15px]"

// The simulators running: read on opening, and again every few seconds while there is none.
function useRunning() {
  const [running, setRunning] = useState<Running | null>(null)
  const isEmpty = !running?.devices.length
  useEffect(() => {
    let alive = true
    const read = () => get<Running>("/api/simulators").then(r => alive && setRunning(r), () => alive && setRunning({ hasTool: true, devices: [] }))
    void read()
    const timer = isEmpty ? setInterval(() => document.hidden || void read(), LOOK_AGAIN_MS) : undefined
    return () => ((alive = false), clearInterval(timer))
  }, [isEmpty])
  return running
}

// True while the window shows: a hidden one asks for no picture.
function useShown() {
  const [isShown, setShown] = useState(!document.hidden)
  useEffect(() => {
    const on = () => setShown(!document.hidden)
    document.addEventListener("visibilitychange", on)
    return () => document.removeEventListener("visibilitychange", on)
  }, [])
  return isShown
}

function Screen({ udid }: { udid: string }) {
  const isShown = useShown()
  const [screen, setScreen] = useState<Size | null>(null)
  const [isLost, setLost] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  const keys = useRef<HTMLTextAreaElement>(null)
  const down = useRef<Sample | null>(null)
  useEffect(() => {
    let alive = true
    void get<{ screen: Size | null }>(`/api/simulators/${udid}/screen`).then(r => alive && setScreen(r.screen), () => {})
    return () => void (alive = false)
  }, [udid])
  const send = (action: object) => post("/api/simulators/input", { udid, action }).catch((err: Error) => toast.error(err.message))
  const sampleOf = (e: React.PointerEvent): Sample => ({ x: e.clientX, y: e.clientY, at: e.timeStamp })
  const onUp = (e: React.PointerEvent) => {
    const from = down.current
    const el = img.current
    down.current = null
    if (!from || !el || !screen) return
    void send(gestureOf(from, sampleOf(e), el.getBoundingClientRect(), oriented(screen, { width: el.naturalWidth, height: el.naturalHeight })))
  }
  // What you type, in one piece once you pause.
  const typed = useRef("")
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    typed.current += e.currentTarget.value
    e.currentTarget.value = ""
    clearTimeout(pause.current)
    pause.current = setTimeout(() => (void send({ kind: "text", text: typed.current }), (typed.current = "")), TYPING_PAUSE_MS)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const name = KEYS[e.key]
    if (!name || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    void send({ kind: "key", name })
  }
  if (isLost) return <p className="self-center px-6 text-center text-[13px] text-text-muted">The simulator stopped sending its screen. <button className="underline" onClick={() => setLost(false)}>Try again</button></p>
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-4">
      {isShown && (
        <img ref={img} src={`/api/simulators/${udid}/stream`} alt="The simulator's screen" draggable={false} onError={() => setLost(true)}
          className={cn("max-h-full max-w-full touch-none rounded-[28px] shadow-pop select-none", screen ? "cursor-pointer" : "cursor-progress")}
          onPointerDown={e => (e.currentTarget.setPointerCapture(e.pointerId), (down.current = sampleOf(e)), keys.current?.focus({ preventScroll: true }))}
          onPointerUp={onUp} onPointerCancel={() => (down.current = null)} />
      )}
      {/* Where the keyboard lands once the screen is clicked: unseen, so the board's own keys stay out of it. */}
      <textarea ref={keys} aria-label="Type on the simulator" onInput={onInput} onKeyDown={onKeyDown} autoCapitalize="off" autoCorrect="off" spellCheck={false}
        className="pointer-events-none absolute size-px opacity-0" />
    </div>
  )
}

export function Simulator({ onClose }: { onClose: () => void }) {
  const running = useRunning()
  const [picked, setPicked] = useState<string | null>(null)
  const devices = running?.devices ?? []
  const device = devices.find(d => d.udid === picked) ?? devices[0]
  const press = (name: string) => device && post("/api/simulators/input", { udid: device.udid, action: { kind: "button", name } }).catch((err: Error) => toast.error(err.message))
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        {devices.length > 1
          ? <select value={device?.udid} onChange={e => setPicked(e.target.value)} aria-label="Simulator" className="h-7 min-w-0 rounded-[7px] border border-line bg-bg px-2 text-[12.5px]">{devices.map(d => <option key={d.udid} value={d.udid}>{d.name} · {d.os}</option>)}</select>
          : <span className="min-w-0 truncate px-1.5 text-[12.5px] font-[550]">{device ? `${device.name} · ${device.os}` : "Simulator"}</span>}
        <span className="ml-auto flex items-center gap-1">
          <button className={btn} disabled={!device} onClick={() => void press("home")} title="Home"><Home /></button>
          <button className={btn} disabled={!device} onClick={() => void press("lock")} title="Lock"><Lock /></button>
          <button className={btn} onClick={onClose} title="Close (Esc)"><X className="size-4!" /></button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 justify-center bg-side">
        {!running ? null
          : !running.hasTool ? (
            <div className="flex flex-col items-center gap-3 self-center px-6 text-center text-[13px] text-text-muted">
              <p className="m-0">The simulator needs one install on this Mac.</p>
              <Button onClick={() => openDialog({ kind: "setup" })}>Set it up</Button>
            </div>
          )
          : !device ? <p className="self-center px-6 text-center text-[13px] text-text-muted">No simulator is running. Start one in Claude desktop or Xcode and it shows here.</p>
          : <Screen key={device.udid} udid={device.udid} />}
      </div>
    </div>
  )
}
