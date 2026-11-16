// What a ticket's tabs read besides its state (Pipeline.tsx provides it; a job's
// dialog has none): what GitHub says of each PR now and what an agent did on its
// conflicts (and how to hand them to one), the test data a test made, the
// ticket's comments in Jira (your answers from before the board kept them),
// and the code debt its runs saw.
import { createContext, useContext } from "react"
import type { DebtEntry } from "@server/debt"
import type { PrFix } from "@server/pipeline"
import type { PrState, Scenario } from "@server/stage-extras"

export type StageData = { prs: Record<string, PrState>; fixes: Record<string, PrFix>; onResolve: ((url: string) => void) | null; onReady: ((url: string) => void) | null; scenario: Scenario | null; comments: { body: string }[]; debt: DebtEntry[] }
export const StageDataContext = createContext<StageData>({ prs: {}, fixes: {}, onResolve: null, onReady: null, scenario: null, comments: [], debt: [] })
export const useStageData = () => useContext(StageDataContext)
