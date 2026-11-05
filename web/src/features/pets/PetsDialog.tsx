// Pets: the packs to open and the collection. A pack shakes; when it holds
// something good it glows in that colour first (the tell), then tears open
// and lays its pets face down. Each turns over with a click: an epic or a
// legendary takes the whole screen (Spotlight). The collection is every pet
// a pack can hold, codex-pets.net's, the ones you lack as a shadow; a click
// on one you have sends it out on the board.
import { ChevronLeft, ChevronRight, PawPrint, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { sound } from "@/features/alerts/prefs"
import { PetArt, RARITY_COLOR, RARITY_NAME, isCommunity, petName, type Rarity } from "./art"
import { catalog, choosePet, loadCatalog, openPack, pets, rarityOf, type Pets, type Pull } from "./pets"

const tabBtn = (on: boolean) => cn("h-7 rounded-[7px] px-3 text-[12.5px] font-medium", on ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-text-muted hover:text-text")
const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"]
const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }
const CATEGORIES = ["Anime", "Animal", "Person", "Creature", "Object"]

export function PetsDialog({ onClose }: { onClose: () => void }) {
  const state = pets.use()
  const all = catalog.use()
  useEffect(() => void loadCatalog(), [])
  const [tab, setTab] = useState<"packs" | "collection">(state && state.packs === 0 && state.opened > 0 ? "collection" : "packs")
  const total = all?.length ?? 0
  const have = all ? all.filter(p => state?.owned[p.id]).length : 0
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex h-[min(760px,calc(100vh-48px))] w-[min(980px,calc(100vw-32px))] max-w-none flex-col gap-3 overflow-hidden"
        onInteractOutside={e => (e.target as Element | null)?.closest?.(".pet-spot") && e.preventDefault()}>
        <div className="flex items-start gap-3 pr-8">
          <PawPrint className="mt-0.5 size-[18px] shrink-0 text-brand" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle className="text-base font-[650]">Pets</DialogTitle>
            <p className="m-0 text-[12.5px] text-text-muted">
              Packs hold pets of <a className="underline" href="https://codex-pets.net" target="_blank" rel="noreferrer">codex-pets.net</a>, as rare as the community loves them (anime girls are the commonest of all).
              Packs turn up by chance, never more than two weeks apart, and nobody knows when; every PR you open brings the next one a day nearer. Closed packs pile up.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex shrink-0 rounded-[9px] bg-side p-0.5">
            <button className={tabBtn(tab === "packs")} onClick={() => setTab("packs")}>
              Packs{state?.packs ? <span className="ml-1.5 rounded-full bg-brand px-1.5 text-[10.5px] font-bold text-white tabular-nums">{state.packs}</span> : null}
            </button>
            <button className={tabBtn(tab === "collection")} onClick={() => setTab("collection")}>Collection</button>
          </div>
          {total > 0 && (
            <div className="ml-auto flex items-center gap-2 text-[12px] text-text-muted">
              <span className="tabular-nums"><b className="text-text">{have}</b> / {total.toLocaleString()} pets</span>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-side"><i className="block h-full min-w-[3px] rounded-full bg-brand" style={{ width: `${(have / total) * 100}%` }} /></span>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!state ? null : tab === "packs" ? <Packs state={state} onSee={() => setTab("collection")} /> : <Collection state={state} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- packs ----------

type Stage = "ready" | "shaking" | "tell" | "open"

function Packs({ state, onSee }: { state: Pets; onSee: () => void }) {
  const [stage, setStage] = useState<Stage>("ready")
  const [pulls, setPulls] = useState<Pull[]>([])
  const [shown, setShown] = useState<Set<number>>(new Set())
  const [best, setBest] = useState<Rarity>("common")
  const [spot, setSpot] = useState<{ pull: Pull; index: number } | null>(null)
  const isDone = pulls.length > 0 && shown.size === pulls.length

  const open = async () => {
    if (stage !== "ready" || state.packs < 1) return
    setStage("shaking")
    try {
      const [got] = await Promise.all([openPack(), new Promise(r => setTimeout(r, 1100))])
      const top = got.reduce<Rarity>((b, p) => (RANK[p.rarity] > RANK[b] ? p.rarity : b), "common")
      setBest(top)
      setPulls(got)
      setShown(new Set())
      // Something good inside: the pack glows in its colour first.
      if (RANK[top] >= 2) {
        setStage("tell")
        fanfare(top === "legendary" ? 3 : 2, true)
        await new Promise(r => setTimeout(r, top === "legendary" ? 2200 : 1500))
      }
      setStage("open")
    } catch (err) {
      setStage("ready")
      toast((err as Error).message)
    }
  }
  const turn = (i: number) => {
    const pull = pulls[i]!
    if (RANK[pull.rarity] >= 2) return setSpot({ pull, index: i })
    if (pull.rarity === "rare") fanfare(1)
    setShown(prev => new Set(prev).add(i))
  }
  // All at once: the small ones turn, the first big one gets its moment.
  const turnAll = () => {
    const big = pulls.findIndex((p, i) => !shown.has(i) && RANK[p.rarity] >= 2)
    setShown(new Set(pulls.map((_, i) => i).filter(i => shown.has(i) || RANK[pulls[i]!.rarity] < 2)))
    if (big >= 0) turn(big)
  }
  const again = () => (setPulls([]), setShown(new Set()), setBest("common"), setStage("ready"))

  if (stage === "open")
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 py-4">
        <div className="flex flex-wrap items-end justify-center gap-5">
          {pulls.map((p, i) => (
            <PetCard key={i} pull={p} isShown={shown.has(i)} onTurn={() => turn(i)} delay={i * 130} isOut={state.active === p.id} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {!isDone && <Button variant="outline" onClick={turnAll}>Turn them all</Button>}
          {isDone && state.packs > 0 && <Button onClick={again}>Open the next one ({state.packs})</Button>}
          {isDone && <Button variant={state.packs > 0 ? "outline" : "default"} onClick={onSee}>See your collection</Button>}
        </div>
        {spot && <Spotlight pull={spot.pull} onDone={() => (setShown(prev => new Set(prev).add(spot.index)), setSpot(null))} />}
      </div>
    )

  if (state.packs < 1 && stage === "ready")
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 py-6 text-center">
        <div className="opacity-30 grayscale"><PackArt /></div>
        <div className="text-[15px] font-[650]">No packs right now</div>
        <p className="m-0 max-w-[400px] text-[13px] text-text-muted">Another one will turn up on its own, sometime within the next two weeks; every PR you open brings it a day nearer. Your pet keeps you company meanwhile.</p>
      </div>
    )

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 py-6">
      <div className="relative">
        {stage === "tell" && <div className="pack-tell" style={{ "--rarity": RARITY_COLOR[best] } as React.CSSProperties} aria-hidden><i /><i /><i /><i /><i /><i /><i /><i /></div>}
        {state.packs > 1 && stage === "ready" && <div className="absolute top-2 left-3 -rotate-6 opacity-60"><PackArt /></div>}
        {state.packs > 2 && stage === "ready" && <div className="absolute top-1 left-1.5 -rotate-3 opacity-80"><PackArt /></div>}
        <button className={cn("pack-btn relative", stage === "shaking" && "pack-shaking", stage === "tell" && `pack-telling tell-${best}`)} onClick={open} title="Open this pack"
          style={{ "--rarity": RARITY_COLOR[best] } as React.CSSProperties}>
          <PackArt />
        </button>
        {state.packs > 1 && stage === "ready" && <span className="absolute -top-2 -right-3 rounded-full bg-brand px-2 py-0.5 text-[12px] font-bold text-white shadow-pop tabular-nums">×{state.packs}</span>}
      </div>
      <div className="text-center">
        {stage === "tell" ? (
          <div className="pack-tell-text text-[17px] font-[800] tracking-wide" style={{ color: RARITY_COLOR[best] }}>{best === "legendary" ? "Something LEGENDARY is inside…" : "Something epic is inside…"}</div>
        ) : stage === "shaking" ? (
          <div className="text-[15px] font-[650]">Opening…</div>
        ) : (
          <>
            <div className="text-[15px] font-[650]">{state.packs === 1 ? "You have a pack" : `You have ${state.packs} packs`}</div>
            <p className="m-0 mt-1 text-[13px] text-text-muted">{state.perPack} pets in each, the last one at least rare. Click it to open.</p>
          </>
        )}
      </div>
    </div>
  )
}

function PackArt() {
  return (
    <svg viewBox="0 0 150 210" width="150" height="210" className="pack-art drop-shadow-[0_10px_18px_rgb(0_0_0/0.25)]" aria-hidden>
      <defs>
        <linearGradient id="pack-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a5c" /><stop offset="0.45" stopColor="#e2487a" /><stop offset="1" stopColor="#6d3cf0" />
        </linearGradient>
        <linearGradient id="pack-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="pack-clip"><path d={PACK_PATH} /></clipPath>
      </defs>
      <path d={PACK_PATH} fill="url(#pack-foil)" />
      <g clipPath="url(#pack-clip)">
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={(i * 37) % 150} cy={30 + ((i * 53) % 160)} r={6 + (i % 3) * 4} fill="#fff" opacity="0.07" />)}
        <rect className="pack-sheen" x="-80" y="0" width="60" height="210" fill="url(#pack-sheen)" transform="skewX(-18)" />
        <rect x="0" y="0" width="150" height="20" fill="#000" opacity="0.12" />
        <rect x="0" y="190" width="150" height="20" fill="#000" opacity="0.12" />
      </g>
      <circle cx="75" cy="94" r="34" fill="#fff" opacity="0.95" />
      <g transform="translate(75 96)" fill="#e2487a">
        <ellipse cx="0" cy="6" rx="11" ry="9.5" />
        <ellipse cx="-13" cy="-6" rx="4.6" ry="6" /><ellipse cx="13" cy="-6" rx="4.6" ry="6" />
        <ellipse cx="-5.5" cy="-14" rx="4.4" ry="5.8" /><ellipse cx="5.5" cy="-14" rx="4.4" ry="5.8" />
      </g>
      <text x="75" y="152" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800" letterSpacing="2.5">PET PACK</text>
      <text x="75" y="170" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" opacity="0.8" letterSpacing="1">AGENT CENTER</text>
    </svg>
  )
}
// A foil packet, crimped top and bottom.
const PACK_PATH = (() => {
  const xs = Array.from({ length: 31 }, (_, i) => i * 5)
  const top = xs.map((x, i) => `L${x} ${i % 2 ? 0 : 6}`).join(" ")
  const bottom = [...xs].reverse().map((x, i) => `L${x} ${i % 2 ? 210 : 204}`).join(" ")
  return `M0 6 ${top} ${bottom} Z`
})()

const nameOf = (p: Pull) => p.name ?? petName(p.id)

function PetCard({ pull, isShown, onTurn, delay, isOut }: { pull: Pull; isShown: boolean; onTurn: () => void; delay: number; isOut: boolean }) {
  const color = RARITY_COLOR[pull.rarity]
  return (
    <div className="pet-card-deal" style={{ animationDelay: `${delay}ms` }}>
      <button className={cn("pet-card", isShown && "is-shown", `rarity-${pull.rarity}`)} onClick={onTurn} disabled={isShown} style={{ "--rarity": color } as React.CSSProperties}
        title={isShown ? undefined : "Turn it over"}>
        <div className="pet-card-inner">
          <div className="pet-card-back">
            <PawPrint className="size-9 text-white/90" />
          </div>
          <div className="pet-card-front">
            {pull.rarity !== "common" && <div className="pet-card-rays" aria-hidden />}
            {isShown && pull.rarity !== "common" && <Burst color={color} count={pull.rarity === "rare" ? 14 : 24} />}
            {pull.isNew && <span className="absolute top-2 left-2 z-[1] rounded-full bg-brand px-1.5 py-px text-[10px] font-bold tracking-wide text-white">NEW</span>}
            {pull.category && <span className="absolute top-2 right-2 z-[1] rounded-full bg-black/25 px-1.5 py-px text-[9.5px] font-semibold text-white">{pull.category}</span>}
            <PetArt id={pull.id} size={104} className="relative" doing={isShown ? "cheer" : "idle"} />
            <div className="relative mt-1 w-full truncate px-2 text-center text-[13.5px] font-[650] text-text" title={nameOf(pull)}>{nameOf(pull)}</div>
            <div className="relative text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color }}>{RARITY_NAME[pull.rarity]}</div>
          </div>
        </div>
      </button>
      <div className={cn("mt-2 flex h-7 justify-center transition-opacity", isShown ? "opacity-100" : "pointer-events-none opacity-0")}>
        {isOut ? <span className="self-center text-[12px] text-text-muted">On the board</span> : (
          <Button variant="outline" className="h-7 text-[12px]" onClick={() => void choosePet(pull.id)}>Take it out</Button>
        )}
      </div>
    </div>
  )
}

// Sparks flying out of a point, each its own angle, distance and speed.
function Burst({ color, count, spread = 1 }: { color: string; count: number; spread?: number }) {
  const [sparks] = useState(() => Array.from({ length: count }, (_, i) => ({
    a: (i / count) * 360 + Math.random() * 20, d: (60 + Math.random() * 90) * spread, s: 4 + Math.random() * 6, t: 0.6 + Math.random() * 0.7, delay: Math.random() * 0.15,
    isWhite: Math.random() < 0.3,
  })))
  return (
    <div className="pet-burst" aria-hidden>
      {sparks.map((p, i) => <i key={i} style={{ "--a": `${p.a}deg`, "--d": `${p.d}px`, "--s": `${p.s}px`, "--t": `${p.t}s`, animationDelay: `${p.delay}s`, background: p.isWhite ? "#fff" : color } as React.CSSProperties} />)}
    </div>
  )
}

const CONFETTI = ["#ffd45c", "#ffb627", "#fff3b0", "#ff7ad9", "#7fe3ff"]

// An epic or a legendary, revealed over the whole screen: a flash, a shake,
// rays, shockwaves, bursts of sparks, its rarity slammed in letter by
// letter, the pet jumping for joy; legendary adds a rain of gold. A click
// (or Esc) and it lands in its card.
function Spotlight({ pull, onDone }: { pull: Pull; onDone: () => void }) {
  const color = RARITY_COLOR[pull.rarity]
  const isLegend = pull.rarity === "legendary"
  const [canGo, setCanGo] = useState(false)
  useEffect(() => {
    fanfare(isLegend ? 3 : 2)
    const t = setTimeout(() => setCanGo(true), 1400)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      onDone()
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [isLegend, onDone])
  const [confetti] = useState(() => (isLegend ? Array.from({ length: 70 }, () => ({ x: Math.random() * 100, d: 2.2 + Math.random() * 2.5, delay: Math.random() * 3, r: Math.random() * 360, w: 5 + Math.random() * 6, c: CONFETTI[Math.floor(Math.random() * CONFETTI.length)] })) : []))
  const word = RARITY_NAME[pull.rarity].toUpperCase()
  return createPortal(
    <div className={cn("pet-spot", `spot-${pull.rarity}`)} style={{ "--rarity": color, pointerEvents: "auto" } as React.CSSProperties} onClick={() => canGo && onDone()} role="dialog" aria-label={`${word}: ${nameOf(pull)}`}>
      <div className="pet-spot-flash" />
      <div className="pet-spot-stage">
        <div className="pet-spot-rays" />
        {isLegend && <div className="pet-spot-rays is-second" />}
        <div className="pet-spot-ring" /><div className="pet-spot-ring" style={{ animationDelay: "0.25s" }} /><div className="pet-spot-ring" style={{ animationDelay: "0.5s" }} />
        <Burst color={color} count={isLegend ? 64 : 40} spread={2.6} />
        {isLegend && <div className="pet-burst-late"><Burst color="#fff3b0" count={40} spread={3.4} /></div>}
        <div className="pet-spot-glow" />
        <div className="pet-spot-pet"><PetArt id={pull.id} size={210} doing="cheer" /></div>
      </div>
      <div className="pet-spot-title">
        {[...word].map((ch, i) => <span key={i} style={{ animationDelay: `${0.35 + i * 0.07}s` }}>{ch}</span>)}
      </div>
      <div className="pet-spot-name">
        {pull.isNew && <b>NEW!</b>}{nameOf(pull)}{pull.category && <em>{pull.category}</em>}
      </div>
      <div className={cn("pet-spot-hint", canGo && "is-on")}>Click to continue</div>
      {confetti.map((c, i) => <i key={i} className="pet-confetti" style={{ left: `${c.x}%`, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s`, width: c.w, height: c.w * 1.6, background: c.c, rotate: `${c.r}deg` }} />)}
    </div>,
    document.body,
  )
}

// A few notes when something good comes out, if the board's sound is on:
// rising, longer and brighter the rarer it is.
function fanfare(level: 1 | 2 | 3, isTell = false) {
  if (sound.get() !== "on") return
  try {
    const ctx = new AudioContext()
    const notes = isTell ? [392, 466, 523] : level === 1 ? [659, 880] : level === 2 ? [523, 659, 784, 1047] : [523, 659, 784, 1047, 1319, 1568]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = level === 3 ? "triangle" : "sine"
      o.frequency.value = f
      const t = ctx.currentTime + i * (isTell ? 0.28 : 0.09)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.12, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t + (i === notes.length - 1 ? 0.9 : 0.25))
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 1)
    })
    setTimeout(() => void ctx.close(), 2500)
  } catch {
    // no sound, no matter
  }
}

// ---------- collection ----------

const PAGE = 60

function Collection({ state }: { state: Pets }) {
  const all = catalog.use()
  const [only, setOnly] = useState<Rarity | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [isMine, setMine] = useState(false)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const owned = state.owned
  const list = useMemo(() => {
    const words = q.trim().toLowerCase()
    const has = (id: string) => (owned[id] ?? 0) > 0
    return (all ?? [])
      .filter(p => (!only || p.rarity === only) && (!kind || p.category === kind) && (!isMine || has(p.id)))
      .filter(p => !words || (has(p.id) && p.name.toLowerCase().includes(words))) // a name shows once it is yours
      .sort((a, b) => Number(has(b.id)) - Number(has(a.id)) || RANK[b.rarity] - RANK[a.rarity])
  }, [all, only, kind, isMine, q, owned])
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const at = Math.min(page, pages)
  const countOf = (r: Rarity) => {
    const of = (all ?? []).filter(p => p.rarity === r)
    return `${of.filter(p => owned[p.id]).length}/${of.length}`
  }
  const filter = <T,>(set: (v: T) => void) => (v: T) => (set(v), setPage(1))
  const classic = Object.keys(owned).filter(id => !isCommunity(id) && owned[id])
  if (!all) return <div className="flex flex-col items-center gap-2 py-16 text-[13px] text-text-muted"><Spinner />Reading the catalogue of codex-pets.net…</div>
  return (
    <div className="pets-still flex flex-col gap-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={chip(!only)} onClick={() => filter(setOnly)(null)}>All</button>
        {RARITIES.map(r => (
          <button key={r} className={chip(only === r)} onClick={() => filter(setOnly)(only === r ? null : r)}>
            <i className="size-2 rounded-full" style={{ background: RARITY_COLOR[r] }} />{RARITY_NAME[r]}<span className="text-faint tabular-nums">{countOf(r)}</span>
          </button>
        ))}
        {state.active && <Button variant="outline" className="ml-auto h-7 text-[12px]" onClick={() => void choosePet(null)}>Put {petName(state.active)} away</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map(c => <button key={c} className={chip(kind === c)} onClick={() => filter(setKind)(kind === c ? null : c)}>{c}</button>)}
        <button className={chip(isMine)} onClick={() => filter(setMine)(!isMine)}>Only mine</button>
        <label className="ml-auto flex h-7 w-[200px] items-center gap-1.5 rounded-full border border-line px-2.5 focus-within:border-brand">
          <Search className="size-3 shrink-0 text-faint" />
          <input value={q} onChange={e => filter(setQ)(e.target.value)} placeholder="Find one of yours" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
        </label>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
        {list.slice((at - 1) * PAGE, at * PAGE).map(p => {
          const count = owned[p.id] ?? 0
          const isOut = state.active === p.id
          const isHome = state.community.some(c => `community:${c.id}` === p.id)
          return (
            <button key={p.id} disabled={!count} onClick={() => void choosePet(isOut ? null : p.id)}
              title={count ? (isOut ? "On the board. Click to put it away" : "Take it out on the board") : `${RARITY_NAME[p.rarity]} · ${p.category}: not found yet, it comes out of a pack`}
              className={cn("relative flex flex-col items-center overflow-hidden rounded-[10px] border bg-surface px-1 pt-2 pb-1.5 transition-[transform,border-color] duration-150",
                count ? "border-line hover:-translate-y-0.5 hover:border-[var(--rarity)]" : "cursor-default border-dashed border-line",
                isOut && "border-[var(--rarity)] shadow-[0_0_0_2px_var(--rarity)]", count > 0 && p.rarity === "legendary" && "coll-legend")}
              style={{ "--rarity": RARITY_COLOR[p.rarity] } as React.CSSProperties}>
              <i className="absolute top-1.5 left-1.5 z-[1] size-2 rounded-full" style={{ background: RARITY_COLOR[p.rarity], opacity: count ? 1 : 0.45 }} />
              {count > 1 && <span className="absolute top-1 right-1.5 z-[1] text-[10.5px] font-semibold text-text-muted tabular-nums">×{count}</span>}
              {count > 0 && isHome ? <PetArt id={p.id} size={70} /> : (
                <img src={p.poster} alt="" loading="lazy" className={cn("h-[70px] w-[70px] object-contain", !count && "pet-shadow-img")} />
              )}
              <span className={cn("mt-0.5 w-full truncate text-center text-[11.5px]", count ? "font-medium text-text" : "text-faint")}>{count ? p.name : "???"}</span>
              <span className="text-[9.5px] text-faint">{p.category}</span>
              {isOut && <span className="text-[10px] font-semibold text-brand">On the board</span>}
            </button>
          )
        })}
      </div>
      {list.length === 0 && <p className="m-0 py-8 text-center text-[13px] text-text-muted">{q ? "None of yours goes by that name." : "Nothing here yet."}</p>}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="outline" className="h-7" disabled={at <= 1} onClick={() => setPage(at - 1)}><ChevronLeft className="size-3.5" /></Button>
          <span className="text-[12px] text-text-muted tabular-nums">Page {at} of {pages}</span>
          <Button variant="outline" className="h-7" disabled={at >= pages} onClick={() => setPage(at + 1)}><ChevronRight className="size-3.5" /></Button>
        </div>
      )}
      {classic.length > 0 && (
        <>
          <div className="mt-2 text-[11px] font-semibold tracking-[0.05em] text-faint uppercase">Your first pets</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {classic.map(id => {
              const isOut = state.active === id
              return (
                <button key={id} onClick={() => void choosePet(isOut ? null : id)}
                  className={cn("relative flex flex-col items-center rounded-[10px] border border-line bg-surface px-1 pt-2 pb-1.5 hover:-translate-y-0.5", isOut && "shadow-[0_0_0_2px_var(--rarity)]")}
                  style={{ "--rarity": RARITY_COLOR[rarityOf(state, id)] } as React.CSSProperties}>
                  <PetArt id={id} size={64} />
                  <span className="mt-0.5 w-full truncate text-center text-[11.5px] font-medium">{petName(id)}</span>
                  {isOut && <span className="text-[10px] font-semibold text-brand">On the board</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

const chip = (on: boolean) =>
  cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium", on ? "border-brand bg-brand-soft text-text" : "border-line text-text-muted hover:text-text")
