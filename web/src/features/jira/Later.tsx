// What you skipped in a release to an environment and it still lacks (lib/release.ts laterIn),
// once nothing runs: each item to tick, then sent there now (a release with only that) or left
// out of it for good (it asks twice). What you do not tick stays here for later.
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { Env } from "@server/pipeline"
import { useStageData } from "./stage-data"
import { useConfirm } from "./confirm"

export function LeftForLater({ env }: { env: Env }) {
  const { later, onLater } = useStageData()
  const [chosen, setChosen] = useState<string[]>([])
  const [isAsking, confirm] = useConfirm()
  const items = later?.[env] ?? []
  if (!items.length || !onLater) return null
  const picked = chosen.filter(k => items.some(i => i.key === k))
  const toggle = (key: string) => setChosen(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]))
  const act = (action: "deploy" | "leave") => (setChosen([]), onLater(env, picked, action))
  return (
    <div className="flex flex-col gap-2 rounded-[8px] border border-line px-3 py-2.5">
      <span className="text-[13px] font-semibold text-text">Left for later <span className="font-normal text-text-muted">· {items.length}</span></span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map(i => (
          <li key={i.key}>
            <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-[1.45]">
              <input type="checkbox" className="mt-[3px] accent-brand" checked={picked.includes(i.key)} onChange={() => toggle(i.key)} />
              <span className="flex min-w-0 flex-col">
                <span className="text-text">{i.title}</span>
                {i.steps.length > 1 && <span className="text-xs text-faint">{i.steps.join(" · ")}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <span className="flex items-center gap-3 text-xs">
        <button disabled={!picked.length} className="h-7 rounded-md bg-brand px-2.5 font-semibold text-surface disabled:opacity-40" onClick={() => act("deploy")}>
          Deploy to {env}{picked.length ? ` (${picked.length})` : ""}
        </button>
        <button disabled={!picked.length} className={cn("font-semibold disabled:opacity-40", isAsking ? "text-bad" : "text-faint hover:text-text")} onClick={() => confirm(() => act("leave"))}>
          {isAsking ? `Sure? Never to ${env}` : "Leave out"}
        </button>
      </span>
    </div>
  )
}
