// TEMPORARY: the 8 stage effects side by side, to tune them. Not to commit.
import { useState } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { StageEffect } from "./features/jira/StageEffect"
import type { Effect, Scene } from "./features/jira/stage-effects"
const STAGES = [["refine", "Refining: lee el ticket"], ["plan", "Planned in 3 units"], ["build", "Edit deal/ebitda.py"], ["review", "Reading the PRs"], ["staging", "Merging deal-service"], ["test", "Testing in staging"], ["prod", "Pushing tag v2.41.0"], ["smoke", "Checking prod"]] as const
const scene: Scene = { nodes: 3, marks: 2, cells: ["pass", "pass", "fail", "pass", "pass", "pass", "pass", "pass", "pass"], tracks: 2, glyphs: "deal/ebitda.py{}()[];=<>" }
function Preview() {
  const [effect, setEffect] = useState<Effect>("run")
  return (
    <div className="min-h-screen bg-bg p-6 text-text">
      <div className="mb-4 flex gap-2">{(["run", "wait", "fail", "off"] as const).map(e => <button key={e} className="rounded border border-line px-2 py-1 text-xs" onClick={() => setEffect(e)}>{e}</button>)}</div>
      <div className="grid max-w-[1100px] grid-cols-4 gap-3">
        {STAGES.map(([stage, line]) => (
          <article key={stage} className={`relative flex flex-col gap-2.5 rounded-[10px] border border-line bg-surface px-3 pt-3 pb-2.5 ${effect === "run" ? "beam" : ""}`}>
            <StageEffect stage={stage} effect={effect} scene={scene} />
            <div className="relative flex flex-col gap-2.5">
              <h3 className="m-0 line-clamp-2 text-sm leading-[1.35] font-[550]">Teaser: generar el PDF en inglés</h3>
              <span className="font-mono text-[11px] text-faint">PP-3165 · {stage}</span>
              <p className="m-0 line-clamp-2 text-[12.5px] leading-[1.45] text-text-muted">{line}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
createRoot(document.getElementById("root")!).render(<Preview />)
