// The permission mode as a row of small square toggles, one per mode and
// exactly one on (a radio group: the arrows move and pick, Tab leaves). Each
// says its name and what it does in a tooltip; the one on is filled in the
// brand colour. A change that waits for the session blinks amber on it.
import { ClipboardList, FilePen, Hand, ShieldOff, Sparkles } from "lucide-react"
import { useRef } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MODES } from "./Settings"

const ICON: Record<string, typeof Hand> = { default: Hand, acceptEdits: FilePen, plan: ClipboardList, auto: Sparkles, bypassPermissions: ShieldOff }
const KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function ModeToggles({ value, isDisabled, isWaiting, disabledTip, onPick }: {
  value: string | null | undefined; isDisabled?: boolean; isWaiting?: boolean; disabledTip?: string; onPick: (mode: string) => void
}) {
  const row = useRef<HTMLDivElement>(null)
  const at = Math.max(0, MODES.findIndex(([m]) => m === value))
  const move = (by: number) => {
    const next = (at + by + MODES.length) % MODES.length
    onPick(MODES[next][0])
    row.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus()
  }
  return (
    <div ref={row} role="radiogroup" aria-label="Permission mode" className="flex shrink-0 items-center gap-0.5"
      onKeyDown={e => KEYS[e.key] && !isDisabled && (e.preventDefault(), move(KEYS[e.key]))}>
      {MODES.map(([mode, label, hint], i) => {
        const Icon = ICON[mode] ?? Hand
        const isOn = mode === value
        return (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button type="button" role="radio" aria-checked={isOn} aria-label={label} tabIndex={i === at ? 0 : -1} aria-disabled={isDisabled || undefined}
                onClick={() => !isOn && !isDisabled && onPick(mode)}
                className={cn("relative inline-grid size-[26px] shrink-0 place-items-center rounded-md text-text-muted transition-[background-color,color,transform] duration-[120ms] ease-(--ease-out) active:scale-[0.92] aria-disabled:cursor-default aria-disabled:opacity-55 [&_svg]:size-[14px]",
                  isOn ? "bg-brand text-brand-text" : !isDisabled && "hover:bg-hover hover:text-text")}>
                <Icon />
                {isOn && isWaiting && <i className="blink absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-ask" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex max-w-[240px] flex-col gap-0.5">
              <b className="font-semibold">{label}</b>
              <span className="opacity-80">{isDisabled && disabledTip ? disabledTip : hint}</span>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
