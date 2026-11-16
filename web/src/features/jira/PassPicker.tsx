// The passes of a stage, in one control: "Pass 2 of 3", and every pass a
// click away, each with its day and why it ran (or why it failed).
import { AlertTriangle, ChevronDown, CircleCheck, CircleDashed } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// at: when it started (none: one still to come, as the release at the door).
export type Pass = { key: number; at: number | null; isFailed?: boolean; why?: string | null }

const day = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
const nameOf = (pass: Pass, i: number) => (pass.at === null ? "Next" : `Pass ${i + 1}`)

export function PassPicker({ passes, picked, onPick }: { passes: Pass[]; picked: number; onPick: (key: number) => void }) {
  const i = Math.max(0, passes.findIndex(p => p.key === picked))
  const counted = passes.filter(p => p.at !== null).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-text-muted transition-colors duration-120 hover:bg-hover hover:text-text">
          {passes[i]!.at === null ? "Next" : `Pass ${i + 1} of ${counted}`}<ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        {passes.map((p, j) => {
          const Icon = p.at === null ? CircleDashed : p.isFailed ? AlertTriangle : CircleCheck
          return (
            <DropdownMenuItem key={p.key} onSelect={() => onPick(p.key)} className={cn("grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-x-2", j === i && "bg-hover")}>
              <Icon size={12} className={cn("translate-y-[2px]", p.isFailed ? "text-bad" : p.at === null ? "text-faint" : "text-work")} />
              <span className="text-[12.5px]">{nameOf(p, j)}</span>
              <span className="text-[11.5px] text-faint tabular-nums">{p.at === null ? "" : day(p.at)}</span>
              {p.why && <span className="col-start-2 col-end-4 truncate text-[11.5px] text-faint">{p.why}</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
