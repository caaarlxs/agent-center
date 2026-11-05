// The guide (?): what the app does, from FEATURES.md. Its home shows what is
// new, then a card per section (its icon, its name, how many features and how
// many new); a section shows a card per feature (its icon, title and what it
// does, the keys as keys). The keyboard shortcuts are one more section. Typing
// in the field shows the features that match, from every section. Opening it
// counts as a look at what is new.
import { ArrowLeft, Keyboard } from "lucide-react"
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { helpOpen } from "@/features/keys/help-state"
import { type Feature, type Section, findIn, newSince, piecesOf } from "./guide"
import { ICONS } from "./icons"
import { CATALOGUE, dayOf, markSeen } from "./whats-new"

const SHORTCUTS: [string, string[][]][] = [
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
  ["Tiers: one place left · right", [["<"], [">"]]],
  ["Lanes per repo", [["G"]]],
  ["Next up: what waits for you", [["F"]]],
  ["The last session that finished or asked", [["L"]]],
  ["New session", [["N"]]],
  ["Catch me up", [["D"]]],
  ["Stop the running turn", [["S"]]],
  ["Mark to review", [["U"]]],
  ["Canvas: zoom in · zoom out · fit", [["+"], ["−"], ["0"]]],
  ["Canvas: move the view (hold and drag)", [["Space"]]],
  ["This guide", [["?"]]],
  ["Close", [["Esc"]]],
]
const KEYS = "Keyboard shortcuts"
const NEW_DAYS = 14

// A colour per section, in turn, so each one is known at a glance.
const TONES = [
  "bg-brand-soft text-brand",
  "bg-work-soft text-work",
  "bg-review-soft text-review",
  "bg-ask-soft text-ask",
  "bg-[color-mix(in_srgb,#8b5cf6_16%,transparent)] text-[#8b5cf6]",
  "bg-run-soft text-run",
  "bg-bad-soft text-bad",
]
const toneOf = (name: string) => TONES[Math.max(0, CATALOGUE.findIndex(s => s.name === name)) % TONES.length]!

function Tile({ icon, tone, size = 32 }: { icon: string | typeof Keyboard; tone: string; size?: number }) {
  const Icon = typeof icon === "string" ? (ICONS[icon] ?? ICONS.sparkles!) : icon
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-[9px]", tone)} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  )
}

const NewBadge = () => <span className="shrink-0 rounded-full bg-brand px-2 py-px text-[10.5px] font-semibold text-brand-text">New</span>

const Text = ({ text }: { text: string }) => (
  <>{piecesOf(text).map((p, i) => ("key" in p ? <Kbd key={i} className="mx-px align-[1px]">{p.key}</Kbd> : <Fragment key={i}>{p.text}</Fragment>))}</>
)

function FeatureCard({ feature, tone, section, isNew }: { feature: Feature; tone: string; section?: string; isNew: boolean }) {
  return (
    <article className="guide-in flex flex-col gap-2 rounded-[12px] border border-line bg-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <Tile icon={feature.icon} tone={tone} />
        <div className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[13.5px] font-[650]">{feature.title}</b>
          {section && <span className="truncate text-[11px] text-faint">{section}</span>}
        </div>
        {isNew && <NewBadge />}
      </div>
      <p className="m-0 text-[12.5px] leading-[1.5] text-text-muted"><Text text={feature.text} /></p>
    </article>
  )
}

// A new feature on the home, small: its icon, title and section; a click
// opens that section.
function NewChip({ feature, section, onOpen }: { feature: Feature; section: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="guide-in flex min-w-0 items-center gap-2.5 rounded-[11px] border border-line bg-surface px-2.5 py-2 text-left transition-[border-color,transform] duration-150 ease-(--ease-out) hover:border-line-strong active:scale-[0.98]">
      <Tile icon={feature.icon} tone={toneOf(section)} size={28} />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-[12.5px] font-semibold">{feature.title}</b>
        <span className="truncate text-[11px] text-faint">{section}</span>
      </span>
      <i className="size-1.5 shrink-0 rounded-full bg-brand" title="New" />
    </button>
  )
}

function SectionCard({ icon, name, count, fresh, tone, onOpen }: { icon: string | typeof Keyboard; name: string; count: number; fresh: number; tone: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      className="guide-in flex flex-col items-start gap-3 rounded-[14px] border border-line bg-surface p-4 text-left transition-[border-color,transform,box-shadow] duration-150 ease-(--ease-out) hover:-translate-y-px hover:border-line-strong hover:shadow-pop active:scale-[0.98]">
      <Tile icon={icon} tone={tone} size={40} />
      <div className="flex w-full items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-[14.5px] font-[650]">{name}</b>
        {fresh > 0 && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-px text-[10.5px] font-semibold text-brand">{fresh} new</span>}
      </div>
      <span className="-mt-2 text-xs text-text-muted">{count} {count === 1 ? "feature" : "features"}</span>
    </button>
  )
}

const grid = (min: number) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10 })
const heading = "mb-2 mt-1 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase"

function Shortcuts({ only }: { only?: string[] }) {
  const rows = SHORTCUTS.filter(([label]) => !only || only.every(w => `${KEYS} ${label}`.toLowerCase().includes(w)))
  return (
    <div style={grid(250)}>
      {rows.map(([label, combos]) => (
        <div key={label} className="guide-in flex items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px]">
          <span className="min-w-0">{label}</span>
          <span className="flex shrink-0 items-center gap-[5px]">
            {combos.map((k, n) => <Fragment key={n}>{n > 0 && <span className="text-[11px] text-text-muted">or</span>}{k.map(x => <Kbd key={x}>{x}</Kbd>)}</Fragment>)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function GuideDialog() {
  const isOpen = helpOpen.use()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState<string | null>(null) // a section's name, or the home
  useEffect(() => {
    if (isOpen) markSeen()
    else (setQuery(""), setPage(null))
  }, [isOpen])
  const recent = dayOf(Date.now() - NEW_DAYS * 86_400_000)
  const isRecent = (f: Feature) => !!f.since && f.since >= recent
  const fresh = useMemo(() => newSince(CATALOGUE, dayOf(Date.now() - (NEW_DAYS + 1) * 86_400_000)), [])
  const found = useMemo(() => findIn(CATALOGUE, query), [query])
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const section = CATALOGUE.find(s => s.name === page)

  let body: ReactNode
  if (words.length) {
    const keys = SHORTCUTS.some(([label]) => words.every(w => `${KEYS} ${label}`.toLowerCase().includes(w)))
    body = (
      <>
        {found.map(s => (
          <section key={s.name} className="mb-4">
            <h3 className={heading}>{s.name}</h3>
            <div style={grid(250)}>{s.items.map(f => <FeatureCard key={f.title + f.text} feature={f} tone={toneOf(s.name)} section={s.name} isNew={isRecent(f)} />)}</div>
          </section>
        ))}
        {keys && <section className="mb-4"><h3 className={heading}>{KEYS}</h3><Shortcuts only={words} /></section>}
        {!found.length && !keys && <p className="py-10 text-center text-text-muted">Nothing about “{query.trim()}”.</p>}
      </>
    )
  } else if (page) {
    body = (
      <>
        <button onClick={() => setPage(null)} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted hover:text-text">
          <ArrowLeft className="size-3.5" />All sections
        </button>
        <div className="mb-4 flex items-center gap-3">
          <Tile icon={section?.icon ?? Keyboard} tone={section ? toneOf(section.name) : "bg-hover text-text"} size={40} />
          <b className="text-[17px] font-[650]">{page}</b>
        </div>
        {section ? <div style={grid(250)}>{section.items.map(f => <FeatureCard key={f.title + f.text} feature={f} tone={toneOf(section.name)} isNew={isRecent(f)} />)}</div> : <Shortcuts />}
      </>
    )
  } else {
    body = (
      <>
        {fresh.length > 0 && (
          <section className="mb-5">
            <h3 className={heading}>What's new</h3>
            <div style={grid(200)}>{fresh.map(f => <NewChip key={f.section + f.title} feature={f} section={f.section} onOpen={() => setPage(f.section)} />)}</div>
          </section>
        )}
        <h3 className={heading}>Sections</h3>
        <div style={grid(180)}>
          {CATALOGUE.map((s: Section) => (
            <SectionCard key={s.name} icon={s.icon} name={s.name} count={s.items.length} fresh={s.items.filter(isRecent).length} tone={toneOf(s.name)} onOpen={() => setPage(s.name)} />
          ))}
          <SectionCard icon={Keyboard} name={KEYS} count={SHORTCUTS.length} fresh={0} tone="bg-hover text-text" onOpen={() => setPage(KEYS)} />
        </div>
      </>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={helpOpen.set}>
      <DialogContent className="flex h-[min(760px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))] max-w-none flex-col gap-0 p-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 pr-12">
          <DialogTitle className="text-base font-[650]">Guide</DialogTitle>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search: notes, zones, PR, Jira…" aria-label="Search the guide"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 text-[13px] outline-none focus:border-brand" />
        </div>
        <div key={words.length ? "found" : (page ?? "home")} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{body}</div>
      </DialogContent>
    </Dialog>
  )
}
