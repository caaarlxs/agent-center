// What you skipped in a release to an environment and it still lacks (lib/pipeline.ts laterItems),
// once nothing runs. Code first (what each unit delivers, its repo and PR, what GitHub says of the
// PR, and what the release would do), then what is yours to do (its title in Your part, and when).
// Tick what goes now and deploy only that, or leave it out of that environment for good (it asks
// twice). What you do not tick stays here.
import { ChevronRight, Database, GitMerge, Hand, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { Env, LaterItem } from "@server/pipeline"
import type { PrState } from "@server/stage-extras"
import { useStageData } from "./stage-data"
import { useConfirm } from "./confirm"

const KIND: Record<LaterItem["kind"], { icon: LucideIcon; group: string }> = {
  code: { icon: GitMerge, group: "Code" }, script: { icon: Database, group: "Scripts on the data" }, yours: { icon: Hand, group: "By you" },
}
const ORDER: LaterItem["kind"][] = ["code", "script", "yours"]

// What GitHub says of the PR now, when it changes what you would do.
function prNote(pr: PrState | undefined) {
  if (!pr) return null
  if (pr.state === "CLOSED") return { text: "Closed on GitHub", isBad: true }
  if (pr.state === "MERGED") return { text: "Merged already", isBad: false }
  const said = pr.comments ? `${pr.comments} comment${pr.comments === 1 ? "" : "s"} since its last commit` : null
  return said || pr.isConflicting ? { text: [pr.isConflicting && "in conflict", said].filter(Boolean).join(" · "), isBad: false } : null
}

function Item({ item, isPicked, onToggle }: { item: LaterItem; isPicked: boolean; onToggle: () => void }) {
  const { prs } = useStageData()
  const [isOpen, setOpen] = useState(false)
  const { icon: Icon } = KIND[item.kind]
  const note = item.pr ? prNote(prs[item.pr]) : null
  return (
    <li className="grid grid-cols-[16px_14px_minmax(0,1fr)] items-baseline gap-x-2 py-1.5">
      <input type="checkbox" className="translate-y-[2px] accent-brand" checked={isPicked} onChange={onToggle} aria-label={item.title} />
      <Icon size={13} className={cn("translate-y-[2px]", item.kind === "yours" ? "text-ask" : "text-faint")} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <button className="text-left text-[13px] leading-[1.45] font-semibold text-text" onClick={onToggle}>{item.title}</button>
        <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-muted">
          {item.repo && <span className="font-mono text-[11.5px]">{item.repo}</span>}
          {item.pr && <a href={item.pr} target="_blank" rel="noreferrer" className="font-semibold text-brand no-underline hover:underline">PR #{item.pr.split("/").pop()}</a>}
          {note && <span className={cn("font-semibold", note.isBad ? "text-bad" : "text-ask")}>{note.text}</span>}
          {item.when && <span>{item.when}</span>}
        </span>
        {item.kind === "yours" ? (
          <>
            <button className="inline-flex items-center gap-1 self-start text-[11.5px] font-semibold text-faint hover:text-text" onClick={() => setOpen(o => !o)}>
              <ChevronRight size={11} className={cn("transition-transform duration-150", isOpen && "rotate-90")} />The step
            </button>
            {isOpen && <p className="m-0 text-xs leading-[1.5] text-text-muted">{item.does[0]}</p>}
          </>
        ) : (
          <span className="text-xs text-faint">{item.does.join(" · ")}</span>
        )}
      </div>
    </li>
  )
}

export function LeftForLater({ env }: { env: Env }) {
  const { later, onLater } = useStageData()
  const [chosen, setChosen] = useState<string[]>([])
  const [isAsking, confirm] = useConfirm()
  const items = later?.[env] ?? []
  if (!items.length || !onLater) return null
  const picked = chosen.filter(k => items.some(i => i.key === k))
  const toggle = (key: string) => setChosen(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]))
  const act = (action: "deploy" | "leave") => (setChosen([]), onLater(env, picked, action))
  const count = picked.length ? ` (${picked.length})` : ""
  return (
    <section className="flex flex-col gap-2.5 rounded-[8px] bg-ask-soft px-3 py-2.5">
      <h4 className="m-0 text-[13px] font-semibold text-text">Not in {env} yet <span className="font-normal text-text-muted">· {items.length} you skipped</span></h4>
      {ORDER.filter(k => items.some(i => i.kind === k)).map(kind => (
        <div key={kind} className="flex flex-col">
          <span className="text-[11.5px] font-semibold tracking-wide text-faint uppercase">{KIND[kind].group}</span>
          <ul className="m-0 list-none p-0">
            {items.filter(i => i.kind === kind).map(i => <Item key={i.key} item={i} isPicked={picked.includes(i.key)} onToggle={() => toggle(i.key)} />)}
          </ul>
        </div>
      ))}
      <span className="flex items-center gap-3 text-xs">
        <button disabled={!picked.length} className="h-7 rounded-md bg-brand px-2.5 font-semibold text-surface disabled:opacity-40" onClick={() => act("deploy")}>Deploy to {env}{count}</button>
        <button disabled={!picked.length} className={cn("font-semibold disabled:opacity-40", isAsking ? "text-bad" : "text-faint hover:text-text")} onClick={() => confirm(() => act("leave"))}>
          {isAsking ? `Sure? Never to ${env}` : `Leave out of ${env}${count}`}
        </button>
      </span>
    </section>
  )
}
