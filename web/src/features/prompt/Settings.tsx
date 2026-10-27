// The session's permission mode, model and effort (composer.js Picker): a
// quiet pill with its icon, value and a chevron that turns; its menu opens
// upward with each option's hint and a check on the current one. A change
// waits for the session's mod with a blinking amber dot.
import { Bot, Check, ChevronDown, Gauge, Lock } from "lucide-react"
import type { ReactNode } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type Option = readonly [value: string, label: string, hint?: string]

export const MODES: readonly Option[] = [
  ["default", "Ask", "Asks for approval before each risky action"],
  ["acceptEdits", "Accept edits", "Edits files without asking; asks for the rest"],
  ["plan", "Plan", "Only researches and proposes a plan; changes nothing"],
  ["auto", "Auto", "A classifier decides what to allow without asking you"],
  ["bypassPermissions", "Bypass permissions", "Asks nothing: use it with care"],
]
export const MODELS: readonly Option[] = [
  ["claude-fable-5-1", "Fable 5.1", "The most capable"],
  ["claude-opus-5-5", "Opus 5.5", "Very capable, for complex work"],
  ["claude-sonnet-5-5", "Sonnet 5.5", "Fast and capable"],
  ["claude-haiku-5-5", "Haiku 5.5", "The fastest and cheapest"],
]
export const EFFORTS: readonly Option[] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]]
export const modelKey = (model: string | null | undefined) => MODELS.find(([id]) => model?.startsWith(id))?.[0] ?? model ?? ""

const ICONS = { mode: <Lock />, model: <Bot />, effort: <Gauge /> }
export const pill = "inline-flex h-[30px] items-center gap-[5px] rounded-md pr-1.5 pl-2 text-xs text-text-muted transition-colors [&_svg]:size-[13px] [&_svg]:shrink-0"

export function Pick({ icon, value, options, placeholder, title, isDisabled, isWaiting, onPick }: {
  icon?: keyof typeof ICONS; value: string | undefined; options: readonly Option[]; placeholder?: string; title?: string; isDisabled?: boolean; isWaiting?: boolean; onPick: (v: string) => void
}) {
  // A value the list does not know (a newer model) still shows, first.
  const list = value && !options.some(([v]) => v === value) ? [[value, value] as Option, ...options] : options
  const current = list.find(([v]) => v === value)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={isDisabled}>
        <button type="button" title={title}
          className={cn(pill, "group/pick cursor-pointer hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-55 aria-expanded:bg-hover aria-expanded:text-text")}>
          {icon && ICONS[icon]}
          <span className="font-[550] whitespace-nowrap text-text">{current?.[1] ?? value ?? placeholder ?? "—"}</span>
          <ChevronDown className="size-[11px]! text-faint transition-transform duration-150 ease-(--ease-out) group-aria-expanded/pick:rotate-180" />
          {isWaiting && <i className="blink mr-1 size-1.5 rounded-full bg-ask" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="min-w-[250px] rounded-[10px] border-line bg-raised p-[5px] shadow-pop">
        {list.map(([v, label, hint]) => (
          <DropdownMenuItem key={v} role="menuitemradio" aria-checked={v === value} onSelect={() => v !== value && onPick(v)}
            className={cn("items-center justify-between gap-3 rounded-md px-[9px] py-[7px]", v === value && "bg-brand-soft focus:bg-brand-soft")}>
            <span className="flex min-w-0 flex-col gap-px"><b className="text-[13px] font-semibold">{label}</b>{hint && <span className="text-[11.5px] text-text-muted">{hint}</span>}</span>
            {v === value && <Check className="size-[13px] text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Effort only shows: Claude desktop sends its own with every message.
export function ReadOnly({ icon, value, title }: { icon: keyof typeof ICONS; value: ReactNode; title: string }) {
  return <span className={cn(pill, "pr-[9px]")} title={title}>{ICONS[icon]}<span className="font-[550] text-text-muted">{value}</span></span>
}
