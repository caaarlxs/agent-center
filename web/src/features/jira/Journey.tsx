// The stages of a ticket at a glance (journeyOf): a node each, its state in
// its colour and icon, and the one fact it left ("4 PRs", "1 minor"). A click
// picks the stage the section shows below.
import { AlertTriangle, Check, Eye, Hammer, ListTree, Lightbulb, Rocket, Server, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stage } from "@server/pipeline"
import { STAGES, type JourneyNode, type Tone } from "./pipeline-board"

const ICON: Record<Stage, LucideIcon> = { refine: Lightbulb, plan: ListTree, build: Hammer, review: Eye, staging: Server, prod: Rocket }
const DOT: Record<Tone, string> = {
  done: "bg-work-soft text-work",
  work: "bg-work-soft text-work ring-1 ring-work",
  ask: "bg-ask-soft text-ask ring-1 ring-ask",
  bad: "bg-bad-soft text-bad ring-1 ring-bad",
  next: "border border-dashed border-text-muted text-text-muted",
  todo: "text-faint bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]",
}

function Node({ node, name, isPicked, onPick }: { node: JourneyNode; name: string; isPicked: boolean; onPick: () => void }) {
  const Icon = node.tone === "done" ? Check : node.tone === "bad" ? AlertTriangle : ICON[node.stage]
  return (
    <button onClick={onPick} aria-pressed={isPicked}
      className={cn("flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-[10px] px-1 pt-2 pb-1.5 transition-colors duration-120",
        isPicked ? "bg-surface shadow-[0_0_0_1px_var(--line)]" : "hover:bg-hover")}>
      <span className={cn("grid size-8 place-items-center rounded-full", DOT[node.tone], node.tone === "work" && "animate-pulse")}>
        <Icon size={15} strokeWidth={node.tone === "done" ? 2.6 : 2} />
      </span>
      <span className={cn("text-[12.5px] leading-none", node.tone === "todo" ? "text-faint" : "font-semibold text-text")}>{name}</span>
      <span className={cn("h-[14px] truncate text-[11px] leading-[14px] tabular-nums", node.tone === "ask" ? "font-semibold text-ask" : node.tone === "bad" ? "text-bad" : "text-faint")}>{node.fact ?? ""}</span>
    </button>
  )
}

export function Journey({ nodes, picked, onPick }: { nodes: JourneyNode[]; picked: Stage; onPick: (stage: Stage) => void }) {
  return (
    <ol className="m-0 flex list-none items-start p-0">
      {nodes.map((n, i) => (
        <li key={n.stage} className="flex min-w-0 flex-1 items-start">
          {i > 0 && <i className={cn("mt-[25px] h-px w-2 shrink-0", nodes[i - 1]!.tone === "done" ? "bg-work" : "bg-line-strong")} />}
          <Node node={n} name={STAGES[i]!} isPicked={picked === n.stage} onPick={() => onPick(n.stage)} />
        </li>
      ))}
    </ol>
  )
}
