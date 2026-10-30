// Settings, in four sections. Setup (setup.js): what this Mac needs for the
// board, one step at a time; a step changes something on the Mac only when
// you press it (lib/setup.ts does it), so each one says what it changes.
// Alerts: how the board tells you things (notifications, the chime, the Mac
// reading the recap aloud, waiting cards that shake). Look: light or dark,
// the canvas's animated background, the code colours. Help: the diagnostics
// report. It opens by itself, on Setup, while a required step is missing.
import { Bell, Check, ChevronLeft, ChevronRight, LifeBuoy, Palette, Wrench, X } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { get, post } from "@/lib/api"
import { type CodeThemeOption, chosenKey, codeTheme, useCodeThemes, useIsDark, useTokens } from "@/lib/code-theme"
import { cn } from "@/lib/utils"
import { type Status, setupStatus } from "./status"
import { type ThemeChoice, chooseTheme, themeChoice } from "@/lib/theme"
import { notify, shake, sound, speech, toggleNotify, toggleSound, type Speech } from "@/features/alerts/prefs"
import { CopyMark, useCopyMoment } from "@/components/icona/marks"
import { SwapText } from "@/components/watermelon/SwapText"
import { Checklist } from "./Checklist"
import { progressOf } from "./progress"
import { type BoardStyle, boardStyle, chooseStyle } from "@/lib/board-style"
import { type AppIcon, ICONS, appIcon, chooseAppIcon, iconSrc, loadAppIcon } from "@/lib/app-icon"

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
  const copied = useCopyMoment()
  const [isDone, setDone] = useState(false) // "Copied" for a moment
  const copy = async () => {
    setBusy(true)
    const res = await get<{ text?: string }>("/api/diagnostics").catch(() => null)
    setBusy(false)
    if (!res?.text) return void toast("Could not make the report")
    try {
      await navigator.clipboard.writeText(res.text)
      copied.play()
      setDone(true)
      setTimeout(() => setDone(false), 1800)
      toast("Report copied: paste it in a message")
    } catch {
      toast("Could not copy it: the browser refused the clipboard")
    }
  }
  return (
    <Row title="Diagnostics" isDone={false} actions={<Button variant="outline" disabled={isBusy} onClick={copy}><CopyMark moment={copied} size={14} /><SwapText text={isBusy ? "One moment…" : isDone ? "Copied" : "Copy report"} /></Button>}>
      <p className={text}>Messages or answers that do not reach a session? Copy a report of this Mac and of each session's bridge mod, and send it to whoever helps you.</p>
    </Row>
  )
}

const SAMPLE = `// Waiting cards first
export function sortCards(cards: Card[]) {
  const rank = { asking: 0, review: 1 } as const
  return cards.filter(c => c.isOpen).length > 0
}`

// One theme in the carousel: its name and a sample drawn in it; a click picks it.
function ThemeCard({ option, isChosen, onPick }: { option: CodeThemeOption; isChosen: boolean; onPick: () => void }) {
  const isDark = useIsDark()
  const tokens = useTokens(SAMPLE, "sample.ts", isDark ? option.dark : option.light)
  return (
    <button type="button" onClick={onPick} aria-pressed={isChosen} data-theme-key={option.key}
      className={cn("flex w-[236px] shrink-0 snap-start flex-col gap-1.5 rounded-[10px] border p-1.5 text-left transition-[border-color,box-shadow] duration-100",
        isChosen ? "border-brand shadow-[0_0_0_3px_var(--brand-soft)]" : "border-line hover:border-line-strong")}>
      <pre className="m-0 h-[104px] overflow-hidden rounded-md px-2.5 py-2 font-mono text-[10px]/[1.55] whitespace-pre" style={tokens ? { background: tokens.bg, color: tokens.fg } : undefined}>
        {tokens
          ? tokens.lines.map((line, i) => <div key={i}>{line.length ? line.map((t, k) => <span key={k} style={{ color: t.color, fontStyle: t.fontStyle === 1 ? "italic" : undefined }}>{t.content}</span>) : " "}</div>)
          : <span className="text-faint">{SAMPLE}</span>}
      </pre>
      <span className="flex min-w-0 items-center gap-1.5 px-1 pb-0.5">
        <span className={cn("min-w-0 truncate text-[12.5px]", isChosen ? "font-semibold text-text" : "text-text-muted")}>{option.label}</span>
        {option.from && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold text-brand">Your {option.from}</span>}
        {isChosen && <Check className="ml-auto size-3.5 shrink-0 text-brand" />}
      </span>
    </button>
  )
}

// The code viewer's colours (lib/code-theme.ts): on or off, and the theme,
// picked from a carousel where each one shows a sample of code in it.
function CodeColours() {
  const chosen = codeTheme.use()
  const options = useCodeThemes()
  const key = chosenKey(chosen.theme, options)
  const strip = useRef<HTMLDivElement>(null)
  // The chosen one in view when the carousel opens (and when the editor's own arrives).
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-theme-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [chosen.isOn, options.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const slide = (step: 1 | -1) => strip.current?.scrollBy({ left: step * 488, behavior: "smooth" })
  const arrow = "absolute top-[52px] z-[1] grid size-7 place-items-center rounded-full border border-line bg-raised text-text-muted shadow-card hover:text-text"
  return (
    <Row title="Code colours" need="Preference" isDone={chosen.isOn} state={chosen.isOn ? <Done label="On" /> : <Todo label="Off" />}
      actions={<Button variant={chosen.isOn ? "outline" : "default"} onClick={() => codeTheme.set({ ...chosen, isOn: !chosen.isOn })}>{chosen.isOn ? "Turn off" : "Turn on"}</Button>}>
      <p className={text}>Syntax colours, as an IDE shows code, in the Code and Files tabs, in Changes and in the code a conversation shows. Turned off, code shows plain. Pick a theme below; where it has both, it follows the light or dark look of your Mac. Your own theme from Cursor or VS Code shows first.</p>
      {chosen.isOn && (
        <div className="relative mt-2.5">
          <button type="button" className={cn(arrow, "-left-2")} onClick={() => slide(-1)} title="Previous themes"><ChevronLeft className="size-4" /></button>
          <div ref={strip} className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-1 pt-0.5 pb-2 [scrollbar-width:thin]">
            {options.map(o => <ThemeCard key={o.key} option={o} isChosen={o.key === key} onPick={() => codeTheme.set({ ...chosen, theme: o.key })} />)}
          </div>
          <button type="button" className={cn(arrow, "-right-2")} onClick={() => slide(1)} title="More themes"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </Row>
  )
}

// Light or dark: the system's (macOS), or one of them always (lib/theme.ts).
const APPEARANCES: [ThemeChoice, string][] = [["system", "System"], ["light", "Light"], ["dark", "Dark"]]
function Appearance() {
  const choice = themeChoice.use()
  return (
    <Row title="Appearance" need="Preference" isDone state={<Done label={APPEARANCES.find(([v]) => v === choice)?.[1] ?? "System"} />}
      actions={
        <div role="radiogroup" aria-label="Appearance" className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {APPEARANCES.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={choice === value} onClick={() => chooseTheme(value)}
              className={cn("h-6 rounded-md px-2.5 text-[12.5px] font-[550] transition-colors", choice === value ? "bg-text text-bg" : "text-text-muted hover:text-text")}>
              {label}
            </button>
          ))}
        </div>
      }>
      <p className={text}>System follows macOS.</p>
    </Row>
  )
}

// One step of the Mac's setup: what it is, its state, and the button that does it.
type StepProps = { step: Status["steps"][number]; status: Status; busy: string | null; language: string; setLanguage: (l: string) => void; run: (id: string, options?: Record<string, unknown>) => void }
function SetupStep({ step, status, busy, language, setLanguage, run }: StepProps) {
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
    <Row title={meta.title} need={meta.need} state={state} isDone={step.state === "done"} actions={actions}>
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
}

// How the board tells you things: notifications, the chime, waiting cards that shake, the Mac reading aloud.
function Alerts() {
  const isSound = sound.use() === "on"
  const notifyState = notify.use()
  const isShaking = shake.use() === "on"
  return (
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
    </>
  )
}

// The sections, in groups down the left side, as Claude's own settings.
type Section = "setup" | "alerts" | "look" | "help"
const SECTION: Record<Section, { label: string; Icon: typeof Bell }> = {
  setup: { label: "Setup", Icon: Wrench },
  alerts: { label: "Alerts", Icon: Bell },
  look: { label: "Look", Icon: Palette },
  help: { label: "Help", Icon: LifeBuoy },
}
const GROUPS: [string, Section[]][] = [["This Mac", ["setup"]], ["Preferences", ["alerts", "look"]], ["Support", ["help"]]]

// The board's style: Classic, or Dots (orbs, the drifting field, bots, dot meters and numbers, dotted zones and notes).
const STYLES: { value: BoardStyle; label: string; text: string }[] = [
  { value: "classic", label: "Classic", text: "Coloured icons, solid chips and bars." },
  { value: "dots", label: "Dots", text: "Orbs, a drifting field of dots, bots, dot meters, dotted zones and notes." },
]
function StyleChoice() {
  const chosen = boardStyle.use()
  return (
    <Row title="Style" need="Preference" isDone state={<Done label={STYLES.find(s => s.value === chosen)?.label} />}>
      <div role="radiogroup" aria-label="Style" className="mt-2.5 grid grid-cols-2 gap-2.5">
        {STYLES.map(s => (
          <button key={s.value} type="button" role="radio" aria-checked={chosen === s.value} onClick={() => chooseStyle(s.value)}
            className={cn("flex flex-col gap-1.5 rounded-[10px] border p-2.5 text-left transition-colors", chosen === s.value ? "border-brand bg-surface" : "border-line hover:border-line-strong")}>
            <span aria-hidden className={cn("h-14 rounded-md border border-line", s.value === "dots" ? "style-preview-dots" : "bg-side")} />
            <b className="text-[13px] font-semibold">{s.label}</b>
            <span className="text-[12px] text-text-muted">{s.text}</span>
          </button>
        ))}
      </div>
    </Row>
  )
}

// The app's icon: the tab at once; the Dock too when the board can change the
// installed app safely (lib/app-icon.ts says why when it cannot).
function IconChoice() {
  const chosen = appIcon.use()
  const [busy, setBusy] = useState<AppIcon | null>(null)
  useEffect(loadAppIcon, [])
  const pick = async (icon: AppIcon) => {
    setBusy(icon)
    try {
      const dock = await chooseAppIcon(icon)
      toast(dock.changed ? "Icon changed, in the Dock too" : dock.problem ? `Icon changed; the Dock keeps the old one: ${dock.problem}` : "Icon changed")
    } catch (err) {
      toast((err as Error).message || "Could not change the icon")
    }
    setBusy(null)
  }
  return (
    <Row title="App icon" need="Preference" isDone state={<Done label={ICONS.find(i => i.value === chosen)?.label} />}>
      <div role="radiogroup" aria-label="App icon" className="mt-2.5 grid grid-cols-4 gap-2.5">
        {ICONS.map(i => (
          <button key={i.value} type="button" role="radio" aria-checked={chosen === i.value} disabled={!!busy} onClick={() => pick(i.value)}
            className={cn("flex flex-col items-center gap-1.5 rounded-[10px] border p-2.5 transition-colors", chosen === i.value ? "border-brand bg-surface" : "border-line hover:border-line-strong")}>
            <img src={iconSrc(i.value)} alt="" className={cn("size-12", busy === i.value && "animate-pulse")} />
            <b className="text-[12.5px] font-semibold">{i.label}</b>
          </button>
        ))}
      </div>
    </Row>
  )
}

export function SetupDialog({ onClose }: { onClose: () => void }) {
  // The last answer at once (kept since the board started), then a fresh one.
  const status = setupStatus.use()
  const [section, setSection] = useState<Section>("setup")
  const [busy, setBusy] = useState<string | null>(null)
  const [language, setLanguage] = useState(() => setupStatus.get()?.voiceLanguage ?? "auto")
  const alive = useRef(true)
  const refresh = () =>
    setupStatus.load().then(res => alive.current && setLanguage(l => (l === "auto" ? res.voiceLanguage : l)), () => {})
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
      setupStatus.set(await post<Status>(`/api/setup/${id}`, { options }))
    } catch (err) {
      toast((err as Error).message || "Could not complete this step")
    }
    if (alive.current) setBusy(null)
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      {/* One size for every section, so it never jumps as you move between them. */}
      <DialogContent showCloseButton={false} className="flex h-[min(680px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-line pr-3 pl-5">
          <DialogTitle>Settings</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text"><X className="size-4" /></button>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Sections" className="flex w-[210px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line p-3 max-[640px]:w-[150px]">
            {GROUPS.map(([group, keys]) => (
              <div key={group} className="flex flex-col gap-0.5">
                <p className="m-0 px-2.5 pt-3 pb-1.5 text-[11.5px] text-faint">{group}</p>
                {keys.map(key => {
                  const { label, Icon } = SECTION[key]
                  return (
                    <button key={key} type="button" aria-current={section === key ? "page" : undefined} onClick={() => setSection(key)}
                      className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors", section === key ? "bg-press text-text" : "text-text-muted hover:bg-hover hover:text-text")}>
                      <Icon className="size-4 shrink-0" />{label}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="m-0 text-[15px] font-[650]">{SECTION[section].label}</h3>
              {status && section === "setup" && <Checklist {...progressOf(status.steps.filter(st => STEPS[st.id]).map(st => ({ need: STEPS[st.id].need, isDone: st.state === "done" })))} />}
            </div>
            {section === "setup" && <p className="mt-0 mb-3.5 text-[13px] text-text-muted">Each step changes something on this Mac and runs only when you press it. Sessions that were already open load the mod when they restart.</p>}
            {section === "setup" && status && !status.isReady && <p className="mt-0 mb-3.5 text-[13px] text-bad">Required steps are missing: without them the board cannot see or answer the sessions.</p>}
            {!status && <p className="text-text-muted">Checking…</p>}
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {section === "setup" && status?.steps.map(step => <SetupStep key={step.id} step={step} status={status} busy={busy} language={language} setLanguage={setLanguage} run={run} />)}
              {status && section === "alerts" && <Alerts />}
              {section === "look" && (
                <>
                  <Appearance />
                  <StyleChoice />
                  <IconChoice />
                  <CodeColours />
                </>
              )}
              {section === "help" && <Diagnostics />}
            </ol>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
