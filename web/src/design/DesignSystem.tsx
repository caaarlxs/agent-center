// Agent Center's design system, on free components only: shadcn/ui (MIT),
// AI Elements (Apache-2.0), React Flow (MIT), Motion (MIT), Lucide (ISC).
// One page with every piece the board needs, with made-up data.
import { Bell, Check, Command as CommandIcon, Folder, Inbox, LayoutGrid, Plus, Search, Settings, Sun } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Toaster } from "@/components/ui/sonner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CanvasDemo } from "./canvas"
import { ChatPanel } from "./chat"
import { SESSIONS } from "./data"
import { STATES, SessionCard, StateIcon } from "./session"

const SECTIONS = ["Foundations", "Primitives", "Sessions", "Conversation", "Canvas", "Navigation"]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 space-y-5 border-t border-border/60 pt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-12 w-24 rounded-lg border ${className}`} />
      <div className="text-xs text-muted-foreground">{name}</div>
    </div>
  )
}

// A bell that rings: the one animated icon, for "a session asks you".
function RingingBell() {
  return (
    <motion.span className="inline-grid text-amber-400" animate={{ rotate: [0, -14, 12, -8, 5, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.4, ease: "easeOut" }} style={{ transformOrigin: "50% 10%" }}>
      <Bell className="size-5" />
    </motion.span>
  )
}

const NAV = [
  { icon: Inbox, label: "Inbox", n: "3" },
  { icon: LayoutGrid, label: "Canvas", n: "" },
  { icon: Folder, label: "Repos", n: "" },
]

export function DesignSystem() {
  const [isDark, setDark] = useState(true)
  const [isPalette, setPalette] = useState(false)
  useEffect(() => void document.documentElement.classList.toggle("dark", isDark), [isDark])
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), setPalette(p => !p))
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-6 border-b bg-background/80 px-8 backdrop-blur">
          <b className="flex items-center gap-2"><i className="size-4 rounded bg-gradient-to-br from-orange-500 to-amber-300" />Agent Center · Design system</b>
          <nav className="flex gap-4 text-sm text-muted-foreground">{SECTIONS.map(s => <a key={s} href={`#${s}`} className="hover:text-foreground">{s}</a>)}</nav>
          <span className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPalette(true)}><Search />Search<Kbd>⌘K</Kbd></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setDark(d => !d)}><Sun /></Button>
          </span>
        </header>

        <main className="mx-auto max-w-6xl space-y-12 px-8 py-10">
          <Section id="Foundations" title="Foundations">
            <div className="flex flex-wrap gap-4">
              <Swatch name="background" className="bg-background" />
              <Swatch name="card" className="bg-card" />
              <Swatch name="muted" className="bg-muted" />
              <Swatch name="brand" className="bg-orange-500" />
              <Swatch name="asking" className="bg-amber-400" />
              <Swatch name="approval" className="bg-rose-400" />
              <Swatch name="review" className="bg-sky-400" />
              <Swatch name="working" className="bg-emerald-400" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-semibold tracking-tight">Title 24 · Geist</p>
              <p className="text-base font-medium">Heading 16</p>
              <p className="text-sm">Body 14 — what a session did, in one line.</p>
              <p className="text-xs text-muted-foreground">Caption 12 · repo · 2 min</p>
              <p className="font-mono text-xs">Mono 12 · feat/request-logging</p>
            </div>
          </Section>

          <Section id="Primitives" title="Primitives">
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-orange-500 text-white hover:bg-orange-500/90"><Plus />New session<Kbd className="bg-white/20 text-white">N</Kbd></Button>
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Archive</Button>
              <Button size="sm" variant="outline"><Check />Done</Button>
              <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost"><Settings /></Button></TooltipTrigger><TooltipContent>Setup</TooltipContent></Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(STATES).map(([k, v]) => <Badge key={k} variant="outline" className="gap-1.5"><v.icon className="size-3" />{v.label}</Badge>)}
              <Badge className="bg-orange-500 text-white">3 new</Badge>
              <RingingBell />
            </div>
            <div className="grid max-w-3xl grid-cols-2 gap-6">
              <div className="space-y-3">
                <ToggleGroup type="single" defaultValue="lines" variant="outline" size="sm">
                  <ToggleGroupItem value="lines">Lines</ToggleGroupItem>
                  <ToggleGroupItem value="side">Side by side</ToggleGroupItem>
                </ToggleGroup>
                <label className="flex items-center gap-3 text-sm"><Switch defaultChecked />Read aloud</label>
                <Slider defaultValue={[190]} min={120} max={300} step={10} className="w-48" />
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5 text-xs text-muted-foreground"><div className="flex justify-between"><span>5 hours</span><span>19%</span></div><Progress value={19} /></div>
                <div className="space-y-1.5 text-xs text-muted-foreground"><div className="flex justify-between"><span>Week</span><span className="text-amber-400">72%</span></div><Progress value={72} className="[&>*]:bg-amber-400" /></div>
                <div className="flex gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-20" /></div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => toast("Message sent", { action: { label: "Undo", onClick: () => {} } })}>Toast</Button>
              <Dialog>
                <DialogTrigger asChild><Button variant="outline">Dialog</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New session</DialogTitle><DialogDescription>Folder, prompt and mode.</DialogDescription></DialogHeader>
                  <div className="h-24 rounded-lg border border-dashed" />
                  <DialogFooter><Button variant="outline">Cancel</Button><Button className="bg-orange-500 text-white">Start</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Section>

          <Section id="Sessions" title="Sessions">
            <div className="flex flex-wrap items-center gap-4">{SESSIONS.slice(0, 7).map(s => <span key={s.id} className="flex items-center gap-2 text-sm"><StateIcon session={s} />{STATES[s.state].label}</span>)}</div>
            <p className="text-sm text-muted-foreground">One card, three zoom levels: near, mid, far. Rest the mouse on a card for its preview.</p>
            <div className="flex flex-wrap items-start gap-4">
              <SessionCard session={SESSIONS[0]} level="near" />
              <SessionCard session={SESSIONS[0]} level="mid" />
              <SessionCard session={SESSIONS[0]} level="far" />
            </div>
            <div className="flex flex-wrap items-start gap-4">
              {SESSIONS.slice(1).map(s => <SessionCard key={s.id} session={s} />)}
            </div>
          </Section>

          <Section id="Conversation" title="Conversation">
            <ChatPanel />
          </Section>

          <Section id="Canvas" title="Canvas">
            <p className="text-sm text-muted-foreground">Pinch or ⌘-scroll to zoom: the cards change with the zoom. Drag the empty canvas to pan.</p>
            <CanvasDemo />
          </Section>

          <Section id="Navigation" title="Navigation">
            <aside className="flex w-60 flex-col gap-1 rounded-xl border bg-sidebar p-2 text-sm">
              <Button className="mb-2 justify-start bg-orange-500 text-white"><Plus />New session</Button>
              {NAV.map(({ icon: Icon, label, n }) => (
                <button key={label} className="flex h-8 items-center gap-2.5 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Icon className="size-4" />{label}{n && <span className="ml-auto text-xs font-semibold text-orange-400">{n}</span>}
                </button>
              ))}
            </aside>
          </Section>
        </main>

        <CommandDialog open={isPalette} onOpenChange={setPalette}>
          <Command>
          <CommandInput placeholder="Search every conversation…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Sessions">
              {SESSIONS.slice(0, 5).map(s => <CommandItem key={s.id}><StateIcon session={s} size={18} />{s.title}<span className="ml-auto text-xs text-muted-foreground">{s.repo}</span></CommandItem>)}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem><Plus />New session<CommandShortcut>N</CommandShortcut></CommandItem>
              <CommandItem><CommandIcon />Next up<CommandShortcut>F</CommandShortcut></CommandItem>
            </CommandGroup>
          </CommandList>
          </Command>
        </CommandDialog>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
