// The (?) by a stage's name: what the stage is and what you can do there
// (stage-help.ts), on hover or on focus.
import { CircleHelp } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { Stage } from "@server/pipeline"
import { STAGE_HELP } from "./stage-help"

export function StageHelp({ stage, name }: { stage: Stage; name: string }) {
  const help = STAGE_HELP[stage]
  if (!help) return null
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button className="-my-1 grid size-5 place-items-center rounded-full text-faint transition-colors duration-120 hover:text-text focus-visible:text-text" aria-label={`What ${name} does`}>
          <CircleHelp size={13} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-3 normal-case tracking-normal">
        <p className="m-0 text-[13px] leading-[1.45] font-semibold text-text">{help.what}</p>
        <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-[1.45] font-normal text-text-muted">
          {help.can.map(c => <li key={c}>{c}</li>)}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}
