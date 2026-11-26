// What a ticket's tabs read besides its state (Pipeline.tsx provides it; a job's
// dialog has none): what GitHub says of each PR now and what an agent did on its
// conflicts (and how to hand them to one), the test data a test made, the
// ticket's comments in Jira (your answers from before the board kept them),
// the code debt its runs saw, the guide to your part (and how to load it again), and
// what you left for later in each environment (and what you do with it).
import { createContext, useContext } from "react"
import type { DebtEntry } from "@server/debt"
import type { Env, LaterItem, PrFix, StepScripts, yourPartOf } from "@server/pipeline"
import type { PrState, Scenario } from "@server/stage-extras"

export type YourPartInfo = Awaited<ReturnType<typeof yourPartOf>>
// What each environment lacks that you skipped there (null while something runs).
export type Later = Record<Env, LaterItem[]> | null
export type StageData = { prs: Record<string, PrState>; fixes: Record<string, PrFix>; onResolve: ((url: string) => void) | null; onReady: ((url: string) => void) | null; scenario: Scenario | null; comments: { body: string }[]; debt: DebtEntry[]; yourPart: YourPartInfo; reload: (() => void) | null; later: Later; onLater: ((env: Env, keys: string[], action: "deploy" | "leave") => void) | null; steps: StepScripts | null }
export const StageDataContext = createContext<StageData>({ prs: {}, fixes: {}, onResolve: null, onReady: null, scenario: null, comments: [], debt: [], yourPart: null, reload: null, later: null, onLater: null, steps: null })
export const useStageData = () => useContext(StageDataContext)
