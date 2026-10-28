// Model and effort in one pill ("High · Fable 5.1") that opens a small card:
// the effort's name in the brand colour, the model under it (› opens the
// list, each with what it is good at), and the effort as a stepped slider.
// New session sets both and can go back to the defaults; an open session
// changes only its model, as Claude desktop sends its own effort with every
// message. The card opens with a short spring (Animate UI's Popover).
import { Check, ChevronDown, ChevronLeft, ChevronRight, Gauge } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { Popover } from "@animate-ui/react/primitives/radix-ui"
import { Anim } from "@/components/icons/animated"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { EffortSlider } from "./EffortSlider"
import { EFFORTS, MODELS, type Option, pill } from "./Settings"

const OPEN = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const
const SWAP = { duration: 0.16, ease: [0.23, 1, 0.32, 1] } as const

type Props = {
  model: string; effort: string | null | undefined; title: string
  defaults?: { model: string; effort: string } // New session: what Reset goes back to
  isEffortLocked?: boolean; isDisabled?: boolean; isWaiting?: boolean
  // What the slider says on hover: why it cannot move, or what moving it does.
  lockedTip?: string; effortTip?: string
  onModel: (model: string) => void; onEffort?: (effort: string) => void
}

const labelOf = (list: readonly Option[], value: string | null | undefined) => list.find(([v]) => v === value)?.[1] ?? value ?? undefined

export function ModelEffort({ model, effort, title, defaults, isEffortLocked, isDisabled, isWaiting, lockedTip, effortTip, onModel, onEffort }: Props) {
  const [isOpen, setOpen] = useState(false)
  const [view, setView] = useState<"main" | "models">("main")
  const step = EFFORTS.findIndex(([e]) => e === effort)
  const effortLabel = labelOf(EFFORTS, effort)
  const modelLabel = labelOf(MODELS, model) ?? "Model"
  // A model the list does not know (a newer one) still shows, first.
  const models = model && !MODELS.some(([m]) => m === model) ? [[model, model] as Option, ...MODELS] : MODELS
  const isDefault = !!defaults && defaults.model === model && defaults.effort === effort
  const slider = <EffortSlider step={step} labels={EFFORTS.map(([, l]) => l)} isLocked={isEffortLocked} onStep={i => onEffort?.(EFFORTS[i][0])} />
  return (
    <Popover.Root open={isOpen} onOpenChange={o => (setOpen(o), o || setView("main"))}>
      <Popover.Trigger asChild disabled={isDisabled}>
        <button type="button" title={title}
          className={cn(pill, "group/pick cursor-pointer hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-55 aria-expanded:bg-hover aria-expanded:text-text")}>
          <Gauge />
          <span className="font-[550] whitespace-nowrap text-text">{effortLabel ? `${effortLabel} · ${modelLabel}` : modelLabel}</span>
          <ChevronDown className="size-[11px]! text-faint transition-transform duration-150 ease-(--ease-out) group-aria-expanded/pick:rotate-180" />
          {isWaiting && <i className="blink mr-1 size-1.5 rounded-full bg-ask" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} transition={OPEN}
          className="z-50 w-[272px] overflow-hidden rounded-2xl border border-line bg-raised text-text shadow-pop outline-none">
          <AnimatePresence mode="popLayout" initial={false}>
            {view === "main" ? (
              <motion.div key="main" className="flex flex-col gap-3 p-3" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={SWAP}>
                <div className="flex items-center justify-between text-text-muted">
                  <Gauge className="size-4" />
                  {defaults && (
                    <button type="button" disabled={isDefault} onClick={() => (onModel(defaults.model), onEffort?.(defaults.effort))} title="Back to the defaults" aria-label="Back to the defaults"
                      className="inline-grid size-7 place-items-center rounded-md hover:bg-hover hover:text-text disabled:opacity-35 disabled:hover:bg-transparent">
                      <Anim.RotateCcw size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <b className="text-[17px] font-[650] tracking-[-0.01em] text-brand">{effortLabel ?? "—"}</b>
                  <button type="button" onClick={() => setView("models")}
                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[13px] text-text-muted hover:bg-hover hover:text-text">
                    {modelLabel}<ChevronRight className="size-3.5" />
                  </button>
                </div>
                {(isEffortLocked ? lockedTip : effortTip) ? (
                  <Tooltip><TooltipTrigger asChild><div>{slider}</div></TooltipTrigger><TooltipContent className="max-w-[260px]">{isEffortLocked ? lockedTip : effortTip}</TooltipContent></Tooltip>
                ) : slider}
              </motion.div>
            ) : (
              <motion.div key="models" className="flex flex-col p-[5px]" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={SWAP}>
                <button type="button" onClick={() => setView("main")}
                  className="mb-0.5 inline-flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-semibold text-text-muted hover:bg-hover hover:text-text">
                  <ChevronLeft className="size-3.5" />Model
                </button>
                <div role="radiogroup" aria-label="Model" className="flex flex-col">
                  {models.map(([v, label, hint]) => (
                    <button key={v} type="button" role="radio" aria-checked={v === model} onClick={() => (v !== model && onModel(v), setView("main"))}
                      className={cn("flex items-center justify-between gap-3 rounded-md px-[9px] py-[7px] text-left hover:bg-hover", v === model && "bg-brand-soft hover:bg-brand-soft")}>
                      <span className="flex min-w-0 flex-col gap-px"><b className="text-[13px] font-semibold">{label}</b>{hint && <span className="text-[11.5px] text-text-muted">{hint}</span>}</span>
                      {v === model && <Check className="size-[13px] shrink-0 text-brand" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
