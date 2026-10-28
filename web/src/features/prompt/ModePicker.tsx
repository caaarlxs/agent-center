// The permission mode as a quiet pill that names the current one (its icon
// and name), opening the list of modes with what each does; the current one
// is marked. A change that waits for the session blinks amber on the pill.
import { Check, ChevronDown, ClipboardList, FilePen, Hand, ShieldOff, Sparkles } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { MODES, pill } from "./Settings"

const ICON: Record<string, typeof Hand> = { default: Hand, acceptEdits: FilePen, plan: ClipboardList, auto: Sparkles, bypassPermissions: ShieldOff }

export function ModePicker({ value, isDisabled, isWaiting, disabledTip, onPick }: {
  value: string | null | undefined; isDisabled?: boolean; isWaiting?: boolean; disabledTip?: string; onPick: (mode: string) => void
}) {
  const current = MODES.find(([m]) => m === value)
  const Icon = (value && ICON[value]) || Hand
  const label = current?.[1] ?? value ?? "Mode"
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={isDisabled}>
        <button type="button" aria-label="Permission mode" title={isDisabled && disabledTip ? disabledTip : current ? `Permission mode: ${current[1]}` : "Permission mode"}
          className={cn(pill, "group/mode min-w-0 cursor-pointer hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-55 aria-expanded:bg-hover aria-expanded:text-text")}>
          <Icon />
          {/* A long name (Bypass permissions) ends in "…" and gives way first: the bar keeps to its box. */}
          <span className="max-w-[13ch] min-w-0 truncate font-[550] text-text">{label}</span>
          <ChevronDown className="size-[11px]! text-faint transition-transform duration-150 ease-(--ease-out) group-aria-expanded/mode:rotate-180" />
          {isWaiting && <i className="blink mr-1 size-1.5 rounded-full bg-ask" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="min-w-[260px] rounded-[10px] border-line bg-raised p-[5px] shadow-pop">
        {MODES.map(([mode, name, hint]) => {
          const ItemIcon = ICON[mode] ?? Hand
          const isOn = mode === value
          return (
            <DropdownMenuItem key={mode} role="menuitemradio" aria-checked={isOn} onSelect={() => !isOn && onPick(mode)}
              className={cn("items-center gap-2.5 rounded-md px-[9px] py-[7px]", isOn && "bg-brand-soft focus:bg-brand-soft")}>
              <ItemIcon className={cn("size-[14px] shrink-0", isOn ? "text-brand" : "text-text-muted")} />
              <span className="flex min-w-0 flex-1 flex-col gap-px"><b className="text-[13px] font-semibold">{name}</b><span className="text-[11.5px] text-text-muted">{hint}</span></span>
              {isOn && <Check className="size-[13px] shrink-0 text-brand" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
