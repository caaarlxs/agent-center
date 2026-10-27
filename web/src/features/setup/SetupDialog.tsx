// "Setup" (setup.js): what this Mac needs for the board, one step at a time.
// A step changes something on the Mac only when you press it (lib/setup.ts
// does it), so each one says what it changes. Then how the board tells you
// things (notifications, the chime, the Mac reading the recap aloud) and
// whether waiting cards shake. It opens by itself while a required step is
// missing.
import { Check } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import type { Step } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { notify, shake, sound, speech, toggleNotify, toggleSound, type Speech } from "@/features/alerts/prefs"

type Status = { steps: Step[]; isReady: boolean; voiceLanguage: string; organizerNote: string }
type Need = "Required" | "Recommended" | "Optional" | "Preference"
type Meta = { title: string; need: Need; text: ReactNode; unavailable?: ReactNode; action?: string; outdated?: string; canTurnOff?: boolean }

// What each step is, why it matters and what pressing it changes.
const STEPS: Record<string, Meta> = {
  claude: {
    title: "Claude desktop", need: "Required",
    text: "The board shows, wakes and opens the sessions of the Claude desktop app.",
    unavailable: <>Install it from <a className="text-brand underline underline-offset-2" href="https://claude.ai/download">claude.ai/download</a> and come back here.</>,
  },
  hook: {
    title: "Session tracking", need: "Required", action: "Install", outdated: "Update",
    text: "Copies a hook to ~/.claude/hooks and adds it to ~/.claude/settings.json (it saves a backup first). This way the board knows what each session does and whether it asks you something.",
  },
  bridge: {
    title: "Bridge mod", need: "Required", action: "Install", outdated: "Update",
    text: "A Claude Code mod that delivers your messages, answers questions and approvals, and stops turns from here. Each session loads it when it starts.",
  },
  uploads: {
    title: "Read sent files", need: "Recommended", action: "Allow",
    text: "Lets Claude open the files you send from the board without asking (only their folder, ~/.claude/agent-center/uploads).",
  },
  whisper: {
    title: "Dictation on this Mac", need: "Optional", action: "Install",
    text: "Installs whisper-cpp and ffmpeg with Homebrew and downloads the model (about 550 MB). Your voice never leaves the Mac. Without this, the microphone uses the browser's dictation if it has one.",
  },
  organizer: {
    title: "Tasks", need: "Optional", action: "Install", canTurnOff: true,
    text: "A markdown task list per project (~/organizer). Claude writes down what is still pending and the board shows it in each session. Installs organizer.py and adds the note below to ~/.claude/CLAUDE.md (it saves a backup first). Without this, the Tasks tab does not show.",
  },
  commands: {
    title: "Run commands", need: "Optional", action: "Turn on", canTurnOff: true,
    text: "Adds Run to the shell blocks Claude writes in a conversation, as in Claude desktop: a click runs that command on this Mac, in the session's folder, with your shell (no terminal opens). The output shows under the block, with Stop. It runs exactly what the block says.",
  },
  github: {
    title: "GitHub PRs", need: "Optional",
    text: "With the gh CLI signed in, each card shows its PRs and the conversation lets you review and merge them.",
  },
}
const LANGUAGES = [["auto", "Detect the language"], ["es", "Spanish"], ["en", "English"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"]]
const SPEECH_MODES = [["off", "Off"], ["watched", "Only sessions with the bell"], ["all", "Every session"]]
const DEFAULT_RATE = 190

const select = "h-[30px] rounded-md border border-line-strong bg-surface px-2 text-[13px] text-text focus:border-brand focus:outline-none"
const text = "mt-1.5 text-[12.5px] leading-normal text-text-muted [&_code]:rounded-[5px] [&_code]:bg-hover [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:text-text"

// One card per step: done ones on the sidebar's tone.
function Row({ title, need, state, isDone, children, actions }: { title: string; need?: Need; state?: ReactNode; isDone: boolean; children: ReactNode; actions?: ReactNode }) {
  return (
    <li className={cn("rounded-[10px] border border-line px-[13px] py-[11px]", isDone ? "bg-side" : "bg-surface")}>
      <div className="flex items-center gap-2">
        <b className="text-[13.5px] font-semibold">{title}</b>
        {need && <span className={cn("rounded-full px-[7px] py-px text-[11px] font-semibold", need === "Required" ? "bg-brand-soft text-brand" : "bg-hover text-text-muted")}>{need}</span>}
        <span className="ml-auto inline-flex items-center gap-[5px] text-xs font-semibold">{state}</span>
      </div>
      {children}
      {actions && <div className="mt-2.5 flex justify-end gap-2">{actions}</div>}
    </li>
  )
}
const Done = ({ label = "Done" }: { label?: string }) => <span className="inline-flex items-center gap-[5px] text-work"><Check className="size-[13px]" />{label}</span>
const Todo = ({ label = "Pending" }: { label?: string }) => <span className="text-faint">{label}</span>
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="mt-2 flex items-center gap-2 text-[12.5px] text-text-muted">{label}{children}</label>

// Read aloud: what a session did when its turn ends, said by the Mac
// (lib/speech.ts). The choice lives in this browser, like the sound.
function ReadAloud() {
  const chosen = speech.use()
  const [voices, setVoices] = useState<{ voices: { name: string; locale: string }[]; default: string } | null>(null)
  useEffect(() => void get<NonNullable<typeof voices>>("/api/voices").then(setVoices, () => {}), [])
  const set = (next: Partial<Speech>) => speech.set({ ...chosen, ...next })
  const voice = chosen.voice ?? voices?.default ?? ""
  const rate = chosen.rate ?? DEFAULT_RATE
  // The board's languages: Spanish voices first, then English.
  const shown = (voices?.voices ?? []).filter(v => /^(es|en)_/.test(v.locale)).sort((a, b) => Number(b.locale.startsWith("es")) - Number(a.locale.startsWith("es")))
  const isOn = chosen.mode !== "off"
  return (
    <Row title="Read aloud" need="Optional" isDone={isOn} state={isOn ? <Done label="On" /> : <Todo label="Off" />}
      actions={isOn && <Button variant="outline" onClick={() => post("/api/speak/sample", { voice, rate }).catch(() => {})}>Try it</Button>}>
      <p className={text}>When a session ends its turn, the Mac says what it did: the summary it writes at the end (the “next step” box of Claude desktop), and its question if it asks you one. Without a summary it only says that it finished. The session you are reading on the board is not read. The waves in the sidebar turn it on and off. The most natural voice is Siri's: choose it in System Settings → Accessibility → Read & Speak (System speech language, then System voice) and keep “System voice” here.</p>
      <Field label="Read">
        <select className={select} value={chosen.mode} onChange={e => set({ mode: e.target.value as Speech["mode"] })}>
          {SPEECH_MODES.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
        </select>
      </Field>
      {isOn && (
        <>
          <Field label="Voice">
            <select className={select} value={voice} onChange={e => set({ voice: e.target.value })}>
              <option value="system">System voice (Read & Speak: Siri, if you chose it there)</option>
              {shown.map(v => <option key={v.name} value={v.name}>{v.name} · {v.locale.replace("_", "-")}</option>)}
            </select>
          </Field>
          <Field label="Speed">
            <input type="range" min={120} max={300} step={10} value={rate} className="accent-brand" onChange={e => set({ rate: Number(e.target.value) })} />
          </Field>
        </>
      )}
    </Row>
  )
}

// When messages or answers do not reach a session on someone's Mac: a report
// of this Mac's setup and of each session's bridge mod (lib/diagnose.ts), to
// paste in a message. It holds no conversation, title or message.
function Diagnostics() {
  const [isBusy, setBusy] = useState(false)
  const copy = async () => {
    setBusy(true)
    const res = await get<{ text?: string }>("/api/diagnostics").catch(() => null)
    setBusy(false)
    if (!res?.text) return void toast("Could not make the report")
    try {
      await navigator.clipboard.writeText(res.text)
      toast("Report copied: paste it in a message")
    } catch {
      toast("Could not copy it: the browser refused the clipboard")
    }
  }
  return (
    <Row title="Diagnostics" isDone={false} actions={<Button variant="outline" disabled={isBusy} onClick={copy}>{isBusy ? "One moment…" : "Copy report"}</Button>}>
      <p className={text}>Messages or answers that do not reach a session? Copy a report of this Mac and of each session's bridge mod, and send it to whoever helps you.</p>
    </Row>
  )
}

export function SetupDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [language, setLanguage] = useState("auto")
  const isSound = sound.use() === "on"
  const notifyState = notify.use()
  const isShaking = shake.use() === "on"
  const alive = useRef(true)
  const refresh = () =>
    get<Status>("/api/setup").then(res => alive.current && (setStatus(res), setLanguage(l => (l === "auto" ? res.voiceLanguage : l))), () => {})
  useEffect(() => (void refresh(), () => void (alive.current = false)), [])
  // While something installs in the background (Whisper), its progress.
  const isWorking = status?.steps.some(s => s.state === "working")
  useEffect(() => {
    if (!isWorking) return
    const timer = setInterval(refresh, 1500)
    return () => clearInterval(timer)
  }, [isWorking])

  const run = async (id: string, options: Record<string, unknown> = {}) => {
    setBusy(id)
    try {
      const res = await post<Status>(`/api/setup/${id}`, { options })
      if (alive.current) setStatus(res)
    } catch (err) {
      toast((err as Error).message || "Could not complete this step")
    }
    if (alive.current) setBusy(null)
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent showCloseButton={false} className="w-[min(640px,calc(100vw-32px))] gap-0">
        <DialogTitle className="mb-3.5">Setup</DialogTitle>
        <p className="-mt-1 mb-3.5 text-[13px] text-text-muted">Each step changes something on this Mac and runs only when you press it. Sessions that were already open load the mod when they restart.</p>
        {!status && <p className="text-text-muted">Checking…</p>}
        <ol className="m-0 mb-3.5 flex max-h-[min(62vh,640px)] list-none flex-col gap-2 overflow-y-auto p-0">
          {status?.steps.map(step => {
            const meta = STEPS[step.id]
            if (!meta) return null
            // Installed dictation keeps the language picker: a new choice applies at once.
            const newLanguage = step.id === "whisper" && step.state === "done" && language !== status.voiceLanguage
            const label = step.state === "outdated" ? meta.outdated : newLanguage ? "Save language" : step.state === "done" ? null : meta.action
            const state = step.state === "done" ? <Done />
              : step.state === "working" ? <span className="inline-flex items-center gap-[5px] text-brand"><Spinner className="size-3 border-[1.5px]" />{step.detail === "model" ? "Downloading the model" : "Installing"}</span>
              : step.state === "outdated" ? <Todo label={`Version ${step.detail}`} /> : <Todo />
            const actions = (label || (meta.canTurnOff && step.state === "done")) && (
              <>
                {label && <Button disabled={busy !== null || step.state === "working"} onClick={() => run(step.id, step.id === "whisper" ? { voiceLanguage: language } : {})}>{busy === step.id ? "One moment…" : label}</Button>}
                {meta.canTurnOff && step.state === "done" && <Button variant="outline" disabled={busy !== null} onClick={() => run(step.id, { off: true })}>Turn off</Button>}
              </>
            )
            return (
              <Row key={step.id} title={meta.title} need={meta.need} state={state} isDone={step.state === "done"} actions={actions}>
                <p className={text}>{step.state === "unavailable" && meta.unavailable ? meta.unavailable : meta.text}</p>
                {step.id === "whisper" && (
                  <Field label="Dictation language">
                    <select className={select} value={language} onChange={e => setLanguage(e.target.value)}>{LANGUAGES.map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select>
                  </Field>
                )}
                {step.id === "whisper" && step.state === "working" && step.progress != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-hover"><i className="block h-full bg-brand transition-[width] duration-300" style={{ width: `${Math.round(step.progress * 100)}%` }} /></div>
                )}
                {step.id === "whisper" && step.detail && step.state === "missing" && <p className="mt-1.5 text-xs text-bad">{step.detail}</p>}
                {step.id === "organizer" && step.state !== "done" && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-text-muted">The note for CLAUDE.md</summary>
                    <pre className="mt-1.5 rounded-lg border border-line bg-side px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">{status.organizerNote}</pre>
                  </details>
                )}
                {step.id === "github" && step.state !== "done" && <p className={text}>In the terminal: <code>{step.detail === "not-installed" ? "brew install gh && gh auth login" : "gh auth login"}</code></p>}
              </Row>
            )
          })}
          {status && (
            <>
              <Row title="Notifications" need="Optional" isDone={notifyState === "on"} state={notifyState === "on" ? <Done /> : <Todo />}
                actions={notifyState !== "on" && <Button onClick={toggleNotify}>Turn on</Button>}>
                <p className={text}>A system notification when a session asks you something and you are in another window.</p>
              </Row>
              <Row title="Sound" need="Optional" isDone={isSound} state={isSound ? <Done label="On" /> : <Todo label="Off" />}
                actions={<Button variant={isSound ? "outline" : "default"} onClick={toggleSound}>{isSound ? "Turn off" : "Turn on"}</Button>}>
                <p className={text}>A short chime when a session finishes its turn or asks you something, also while you look at the board (notifications only reach you in another window). The speaker in the sidebar turns it on and off.</p>
              </Row>
              <Row title="Shake waiting cards" need="Preference" isDone={isShaking} state={isShaking ? <Done label="On" /> : <Todo label="Off" />}
                actions={<Button variant={isShaking ? "outline" : "default"} onClick={() => shake.set(isShaking ? "off" : "on")}>{isShaking ? "Turn off" : "Turn on"}</Button>}>
                <p className={text}>A card that asks you something or waits for your approval gives a short shake every few seconds, faster the longer it waits. Turned off, it stays still and only its colour and the time it has waited tell you.</p>
              </Row>
              <ReadAloud />
              <Diagnostics />
            </>
          )}
        </ol>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex-1 text-xs text-text-muted">{status && !status.isReady ? "Required steps are missing: without them the board cannot see or answer the sessions." : ""}</span>
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
