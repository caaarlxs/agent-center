// "Setup": what this Mac needs for the board, one step at a time. A step
// changes something on the Mac only when you press it (lib/setup.ts does it),
// so each one says what it changes. Then how the board tells you things:
// notifications, the chime, and the Mac reading the recap aloud.
import { Check } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import type { Step } from "@/lib/api-types"
import { cn } from "@/lib/utils"
import { shake } from "@/features/board/state"
import { notify, sound, speech, toggleNotify, toggleSound, type Speech } from "@/features/alerts/prefs"

type Status = { steps: Step[]; isReady: boolean; voiceLanguage: string; organizerNote: string }
type Need = "Required" | "Recommended" | "Optional"
type Meta = { title: string; need: Need; text: ReactNode; action?: string; outdated?: string; canTurnOff?: boolean }

const STEPS: Record<string, Meta> = {
  claude: { title: "Claude desktop", need: "Required", text: <>The board shows, wakes and opens its sessions. Install it from <a className="underline" href="https://claude.ai/download">claude.ai/download</a>.</> },
  hook: { title: "Session tracking", need: "Required", text: "Adds a hook to ~/.claude/settings.json (after a backup), so the board knows what each session does and asks.", action: "Install" },
  bridge: { title: "Bridge mod", need: "Required", text: "A Claude Code mod that delivers your messages, answers and approvals, and stops turns. Sessions load it when they start.", action: "Install", outdated: "Update" },
  uploads: { title: "Read sent files", need: "Recommended", text: "Lets Claude open the files you send without asking (only ~/.claude/agent-center/uploads).", action: "Allow" },
  whisper: { title: "Dictation on this Mac", need: "Optional", text: "Installs whisper-cpp and ffmpeg with Homebrew and a 550 MB model. Your voice stays on the Mac.", action: "Install" },
  organizer: { title: "Tasks", need: "Optional", text: "A task list per project (~/organizer) that Claude keeps. Installs organizer.py and adds a note to ~/.claude/CLAUDE.md (after a backup).", action: "Install", canTurnOff: true },
  commands: { title: "Run commands", need: "Optional", text: "Adds Run to the shell blocks in a conversation: a click runs that exact command on this Mac, in the session's folder.", action: "Turn on", canTurnOff: true },
  github: { title: "GitHub PRs", need: "Optional", text: "With the gh CLI signed in, cards show their PRs and you can review and merge them." },
}
const LANGUAGES = [["auto", "Detect the language"], ["es", "Spanish"], ["en", "English"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"]]
const SPEECH_MODES = [["off", "Off"], ["watched", "Sessions with the bell"], ["all", "Every session"]]
const DEFAULT_RATE = 190

function Row({ title, need, state, children }: { title: string; need: Need | "Preference"; state: ReactNode; children: ReactNode }) {
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <b className="font-medium">{title}</b>
        <span className={cn("rounded px-1.5 text-[11px]", need === "Required" ? "bg-rose-400/10 text-rose-300" : need === "Recommended" ? "bg-amber-400/10 text-amber-300" : "bg-muted text-muted-foreground")}>{need}</span>
        <span className="ml-auto text-xs">{state}</span>
      </div>
      {children}
    </li>
  )
}
const Done = ({ label = "Done" }: { label?: string }) => <span className="flex items-center gap-1 text-emerald-400"><Check className="size-3.5" />{label}</span>
const Todo = ({ label = "Pending" }: { label?: string }) => <span className="text-muted-foreground">{label}</span>

function Choose({ value, options, onChange, label }: { value: string; options: string[][]; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="w-20 shrink-0">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="min-w-56"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, name]) => <SelectItem key={v} value={v}>{name}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}

function ReadAloud() {
  const chosen = speech.use()
  const [voices, setVoices] = useState<{ voices: { name: string; locale: string }[]; default: string } | null>(null)
  useEffect(() => void get<NonNullable<typeof voices>>("/api/voices").then(setVoices, () => {}), [])
  const set = (next: Partial<Speech>) => speech.set({ ...chosen, ...next })
  const voice = chosen.voice ?? voices?.default ?? "system"
  const rate = chosen.rate ?? DEFAULT_RATE
  // The board's languages: Spanish voices first, then English.
  const shown = (voices?.voices ?? []).filter(v => /^(es|en)_/.test(v.locale)).sort((a, b) => Number(b.locale.startsWith("es")) - Number(a.locale.startsWith("es")))
  const isOn = chosen.mode !== "off"
  return (
    <Row title="Read aloud" need="Optional" state={isOn ? <Done label="On" /> : <Todo label="Off" />}>
      <p className="text-sm text-muted-foreground">When a turn ends, the Mac says what the session did or asks. Siri's voice is the most natural: choose it in System Settings → Accessibility → Read & Speak and keep “System voice” here.</p>
      <Choose label="Read" value={chosen.mode} options={SPEECH_MODES} onChange={mode => set({ mode: mode as Speech["mode"] })} />
      {isOn && (
        <>
          <Choose label="Voice" value={voice} onChange={v => set({ voice: v })}
            options={[["system", "System voice"], ...shown.map(v => [v.name, `${v.name} · ${v.locale.replace("_", "-")}`])]} />
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="w-20 shrink-0">Speed</span>
            <Slider className="max-w-56" min={120} max={300} step={10} value={[rate]} onValueChange={([r]) => set({ rate: r })} />
          </label>
          <Button variant="outline" size="sm" onClick={() => post("/api/speak/sample", { voice, rate }).catch((err: Error) => toast.error(err.message))}>Try it</Button>
        </>
      )}
    </Row>
  )
}

// Cards that wait for you shake now and then (the board's "shake" choice).
function Shake() {
  const isOn = shake.use() === "on"
  return (
    <Row title="Shake waiting cards" need="Preference" state={isOn ? <Done label="On" /> : <Todo label="Off" />}>
      <p className="text-sm text-muted-foreground">A card that asks you something or waits for your approval gives a short shake every few seconds, faster the longer it waits. Turned off, it stays still and only its colour and the time it has waited tell you.</p>
      <Button variant={isOn ? "outline" : "default"} size="sm" className="self-start" onClick={() => shake.set(isOn ? "off" : "on")}>{isOn ? "Turn off" : "Turn on"}</Button>
    </Row>
  )
}

export function SetupDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [language, setLanguage] = useState("auto")
  const isSound = sound.use() === "on"
  const notifyState = notify.use()
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
      toast.error((err as Error).message)
    }
    if (alive.current) setBusy(null)
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Setup</DialogTitle>
        {!status ? <div className="grid place-items-center py-10"><Spinner /></div> : (
          <ol className="space-y-2">
            {status.steps.map(step => {
              const meta = STEPS[step.id]
              if (!meta) return null
              // Installed dictation keeps the language picker: a new choice applies at once.
              const newLanguage = step.id === "whisper" && step.state === "done" && language !== status.voiceLanguage
              const label = step.state === "outdated" ? meta.outdated : newLanguage ? "Save language" : step.state === "done" ? null : meta.action
              const state = step.state === "done" ? <Done /> : step.state === "working" ? <span className="flex items-center gap-1.5 text-sky-400"><Spinner />{step.detail === "model" ? "Downloading the model" : "Installing"}</span>
                : step.state === "outdated" ? <Todo label={`Version ${step.detail}`} /> : <Todo />
              return (
                <Row key={step.id} title={meta.title} need={meta.need} state={state}>
                  <p className="text-sm text-muted-foreground">{meta.text}</p>
                  {step.id === "whisper" && <Choose label="Language" value={language} options={LANGUAGES} onChange={setLanguage} />}
                  {step.id === "whisper" && step.state === "working" && step.progress != null && <Progress value={Math.round(step.progress * 100)} className="h-1.5" />}
                  {step.id === "whisper" && step.detail && step.state === "missing" && <p className="text-sm text-rose-300">{step.detail}</p>}
                  {step.id === "organizer" && step.state !== "done" && (
                    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">The note for CLAUDE.md</summary><pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{status.organizerNote}</pre></details>
                  )}
                  {step.id === "github" && step.state !== "done" && <code className="block rounded bg-muted px-2 py-1 text-xs">{step.detail === "not-installed" ? "brew install gh && gh auth login" : "gh auth login"}</code>}
                  {(label || (meta.canTurnOff && step.state === "done")) && (
                    <div className="flex gap-2">
                      {label && <Button size="sm" disabled={busy !== null || step.state === "working"} onClick={() => run(step.id, step.id === "whisper" ? { voiceLanguage: language } : {})}>{busy === step.id ? <Spinner /> : null}{label}</Button>}
                      {meta.canTurnOff && step.state === "done" && <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run(step.id, { off: true })}>Turn off</Button>}
                    </div>
                  )}
                </Row>
              )
            })}
            <Row title="Notifications" need="Optional" state={notifyState === "on" ? <Done label="On" /> : <Todo label={notifyState === "blocked" ? "Blocked" : "Off"} />}>
              <p className="text-sm text-muted-foreground">A macOS notification when a session asks you something while you are in another window.</p>
              <Button size="sm" variant={notifyState === "on" ? "outline" : "default"} onClick={toggleNotify}>{notifyState === "on" ? "Turn off" : "Turn on"}</Button>
            </Row>
            <Row title="Sound" need="Optional" state={isSound ? <Done label="On" /> : <Todo label="Off" />}>
              <p className="text-sm text-muted-foreground">A short chime when a session finishes or asks you something, also while you look at the board.</p>
              <Button size="sm" variant={isSound ? "outline" : "default"} onClick={toggleSound}>{isSound ? "Turn off" : "Turn on"}</Button>
            </Row>
            <ReadAloud />
            <Shake />
          </ol>
        )}
        {status && !status.isReady && <p className="text-sm text-rose-300">Without the required steps the board cannot see or answer the sessions.</p>}
      </DialogContent>
    </Dialog>
  )
}
